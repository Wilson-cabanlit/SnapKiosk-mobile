import React, {useCallback, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import PrimaryButton from '../../components/PrimaryButton';
import {loadDeviceConfig, saveDeviceConfig, validateBackendUrl} from '../../services/deviceConfig';
import {testApiConnection, testGalleryConnection} from '../../services/backendConnection';
import {activeProfileId, beginPairing, completePairing, profileIdForApiUrl, readCredential} from '../../services/digitalDelivery';
import {restartEventSyncMonitor, runEventSync} from '../../services/eventSync';
import {getSyncState, listEventTemplates} from '../../services/templateRepository';

const MODES = [
  {id: 'local', title: 'Local server', description: 'Connect to the event Wi-Fi server. Internet is not required.'},
  {id: 'online', title: 'Online server', description: 'Connect to a deployed server. HTTPS is required.'},
  {id: 'standalone', title: 'Standalone offline', description: 'Use camera, layouts, local history, composition, and printing without a server.'},
];

const EMPTY_BACKEND = {mode: 'standalone', apiBaseUrl: '', galleryBaseUrl: '', connectionStatus: 'not-tested', apiStatus: 'not-tested', galleryStatus: 'not-tested', lastSuccessfulConnection: null, lastApiSuccessAt: null, lastGallerySuccessAt: null, backendVersion: null, autoReconnect: true, continueOffline: true};
const messageForStatus = status => ({connected: 'API and gallery are reachable', partial: 'One server is reachable', disconnected: 'Backend is disconnected', standalone: 'Standalone offline mode', 'not-tested': 'Not tested yet'})[status] || 'Connection not tested';
const endpointStatus = status => ({connected: 'Connected', disconnected: 'Disconnected', 'not-tested': 'Not tested'})[status] || 'Not tested';
const cachedSyncOutcome = state => {
  if (!state) return {kind: 'idle', title: 'Not synchronized yet', detail: 'Pair this kiosk, then sync its assigned event.'};
  if (state.syncFailure) return {kind: 'failed', title: 'Synchronization failed', detail: state.syncFailure.message};
  const pending = Object.values(state.events || {}).find(entry => entry.pending);
  if (pending) return {kind: 'pending', title: 'Update downloaded · waiting for session to finish', detail: `Server configuration v${pending.pending.syncInfo?.serverVersion ?? '—'} will activate when the kiosk is idle.`};
  if (state.lastSyncOutcome) return state.lastSyncOutcome;
  const entry = state.events?.[state.activeEventId];
  if (entry?.syncInfo?.syncedAt) return {kind: 'success', title: 'Synchronized successfully', detail: `Configuration v${entry.syncInfo.serverVersion} · ${new Date(entry.syncInfo.syncedAt).toLocaleString()}`};
  return {kind: 'idle', title: 'Not synchronized yet', detail: 'Pair this kiosk, then sync its assigned event.'};
};

export default function DeliverySettingsScreen() {
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [testingGallery, setTestingGallery] = useState(false);
  const [deviceName, setDeviceName] = useState('SnapKiosk photo booth');
  const [pairing, setPairing] = useState(false);
  const [pairedDevice, setPairedDevice] = useState(null);
  const [pairingMessage, setPairingMessage] = useState('');
  const [syncState, setSyncState] = useState(null);
  const [syncTemplates, setSyncTemplates] = useState([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [showDownloaded, setShowDownloaded] = useState(false);
  const [latestServerVersion, setLatestServerVersion] = useState(null);
  const [syncIntervalText, setSyncIntervalText] = useState('60');
  const [syncOutcome, setSyncOutcome] = useState(cachedSyncOutcome(null));

  useFocusEffect(useCallback(() => {
    let active = true;
    loadDeviceConfig().then(value => {if (active) {setConfig(value); setSyncIntervalText(String(value.backend?.sync?.intervalSeconds || 60));}}).catch(loadError => setError(loadError?.message || 'Could not load backend settings.'));
    readCredential().then(value => {if (active) setPairedDevice(value);}).catch(() => {});
    loadDeviceConfig().then(value => {
      const profileId = profileIdForApiUrl(value.backend?.apiBaseUrl || value.backend?.lastProfileApiBaseUrl);
      return getSyncState(profileId).then(state => {
      if (active) {
        setSyncState(state);
        setSyncOutcome(cachedSyncOutcome(state));
        const eventId = state?.activeEventId;
        setLatestServerVersion(state?.events?.[eventId]?.syncInfo?.serverVersion ?? null);
        listEventTemplates(profileId, eventId).then(templates => {if (active) setSyncTemplates(templates);});
      }
      });
    }).catch(() => {});
    return () => {active = false;};
  }, []));

  const backend = config?.backend || EMPTY_BACKEND;
  const updateBackend = patch => setConfig(current => ({...current, backend: {...current.backend, ...patch}}));
  const updateSyncOptions = patch => updateBackend({sync: {...backend.sync, automatic: true, intervalSeconds: 60, downloadForOffline: true, ...patch}});
  const refreshSyncStatus = async () => {
    const savedConfig = await loadDeviceConfig();
    const profileId = profileIdForApiUrl(savedConfig.backend?.apiBaseUrl || savedConfig.backend?.lastProfileApiBaseUrl);
    const state = await getSyncState(profileId);
    setSyncState(state);
    setSyncOutcome(cachedSyncOutcome(state));
    setSyncTemplates(await listEventTemplates(profileId, state?.activeEventId));
  };
  const runSyncAction = async kind => {
    setSyncBusy(true); setError(''); setMessage('');
    setSyncOutcome({kind: 'syncing', title: kind === 'check' ? 'Checking for updates…' : 'Synchronizing event…', detail: 'Contacting the active SnapKiosk server.'});
    try {
      if (kind === 'check') {
        const result = await runEventSync({checkOnly: true});
        setLatestServerVersion(result.serverVersion || 0);
        const detail = !result.eventId ? 'No active event is assigned to this kiosk.' : !result.changed ? 'The kiosk already has the latest event configuration.' : `Server configuration v${result.serverVersion} is available. Press Sync Now to download it.`;
        setSyncOutcome({kind: !result.eventId ? 'failed' : result.changed ? 'update' : 'success', title: !result.eventId ? 'No active event assignment' : result.changed ? 'Update available' : 'Already up to date', detail});
        setMessage(detail);
      } else {
        const result = await runEventSync({force: kind !== 'sync'});
        setLatestServerVersion(result.serverVersion || 0);
        const detail = result.message || (result.status === 'synced' ? 'Event configuration and template synchronized.' : result.status === 'unassigned' ? result.message : 'Event configuration is up to date.');
        setSyncOutcome({kind: result.status === 'pending-activation' ? 'pending' : result.status === 'unassigned' ? 'failed' : 'success', title: result.status === 'pending-activation' ? 'Update waiting for session to finish' : result.status === 'unassigned' ? 'No active event assignment' : 'Synchronized successfully', detail});
        setMessage(detail);
      }
      await refreshSyncStatus();
    } catch (syncError) {const detail = syncError?.message || 'Event synchronization failed.'; await refreshSyncStatus().catch(() => {}); setError(detail); setSyncOutcome({kind: 'failed', title: 'Synchronization failed', detail});}
    finally {setSyncBusy(false);}
  };
  const markStatus = (kind, ok, version) => {
    const timestamp = new Date().toISOString();
    setConfig(current => {
      const previous = current.backend || EMPTY_BACKEND;
      const lastApiSuccessAt = kind === 'api' && ok ? timestamp : previous.lastApiSuccessAt;
      const lastGallerySuccessAt = kind === 'gallery' && ok ? timestamp : previous.lastGallerySuccessAt;
      const apiStatus = kind === 'api' ? (ok ? 'connected' : 'disconnected') : previous.apiStatus;
      const galleryStatus = kind === 'gallery' ? (ok ? 'connected' : 'disconnected') : previous.galleryStatus;
      const apiAvailable = apiStatus === 'connected';
      const galleryAvailable = galleryStatus === 'connected';
      const status = apiAvailable && galleryAvailable ? 'connected' : apiAvailable || galleryAvailable ? 'partial' : apiStatus === 'not-tested' || galleryStatus === 'not-tested' ? 'not-tested' : 'disconnected';
      return {...current, backend: {
        ...previous,
        connectionStatus: status,
        apiStatus,
        galleryStatus,
        lastApiSuccessAt,
        lastGallerySuccessAt,
        lastSuccessfulConnection: ok ? timestamp : previous.lastSuccessfulConnection,
        backendVersion: kind === 'api' && ok ? version || previous.backendVersion : previous.backendVersion,
      }};
    });
  };

  const testApi = async () => {
    const problem = validateBackendUrl(backend.apiBaseUrl, backend.mode, 'API Base URL');
    if (problem) {setError(problem); return;}
    setTestingApi(true); setError(''); setMessage('');
    try {
      const result = await testApiConnection(backend.apiBaseUrl);
      markStatus('api', result.ok, result.version);
      if (result.ok) setMessage(result.version ? `API connected · version ${result.version}` : 'API health check succeeded.');
      else setError(result.message || 'The API server requires authentication or device pairing.');
    } catch (testError) {
      markStatus('api', false);
      setError(testError?.message || 'Could not connect to the API server.');
    } finally {setTestingApi(false);}
  };

  const testGallery = async () => {
    const problem = validateBackendUrl(backend.galleryBaseUrl, backend.mode, 'Gallery Base URL');
    if (problem) {setError(problem); return;}
    setTestingGallery(true); setError(''); setMessage('');
    try {
      await testGalleryConnection(backend.galleryBaseUrl);
      markStatus('gallery', true);
      setMessage('Gallery server responded successfully.');
    } catch (testError) {
      markStatus('gallery', false);
      setError(testError?.message || 'Could not connect to the gallery server.');
    } finally {setTestingGallery(false);}
  };

  const pairKiosk = async () => {
    setPairing(true); setError(''); setMessage(''); setPairingMessage('');
    try {
      const saved = await loadDeviceConfig();
      if (saved.backend?.mode === 'standalone' || saved.backend?.apiBaseUrl?.trim() !== backend.apiBaseUrl?.trim()) throw new Error('Save the active Backend Connection settings before pairing this kiosk.');
      const request = await beginPairing({name: deviceName.trim() || 'SnapKiosk photo booth'});
      setPairingMessage('Pairing request sent. Approve this kiosk in SnapKiosk Web → Kiosk Devices.');
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        try {
          const profileId = await activeProfileId();
          const result = await completePairing(request.pairingCode, profileId, deviceName.trim() || 'SnapKiosk photo booth');
          setPairedDevice({...result, pairedAt: new Date().toISOString()});
          setPairingMessage('Kiosk paired. Its device credential is stored in secure device storage.');
          await runEventSync({force: true}).then(refreshSyncStatus).catch(pairSyncError => setError(pairSyncError?.message || 'Kiosk paired, but initial event sync failed.'));
          return;
        } catch (pollError) {
          if (!String(pollError?.message || '').toLowerCase().includes('not approved or has expired')) throw pollError;
        }
      }
      throw new Error('Pairing request expired. Start a new request and approve it within 10 minutes.');
    } catch (pairError) {setError(pairError?.message || 'Could not pair this kiosk.');}
    finally {setPairing(false);}
  };

  const save = async () => {
    if (!Number.isInteger(config.delivery.retentionDays) || config.delivery.retentionDays < 1 || config.delivery.retentionDays > 365) {
      setError('Digital photo retention must be from 1 to 365 days.');
      return;
    }
    if (backend.mode !== 'standalone') {
      const apiError = validateBackendUrl(backend.apiBaseUrl, backend.mode, 'API Base URL');
      if (apiError) {setError(apiError); return;}
      const galleryError = validateBackendUrl(backend.galleryBaseUrl, backend.mode, 'Gallery Base URL');
      if (galleryError) {setError(galleryError); return;}
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const next = {...config,
        backend: {...backend, sync: {...backend.sync, intervalSeconds: Math.max(60, Math.min(3600, Number(syncIntervalText) || 60))}, connectionStatus: backend.mode === 'standalone' ? 'standalone' : backend.connectionStatus},
        delivery: {...config.delivery, apiBaseUrl: backend.apiBaseUrl.trim(), enabled: backend.mode === 'standalone' ? false : config.delivery.enabled},
      };
      const saved = await saveDeviceConfig(next);
      setConfig(saved);
      restartEventSyncMonitor();
      setMessage(backend.mode === 'standalone' ? 'Standalone offline configuration saved.' : 'Backend configuration saved on this kiosk.');
    } catch (saveError) {setError(saveError?.message || 'Could not save backend configuration.');}
    finally {setSaving(false);}
  };

  const reset = () => Alert.alert('Reset backend configuration?', 'This clears both server URLs and switches the kiosk to Standalone Offline Mode. Printer, branding, and session history are preserved.', [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Reset configuration', style: 'destructive', onPress: async () => {
      const next = {...config, backend: {...EMPTY_BACKEND}, delivery: {...config.delivery, apiBaseUrl: '', enabled: false}};
      try {const saved = await saveDeviceConfig(next); setConfig(saved); setMessage('Backend configuration reset. Other kiosk settings were preserved.'); setError('');}
      catch (resetError) {setError(resetError?.message || 'Could not reset backend configuration.');}
    }},
  ]);

  if (!config) return <SafeAreaView style={styles.safe}><Text style={styles.loading}>Loading backend settings…</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>SERVER AND GALLERY</Text>
        <Text style={styles.title}>Backend connection</Text>
        <Text style={styles.description}>Server addresses are saved on this kiosk and can be changed without rebuilding the app. Keep storage keys and server secrets on the backend.</Text>

        <View style={styles.statusCard}>
          <Text style={styles.label}>CONNECTION STATUS</Text>
          <Text style={[styles.statusValue, backend.connectionStatus === 'connected' && styles.connected]}>{messageForStatus(backend.mode === 'standalone' ? 'standalone' : backend.connectionStatus)}</Text>
          {backend.backendVersion ? <Text style={styles.note}>Backend version: {backend.backendVersion}</Text> : null}
          <Text style={styles.note}>Last successful connection: {backend.lastSuccessfulConnection ? new Date(backend.lastSuccessfulConnection).toLocaleString() : 'Never'}</Text>
          {backend.mode !== 'standalone' ? <>
            <Text style={styles.note}>API: {endpointStatus(backend.apiStatus)} · Gallery: {endpointStatus(backend.galleryStatus)}</Text>
            <Text style={styles.note}>Last API success: {backend.lastApiSuccessAt ? new Date(backend.lastApiSuccessAt).toLocaleString() : 'Never'} · Last gallery success: {backend.lastGallerySuccessAt ? new Date(backend.lastGallerySuccessAt).toLocaleString() : 'Never'}</Text>
          </> : null}
        </View>

        <Text style={styles.label}>Operating mode</Text>
        <View style={styles.modeList}>{MODES.map(mode => <Pressable accessibilityRole="radio" accessibilityState={{checked: backend.mode === mode.id}} key={mode.id} onPress={() => updateBackend({mode: mode.id, connectionStatus: mode.id === 'standalone' ? 'standalone' : 'not-tested', apiStatus: 'not-tested', galleryStatus: 'not-tested', lastSuccessfulConnection: null, lastApiSuccessAt: null, lastGallerySuccessAt: null, backendVersion: null})} style={[styles.modeCard, backend.mode === mode.id && styles.modeSelected]}>
          <View style={styles.modeHeading}><Text style={styles.modeTitle}>{mode.title}</Text><View style={[styles.radio, backend.mode === mode.id && styles.radioSelected]} /></View>
          <Text style={styles.note}>{mode.description}</Text>
        </Pressable>)}</View>

        {backend.mode !== 'standalone' ? <>
          <Text style={styles.label}>API Base URL</Text>
          <TextInput value={backend.apiBaseUrl} onChangeText={apiBaseUrl => updateBackend({apiBaseUrl, connectionStatus: 'not-tested', apiStatus: 'not-tested', galleryStatus: 'not-tested', lastSuccessfulConnection: null, lastApiSuccessAt: null, lastGallerySuccessAt: null, backendVersion: null})} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="Enter the SnapKiosk API base URL" placeholderTextColor="#A7A094" style={styles.input} accessibilityLabel="API Base URL" />
          <PrimaryButton title={testingApi ? 'Testing API…' : 'Test API Connection'} onPress={testApi} disabled={testingApi || testingGallery} loading={testingApi} style={styles.testButton} />

          <Text style={styles.label}>Gallery Base URL</Text>
          <TextInput value={backend.galleryBaseUrl} onChangeText={galleryBaseUrl => updateBackend({galleryBaseUrl, connectionStatus: 'not-tested', apiStatus: 'not-tested', galleryStatus: 'not-tested', lastSuccessfulConnection: null, lastApiSuccessAt: null, lastGallerySuccessAt: null, backendVersion: null})} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="Enter the customer gallery base URL" placeholderTextColor="#A7A094" style={styles.input} accessibilityLabel="Gallery Base URL" />
          <PrimaryButton title={testingGallery ? 'Testing gallery…' : 'Test Gallery Connection'} onPress={testGallery} disabled={testingApi || testingGallery} loading={testingGallery} style={styles.testButton} />
          <Text style={styles.hint}>{backend.mode === 'local' ? 'Use a Wi-Fi reachable server address. Do not use localhost, host.docker.internal, or Docker service names; guest phones must be able to open gallery links.' : 'Online server URLs must use HTTPS.'}</Text>
          <View style={styles.pairCard}>
            <Text style={styles.label}>Pair this kiosk</Text>
            <Text style={styles.note}>Pair once so the kiosk can register event sessions and create private guest links. Approve the request in the SnapKiosk Web administrator under Kiosk Devices.</Text>
            <TextInput value={deviceName} onChangeText={setDeviceName} placeholder="Kiosk name" placeholderTextColor="#A7A094" style={styles.input} accessibilityLabel="Kiosk name" />
            {pairedDevice?.deviceId ? <Text style={styles.message}>Paired device · {pairedDevice.deviceId}</Text> : null}
            {pairingMessage ? <Text style={styles.message}>{pairingMessage}</Text> : null}
            <PrimaryButton title={pairing ? 'Waiting for approval…' : pairedDevice?.deviceId ? 'Pair another kiosk' : 'Pair this kiosk'} onPress={pairKiosk} disabled={pairing || backend.mode === 'standalone'} loading={pairing} style={styles.testButton} />
          </View>
        </> : <View style={styles.offlineCard}><Text style={styles.label}>Standalone features</Text><Text style={styles.note}>Camera capture, photo layouts, Layout Studio, composition, thermal printing, local previews, session history, and administrator settings stay available without a backend.</Text><Text style={styles.note}>The current printer adapter supports monochrome ESC/POS thermal printers. Color printing needs a compatible vendor adapter.</Text><Text style={styles.note}>API and gallery features are disabled in this mode. Saved server addresses are retained so you can switch back later.</Text></View>}

        <View style={styles.syncCard}>
          <Text style={styles.label}>Event synchronization</Text>
          <View style={[styles.syncIndicator, styles[`syncIndicator_${syncBusy ? 'syncing' : syncOutcome.kind}`] || styles.syncIndicator_idle]} accessibilityLiveRegion="polite">
            <View style={[styles.syncDot, styles[`syncDot_${syncBusy ? 'syncing' : syncOutcome.kind}`] || styles.syncDot_idle]} />
            <View style={styles.syncIndicatorCopy}>
              <Text style={styles.syncIndicatorTitle}>{syncBusy ? 'Synchronizing event…' : syncOutcome.title}</Text>
              <Text style={styles.syncIndicatorDetail}>{syncBusy ? 'Checking the server and saving any assigned template.' : syncOutcome.detail}</Text>
            </View>
          </View>
          <Text style={styles.note}>Registered device: {pairedDevice?.deviceName || (pairedDevice?.deviceId ? deviceName : 'Not paired')}</Text>
          <Text style={styles.note}>Assigned event: {syncState?.events?.[syncState?.activeEventId]?.syncInfo?.eventName || 'Not synchronized'}</Text>
          <Text style={styles.note}>Backend connection: {backend.mode === 'standalone' ? 'Standalone offline' : backend.connectionStatus}</Text>
          <Text style={styles.note}>Local configuration version: {syncState?.events?.[syncState?.activeEventId]?.syncInfo?.serverVersion ?? '—'} · Latest server version: {latestServerVersion ?? 'Not checked'}</Text>
          <Text style={styles.note}>Available templates: {syncTemplates.length} · Downloaded: {syncTemplates.length} · Pending: {Object.values(syncState?.events || {}).filter(entry => entry.pending).length} · Failed downloads/sync: {syncState?.syncFailure ? 1 : 0}</Text>
          <Text style={styles.note}>Last successful synchronization: {syncState?.events?.[syncState?.activeEventId]?.syncInfo?.syncedAt ? new Date(syncState.events[syncState.activeEventId].syncInfo.syncedAt).toLocaleString() : 'Never'}</Text>
          {syncState?.syncFailure ? <Text accessibilityRole="alert" style={styles.error}>Last sync error ({new Date(syncState.syncFailure.failedAt).toLocaleString()}): {syncState.syncFailure.message}</Text> : null}
          <View style={styles.syncActions}>
            <PrimaryButton title={syncBusy ? 'Syncing…' : 'Sync Now'} onPress={() => runSyncAction('sync')} disabled={syncBusy || backend.mode === 'standalone'} loading={syncBusy} style={styles.testButton} />
            <PrimaryButton title="Check for Updates" onPress={() => runSyncAction('check')} disabled={syncBusy || backend.mode === 'standalone'} style={styles.testButton} />
            <PrimaryButton title="Retry Failed Downloads" onPress={() => runSyncAction('retry')} disabled={syncBusy || backend.mode === 'standalone'} style={styles.testButton} />
            <PrimaryButton title={showDownloaded ? 'Hide Downloaded Templates' : 'View Downloaded Templates'} onPress={() => setShowDownloaded(value => !value)} style={styles.testButton} />
            <PrimaryButton title="Repair Template Cache" onPress={() => runSyncAction('repair')} disabled={syncBusy || backend.mode === 'standalone'} style={styles.testButton} />
          </View>
          {showDownloaded ? syncTemplates.length ? syncTemplates.map(template => <Text key={template.id} style={styles.note}>• {template.name} · v{template.version} · {template.requiredPhotoCount} photo{template.requiredPhotoCount === 1 ? '' : 's'}</Text>) : <Text style={styles.note}>No event templates are cached on this server profile.</Text> : null}
          <View style={styles.toggleCard}><View style={styles.toggleCopy}><Text style={styles.label}>Enable automatic synchronization</Text><Text style={styles.note}>Check at startup, when the app returns, and while idle.</Text></View><Switch value={backend.sync?.automatic !== false} onValueChange={automatic => updateSyncOptions({automatic})} accessibilityLabel="Enable automatic synchronization" /></View>
          <Text style={styles.label}>Synchronization interval (seconds)</Text>
          <TextInput value={syncIntervalText} onChangeText={value => setSyncIntervalText(value.replace(/\D/g, '').slice(0, 4))} onEndEditing={() => {const parsed = Math.max(60, Math.min(3600, Number(syncIntervalText) || 60)); setSyncIntervalText(String(parsed)); updateSyncOptions({intervalSeconds: parsed});}} keyboardType="number-pad" style={styles.input} accessibilityLabel="Synchronization interval in seconds" />
          <View style={styles.toggleCard}><View style={styles.toggleCopy}><Text style={styles.label}>Download templates for offline use</Text><Text style={styles.note}>Keep the last successful event template cached for use without the server.</Text></View><Switch value={backend.sync?.downloadForOffline !== false} onValueChange={downloadForOffline => updateSyncOptions({downloadForOffline})} accessibilityLabel="Download templates for offline use" /></View>
          <Text style={styles.hint}>The API embeds the assigned template in event configuration. This server contract has no device-authenticated asset download route or general configuration acknowledgment; command acknowledgments use the documented command API.</Text>
        </View>

        <Text style={styles.label}>Digital photo retention (days)</Text>
        <TextInput value={String(config.delivery.retentionDays)} onChangeText={value => setConfig(current => ({...current, delivery: {...current.delivery, retentionDays: Number(value.replace(/\D/g, '').slice(0, 3))}}))} keyboardType="number-pad" maxLength={3} style={styles.input} accessibilityLabel="Digital photo retention days" />
        <Text style={styles.hint}>This setting is saved for the delivery adapter. The server must enforce expiry and delete uploaded photos.</Text>

        <View style={styles.toggleCard}><View style={styles.toggleCopy}><Text style={styles.label}>Automatically reconnect</Text><Text style={styles.note}>Check the saved API and gallery every 30 seconds while the app is active.</Text></View><Switch value={backend.autoReconnect} onValueChange={autoReconnect => updateBackend({autoReconnect})} accessibilityLabel="Automatically reconnect" /></View>
        <View style={styles.toggleCard}><View style={styles.toggleCopy}><Text style={styles.label}>Continue operating when disconnected</Text><Text style={styles.note}>Keep local camera, composition, history, and printing available during server outages.</Text></View><Switch value={backend.continueOffline} onValueChange={continueOffline => updateBackend({continueOffline})} accessibilityLabel="Continue operating when disconnected" /></View>

        <View style={styles.notice}><Text style={styles.label}>Guest downloads</Text><Text style={styles.note}>After a successful print, customers can opt in to upload the color layout and receipt image. SnapKiosk shows a guest QR link only after both files upload and the private gallery reports them ready. Animated GIF and one-file bundle downloads require GIF and archive support in the server/gallery.</Text></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.actions}>
          <PrimaryButton title={saving ? 'Saving…' : 'Save Configuration'} onPress={save} loading={saving} style={styles.saveButton} />
          <PrimaryButton title="Reset Configuration" onPress={reset} style={styles.resetButton} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F6F0E6'},
  content: {width: '100%', maxWidth: 900, alignSelf: 'center', padding: 28, paddingBottom: 48, gap: 14},
  kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'},
  title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'},
  description: {fontSize: 15, lineHeight: 23, color: '#77736A', marginBottom: 4},
  label: {fontSize: 14, fontWeight: '700', color: '#26241F'},
  note: {fontSize: 13, lineHeight: 20, color: '#77736A'},
  statusCard: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 16, padding: 18, gap: 7},
  statusValue: {fontSize: 19, fontWeight: '700', color: '#9D4235'},
  connected: {color: '#4C5F57'},
  modeList: {gap: 9},
  modeCard: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 14, padding: 15, gap: 6},
  modeSelected: {backgroundColor: '#EDF1E9', borderColor: '#82958C', borderWidth: 2},
  modeHeading: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  modeTitle: {fontSize: 16, fontWeight: '700', color: '#26241F'},
  radio: {width: 19, height: 19, borderRadius: 10, borderWidth: 2, borderColor: '#B8B0A4'},
  radioSelected: {borderColor: '#4C5F57', backgroundColor: '#4C5F57'},
  input: {minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: '#E8E0D4', backgroundColor: '#FFFCF7', paddingHorizontal: 15, fontSize: 15, color: '#26241F'},
  testButton: {alignSelf: 'flex-start', minWidth: 210, minHeight: 48, backgroundColor: '#D8E0D5'},
  hint: {fontSize: 12, lineHeight: 19, color: '#77736A'},
  offlineCard: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 14, padding: 16, gap: 8},
  pairCard: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 14, padding: 16, gap: 10},
  syncCard: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 14, padding: 16, gap: 10},
  syncActions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  syncIndicator: {flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderWidth: 1, borderRadius: 12},
  syncIndicator_idle: {backgroundColor: '#F2E7DB', borderColor: '#E8E0D4'},
  syncIndicator_syncing: {backgroundColor: '#EAF0F7', borderColor: '#B9C9DC'},
  syncIndicator_success: {backgroundColor: '#EDF1E9', borderColor: '#A9BBAE'},
  syncIndicator_update: {backgroundColor: '#FFF4D9', borderColor: '#E7D29B'},
  syncIndicator_pending: {backgroundColor: '#FFF4D9', borderColor: '#E7D29B'},
  syncIndicator_failed: {backgroundColor: '#F9E7E4', borderColor: '#DCAEA8'},
  syncDot: {width: 10, height: 10, borderRadius: 5, marginTop: 4},
  syncDot_idle: {backgroundColor: '#8D867A'},
  syncDot_syncing: {backgroundColor: '#4377B1'},
  syncDot_success: {backgroundColor: '#4C7A5B'},
  syncDot_update: {backgroundColor: '#B48A23'},
  syncDot_pending: {backgroundColor: '#B48A23'},
  syncDot_failed: {backgroundColor: '#B84E43'},
  syncIndicatorCopy: {flex: 1, gap: 3},
  syncIndicatorTitle: {fontSize: 14, fontWeight: '800', color: '#26241F'},
  syncIndicatorDetail: {fontSize: 12, lineHeight: 18, color: '#5F5A51'},
  toggleCard: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 15, backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 14},
  toggleCopy: {flex: 1, gap: 5},
  notice: {padding: 16, backgroundColor: '#F2E7DB', borderRadius: 14, gap: 6},
  error: {fontSize: 14, lineHeight: 20, color: '#9D4235'},
  message: {fontSize: 14, lineHeight: 20, color: '#4C5F57'},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  saveButton: {alignSelf: 'flex-start', minWidth: 220, minHeight: 52},
  resetButton: {alignSelf: 'flex-start', minWidth: 190, minHeight: 52, backgroundColor: '#D8D0C3'},
  loading: {padding: 28, color: '#77736A'},
});
