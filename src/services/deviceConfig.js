const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const CONFIG_KEY = 'snapkiosk.device-config.v1';
const DEFAULT_CONFIG = Object.freeze({
  printer: {paperWidthMm: 58, printableDots: 384, horizontalOffsetDots: 0, density: 8, feedLines: 3, cutAfterPrint: true, printStyle: null, ditherMode: 'floyd-steinberg', cleanBackground: true, threshold: 160, brightness: 0, contrast: 1, gamma: 1, selectedPrinter: null},
  delivery: {apiBaseUrl: '', retentionDays: 7, enabled: false},
  privacy: {localRetentionDays: 7, idleTimeoutSeconds: 120},
  workflow: {countdownSeconds: 3, photoCount: 4, gapSeconds: 2, maxRetakes: 1, defaultPrintCopies: 1, consentRequired: true},
});

async function loadDeviceConfig() {
  const saved = await AsyncStorage.getItem(CONFIG_KEY);
  if (!saved) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  return {...DEFAULT_CONFIG, ...JSON.parse(saved),
    printer: {...DEFAULT_CONFIG.printer, ...JSON.parse(saved).printer},
    delivery: {...DEFAULT_CONFIG.delivery, ...JSON.parse(saved).delivery},
    privacy: {...DEFAULT_CONFIG.privacy, ...JSON.parse(saved).privacy},
    workflow: {...DEFAULT_CONFIG.workflow, ...JSON.parse(saved).workflow},
  };
}

async function saveDeviceConfig(config) {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  return config;
}

function validateApiBaseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return 'Use HTTPS for the delivery backend.';
    return null;
  } catch {
    return 'Enter a valid backend URL.';
  }
}

module.exports = {CONFIG_KEY, DEFAULT_CONFIG, loadDeviceConfig, saveDeviceConfig, validateApiBaseUrl};
