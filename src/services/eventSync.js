const {AppState} = require('react-native');
const {apiRequest, profileIdForApiUrl, readCredential} = require('./digitalDelivery');
const {listSessions} = require('./sessionRepository');
const {
  activateEventConfiguration,
  activatePendingEventConfiguration,
  getSyncState,
  normalizeEventTemplate,
  recordSyncFailure,
  recordSyncOutcome,
  stageEventConfiguration,
} = require('./templateRepository');
const {loadDeviceConfig} = require('./deviceConfig');

const DEFAULT_SYNC_SETTINGS = {automatic: true, intervalSeconds: 60, downloadForOffline: true};
let syncPromise = null;
let monitor = null;

function isCustomerSessionActive(sessions) {
  return sessions.some(session => !['complete', 'cancelled'].includes(session.status));
}

function currentVersion(state) {
  const active = state?.events?.[state.activeEventId]?.syncInfo;
  return Number(active?.serverVersion || 0);
}

async function checkForUpdates() {
  const deviceConfig = await loadDeviceConfig();
  const backend = deviceConfig.backend;
  if (backend.mode === 'standalone') throw new Error('Standalone Offline Mode has no server configuration to check.');
  if (!backend.apiBaseUrl) throw new Error('Enter the API Base URL in Backend Connection settings.');
  const profileId = profileIdForApiUrl(backend.apiBaseUrl);
  const paired = await readCredential(profileId);
  if (!paired?.credential) throw new Error('Pair this kiosk with the active server before synchronizing templates.');
  const configuration = await apiRequest('/devices/configuration', {token: paired.credential});
  const cached = await getSyncState(profileId);
  const serverVersion = Number(configuration?.version || 0);
  const eventId = configuration?.eventId || null;
  const cachedEvent = eventId ? cached?.events?.[eventId] : null;
  const localVersion = Number(cachedEvent?.pending?.syncInfo?.serverVersion || cachedEvent?.syncInfo?.serverVersion || 0);
  return {
    profileId, deviceId: paired.deviceId, deviceName: paired.name || deviceConfig.backend?.deviceName || 'Registered kiosk',
    configuration, serverVersion, localVersion, eventId,
    changed: Boolean(configuration && (serverVersion > localVersion || (eventId !== cached?.activeEventId && !cachedEvent?.pending))),
    state: cached,
  };
}

async function synchronizeEvent({force = false, checkOnly = false} = {}) {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const checked = await checkForUpdates();
    if (!checked.configuration) {
      const message = 'This kiosk has no active event assignment.';
      await recordSyncOutcome(checked.profileId, {kind: 'unassigned', title: 'No active event assignment', detail: message});
      return {...checked, status: 'unassigned', message};
    }
    if (checkOnly) {
      const status = checked.changed ? 'update-available' : 'up-to-date';
      await recordSyncOutcome(checked.profileId, {kind: checked.changed ? 'update' : 'success', title: checked.changed ? 'Update available' : 'Already up to date', detail: checked.changed ? `Server configuration v${checked.serverVersion} is available.` : 'The kiosk already has the latest event configuration.'});
      return {...checked, status};
    }

    const config = checked.configuration;
    const template = normalizeEventTemplate(config.configuration, config, checked.profileId);
    const version = checked.serverVersion;
    const oldEvent = checked.state?.events?.[config.eventId];
    const cachedTemplate = oldEvent?.pending?.template || oldEvent?.template;
    const unchanged = !force && !checked.changed && cachedTemplate?.templateVersionId === template.templateVersionId;
    if (unchanged) return {...checked, status: 'up-to-date', templateCount: 1};
    const info = {
      backendProfileId: checked.profileId,
      eventId: config.eventId,
      eventName: config.eventName || '',
      serverVersion: version,
      templateVersion: template.version,
      templateVersionId: template.templateVersionId,
      syncedAt: new Date().toISOString(),
      downloadStatus: 'complete',
      failedDownloads: 0,
    };
    const configurationToSave = {...config.configuration, publishedAt: config.publishedAt || null};
    const sessions = await listSessions();
    if (isCustomerSessionActive(sessions)) {
      await stageEventConfiguration(checked.profileId, config.eventId, configurationToSave, template, info);
      return {...checked, status: 'pending-activation', templateCount: 1, message: 'Update downloaded and will activate after the current customer session.'};
    }
    await activateEventConfiguration(checked.profileId, config.eventId, configurationToSave, template, info);
    return {...checked, status: 'synced', templateCount: 1, lastSuccessfulSync: info.syncedAt};
  })();
  try {return await syncPromise;}
  catch (error) {
    const config = await loadDeviceConfig().catch(() => null);
    await recordSyncFailure(profileIdForApiUrl(config?.backend?.apiBaseUrl), error?.message).catch(() => {});
    throw error;
  }
  finally {syncPromise = null;}
}

