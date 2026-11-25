const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const CONFIG_KEY = 'snapkiosk.device-config.v1';
const DEFAULT_CONFIG = Object.freeze({
  printer: {paperWidthMm: 58, printableDots: 384, horizontalOffsetDots: 0, density: 8, feedLines: 3, cutAfterPrint: true, printStyle: null, ditherMode: 'floyd-steinberg', cleanBackground: true, threshold: 160, brightness: 0, contrast: 1, gamma: 1, selectedPrinter: null},
  backend: {mode: 'standalone', apiBaseUrl: '', galleryBaseUrl: '', lastProfileApiBaseUrl: '', connectionStatus: 'not-tested', apiStatus: 'not-tested', lastSuccessfulConnection: null, lastApiSuccessAt: null, lastGallerySuccessAt: null, backendVersion: null, autoReconnect: true, continueOffline: true, sync: {automatic: true, intervalSeconds: 60, downloadForOffline: true}},
  delivery: {apiBaseUrl: '', retentionDays: 7, enabled: false},
  privacy: {localRetentionDays: 7, idleTimeoutSeconds: 120},
  workflow: {countdownSeconds: 3, photoCount: 4, gapSeconds: 2, maxRetakes: 1, defaultPrintCopies: 1, consentRequired: true},
});

async function loadDeviceConfig() {
  const saved = await AsyncStorage.getItem(CONFIG_KEY);
  if (!saved) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const parsed = JSON.parse(saved);
  const legacyApiBaseUrl = parsed.delivery?.apiBaseUrl || '';
  let legacyMode = 'standalone';
  if (legacyApiBaseUrl) {
    try {legacyMode = new URL(legacyApiBaseUrl).protocol === 'https:' ? 'online' : 'local';} catch {legacyMode = 'standalone';}
  }
  return {...DEFAULT_CONFIG, ...parsed,
    printer: {...DEFAULT_CONFIG.printer, ...parsed.printer},
    backend: {...DEFAULT_CONFIG.backend, ...parsed.backend, sync: {...DEFAULT_CONFIG.backend.sync, ...parsed.backend?.sync}, mode: parsed.backend?.mode || legacyMode, apiBaseUrl: parsed.backend?.apiBaseUrl ?? legacyApiBaseUrl},
    delivery: {...DEFAULT_CONFIG.delivery, ...parsed.delivery},
    privacy: {...DEFAULT_CONFIG.privacy, ...parsed.privacy},
    workflow: {...DEFAULT_CONFIG.workflow, ...parsed.workflow},
  };
}

async function saveDeviceConfig(config) {
  const previous = await AsyncStorage.getItem(CONFIG_KEY).then(value => value ? JSON.parse(value) : null).catch(() => null);
  const lastProfileApiBaseUrl = config.backend?.apiBaseUrl || config.backend?.lastProfileApiBaseUrl || previous?.backend?.apiBaseUrl || previous?.backend?.lastProfileApiBaseUrl || '';
  const next = {...config, backend: {...config.backend, lastProfileApiBaseUrl}};
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

function validateApiBaseUrl(value) {
  if (!value) return null;
  return validateBackendUrl(value, 'local', 'API Base URL');
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function validateBackendUrl(value, mode, label = 'URL') {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) return `${label} is required for this operating mode.`;
  let url;
  try {url = new URL(normalized);} catch {return `Enter a valid ${label.toLowerCase()}.`;}
  if (!['http:', 'https:'].includes(url.protocol)) return `${label} must start with http:// or https://.`;
  if (url.username || url.password) return `Do not put credentials in the ${label.toLowerCase()}.`;
  if (url.search || url.hash) return `${label} must not include a query string or fragment.`;
  if (mode === 'online' && url.protocol !== 'https:') return `${label} must use HTTPS in Online Server Mode.`;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4Parts = host.split('.').map(Number);
  const isLoopbackIpv4 = ipv4Parts.length === 4 && ipv4Parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) && ipv4Parts[0] === 127;
  if (host === 'localhost' || isLoopbackIpv4 || host === '0.0.0.0' || host === '::1' || host === '10.0.2.2' || host === 'host.docker.internal' || host.endsWith('.docker.internal') || host.endsWith('.localhost')) {
    return `${label} must use an address reachable by the tablet and guest phones, not localhost, an emulator address, or an internal Docker name.`;
  }
  if (mode === 'local') {
    if (!host.includes('.') && !host.includes(':') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return `${label} must use a Wi-Fi network IP address or a reachable domain, not a Docker service name.`;
  }
  return null;
}

module.exports = {CONFIG_KEY, DEFAULT_CONFIG, loadDeviceConfig, normalizeBaseUrl, saveDeviceConfig, validateApiBaseUrl, validateBackendUrl};
