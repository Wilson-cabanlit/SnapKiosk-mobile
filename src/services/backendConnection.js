const {AppState} = require('react-native');
const {loadDeviceConfig, normalizeBaseUrl, saveDeviceConfig} = require('./deviceConfig');

const REQUEST_TIMEOUT_MS = 8000;
const RECONNECT_INTERVAL_MS = 30000;
let activeMonitor = null;

function healthUrls(apiBaseUrl) {
  const base = normalizeBaseUrl(apiBaseUrl);
  const candidates = [`${base}/health`];
  try {
    const parsed = new URL(base);
    const rootHealth = `${parsed.origin}/health`;
    if (!candidates.includes(rootHealth)) candidates.push(rootHealth);
  } catch { /* URL validation reports the useful error before this helper runs. */ }
  return candidates;
}

function parseVersion(payload) {
  const value = payload?.version || payload?.backendVersion || payload?.data?.version || payload?.meta?.version || null;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

async function request(url, accept = 'application/json, text/html;q=0.9, */*;q=0.8') {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timeout = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {method: 'GET', headers: {Accept: accept}, signal: controller?.signal});
  } finally {clearTimeout(timeout);}
}

async function testApiConnection(apiBaseUrl) {
  const urls = healthUrls(apiBaseUrl);
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await request(url);
      const body = await response.text();
      let payload = null;
      try {payload = body ? JSON.parse(body) : null;} catch {payload = null;}
      if (response.ok && (payload !== null || response.status === 204 || !body)) return {ok: true, statusCode: response.status, version: parseVersion(payload), url};
      if (response.ok) {lastError = new Error(`API health endpoint at ${url} did not return a JSON health response.`); continue;}
      if (response.status === 404) {lastError = new Error(`Health endpoint was not found at ${url}.`); continue;}
      if (response.status === 401 || response.status === 403) return {ok: false, reachable: true, statusCode: response.status, message: `API server responded with HTTP ${response.status}; authentication or device pairing is required.`};
      lastError = new Error(`API server responded with HTTP ${response.status}.`);
    } catch (error) {lastError = error;}
  }
  if (lastError?.name === 'AbortError') throw new Error('API connection timed out. Check the server address and Wi-Fi.');
  throw new Error(lastError?.message || 'Could not reach the API health endpoint.');
}

async function testGalleryConnection(galleryBaseUrl) {
  const url = normalizeBaseUrl(galleryBaseUrl);
  try {
    const response = await request(url, 'text/html, application/json;q=0.9, */*;q=0.8');
    if (!response.ok) throw new Error(`Gallery server responded with HTTP ${response.status}.`);
    return {ok: true, statusCode: response.status, url};
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Gallery connection timed out. Check the gallery address and Wi-Fi.');
    throw error;
  }
}

async function updateSavedConnectionStatus(apiResult, galleryResult) {
  const current = await loadDeviceConfig();
  const backend = current.backend;
  if (backend.mode === 'standalone' || !backend.autoReconnect) return current;
  const timestamp = new Date().toISOString();
  const apiOk = Boolean(apiResult?.ok);
  const galleryOk = Boolean(galleryResult?.ok);
  const status = apiOk && galleryOk ? 'connected' : apiOk || galleryOk ? 'partial' : 'disconnected';
  const nextBackend = {
    ...backend,
    connectionStatus: status,
    apiStatus: apiOk ? 'connected' : 'disconnected',
    galleryStatus: galleryOk ? 'connected' : 'disconnected',
    backendVersion: apiResult?.version || backend.backendVersion || null,
    lastSuccessfulConnection: apiOk || galleryOk ? timestamp : backend.lastSuccessfulConnection,
    lastApiSuccessAt: apiOk ? timestamp : backend.lastApiSuccessAt,
    lastGallerySuccessAt: galleryOk ? timestamp : backend.lastGallerySuccessAt,
  };
  await saveDeviceConfig({...current, backend: nextBackend});
  return {...current, backend: nextBackend};
}

async function reconnectSavedBackend() {
  const config = await loadDeviceConfig();
  const backend = config.backend;
  if (backend.mode === 'standalone' || !backend.autoReconnect || !backend.apiBaseUrl || !backend.galleryBaseUrl) return;
  const [apiResult, galleryResult] = await Promise.all([
    testApiConnection(backend.apiBaseUrl).catch(() => null),
    testGalleryConnection(backend.galleryBaseUrl).catch(() => null),
  ]);
  const latest = await loadDeviceConfig();
  if (latest.backend.mode !== backend.mode || latest.backend.apiBaseUrl !== backend.apiBaseUrl || latest.backend.galleryBaseUrl !== backend.galleryBaseUrl || !latest.backend.autoReconnect) return;
  await updateSavedConnectionStatus(apiResult, galleryResult);
}

function startBackendMonitor() {
  if (activeMonitor) return activeMonitor.stop;
  let stopped = false;
  let interval = null;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {await reconnectSavedBackend();} catch { /* Keep local kiosk operation available during outages. */ }
    finally {running = false;}
  };
  const start = () => {
    if (interval || stopped || AppState.currentState !== 'active') return;
    run();
    interval = setInterval(run, RECONNECT_INTERVAL_MS);
  };
  const stopInterval = () => {if (interval) clearInterval(interval); interval = null;};
  const appStateListener = AppState.addEventListener('change', state => {
    if (state === 'active') start();
    else stopInterval();
  });
  const stop = () => {
    stopped = true;
    stopInterval();
    appStateListener.remove();
    if (activeMonitor?.stop === stop) activeMonitor = null;
  };
  activeMonitor = {stop};
  start();
  return stop;
}

module.exports = {healthUrls, parseVersion, reconnectSavedBackend, startBackendMonitor, testApiConnection, testGalleryConnection, updateSavedConnectionStatus};