async function activatePendingIfIdle() {
  const deviceConfig = await loadDeviceConfig();
  const profileId = profileIdForApiUrl(deviceConfig.backend?.apiBaseUrl || deviceConfig.backend?.lastProfileApiBaseUrl);
  if (isCustomerSessionActive(await listSessions())) return false;
  const state = await activatePendingEventConfiguration(profileId);
  return Boolean(state);
}

async function pollAndHandleRemoteCommand() {
  const config = await loadDeviceConfig();
  const profileId = profileIdForApiUrl(config.backend?.apiBaseUrl);
  const paired = await readCredential(profileId);
  if (!paired?.credential) return null;
  const result = await apiRequest('/devices/commands/poll', {method: 'POST', body: {}, token: paired.credential});
  const command = result?.command;
  if (!command) return null;
  let status = 'acknowledged';
  let commandResult = {};
  try {
    if (command.type === 'sync_now' || command.type === 'refresh_configuration') {
      const sync = await synchronizeEvent({force: command.type === 'sync_now'});
      commandResult = {status: sync.status, eventId: sync.eventId || null, configurationVersion: sync.serverVersion || 0};
    } else {
      status = 'failed';
      commandResult = {error: `This kiosk does not support the “${command.type}” remote command.`};
    }
  } catch (error) {
    status = 'failed';
    commandResult = {error: error?.message || 'Synchronization failed.'};
  }
  await apiRequest(`/devices/commands/${encodeURIComponent(command.id)}/ack`, {
    method: 'POST', token: paired.credential, body: {status, result: commandResult},
  });
  return {command, status, result: commandResult};
}

async function runEventSync(options) {
  return synchronizeEvent(options);
}

function startEventSyncMonitor() {
  if (monitor) return () => monitor?.stop();
  let stopped = false;
  let interval = null;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const config = await loadDeviceConfig();
      if (config.backend?.mode !== 'standalone') {
        if (config.backend?.sync?.automatic !== false) await synchronizeEvent({checkOnly: config.backend?.sync?.downloadForOffline === false});
        await pollAndHandleRemoteCommand();
      }
    } catch { /* Last good event/templates remain available offline. */ }
    finally {running = false;}
  };
  const start = async () => {
    if (interval || stopped || AppState.currentState !== 'active') return;
    await run();
    if (stopped || AppState.currentState !== 'active') return;
    const config = await loadDeviceConfig().catch(() => null);
    const configured = Number(config?.backend?.sync?.intervalSeconds || DEFAULT_SYNC_SETTINGS.intervalSeconds);
    const delay = Math.max(60, Math.min(3600, configured)) * 1000;
    interval = setInterval(run, delay);
  };
  const onAppState = state => {
    if (state === 'active') start();
    else if (interval) {clearInterval(interval); interval = null;}
  };
  const listener = AppState.addEventListener('change', onAppState);
  const stop = () => {
    stopped = true;
    if (interval) clearInterval(interval);
    interval = null;
    listener.remove();
    if (monitor?.stop === stop) monitor = null;
  };
  monitor = {stop};
  start();
  return () => monitor?.stop();
}

function restartEventSyncMonitor() {
  monitor?.stop();
  return startEventSyncMonitor();
}

module.exports = {DEFAULT_SYNC_SETTINGS, activatePendingIfIdle, checkForUpdates, currentVersion, pollAndHandleRemoteCommand, restartEventSyncMonitor, runEventSync, startEventSyncMonitor};
