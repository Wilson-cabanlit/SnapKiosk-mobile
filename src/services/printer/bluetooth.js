import {NativeEventEmitter, NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {concatBytes, makeRasterCommand, offsetMonochromePixels} from './escpos';

const native = NativeModules.SnapPrinterBluetooth;
const events = Platform.OS === 'android' && native ? new NativeEventEmitter(native) : null;

function requireAndroidAdapter() {
  if (Platform.OS !== 'android') {
    throw new Error('Bluetooth Classic setup is currently available on Android. iOS printers require a compatible MFi or vendor-specific adapter.');
  }
  if (!native) throw new Error('The Android Bluetooth module is missing. Rebuild the app after installing this update.');
  return native;
}

async function requestBluetoothPermissions() {
  requireAndroidAdapter();
  const version = Number(Platform.Version);
  const permissions = version >= 31
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const results = await PermissionsAndroid.requestMultiple(permissions);
  const denied = permissions.filter(permission => results[permission] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied.length) throw new Error('Bluetooth permission was denied. Allow Nearby devices (and Location on older Android) to find printers.');
}

function onPrinterFound(callback) {
  requireAndroidAdapter();
  return events.addListener('printerDeviceFound', callback);
}

function onDiscoveryFinished(callback) {
  requireAndroidAdapter();
  return events.addListener('printerDiscoveryFinished', callback);
}

function buildAlignmentPrintBytes({printableDots = 384, horizontalOffsetDots = 0, feedLines = 3, cut = true} = {}) {
  if (!Number.isInteger(printableDots) || printableDots < 1 || printableDots > 2048) throw new Error('Printable width must be from 1 to 2048 dots.');
  const width = printableDots;
  const height = 192;
  const pixels = new Uint8Array(width * height);
  const edge = Math.max(1, Math.round(width * 0.035));
  const left = edge;
  const right = width - edge - 1;
  const center = Math.floor(width / 2);
  for (let x = left; x <= right; x += 1) {
    pixels[8 * width + x] = 1;
    pixels[(height - 9) * width + x] = 1;
  }
  for (let y = 8; y < height - 8; y += 1) {
    pixels[y * width + left] = 1;
    pixels[y * width + right] = 1;
    pixels[y * width + center] = 1;
  }
  for (let x = center - edge; x <= center + edge; x += 1) {
    pixels[(Math.floor(height / 2) * width) + x] = 1;
  }
  const aligned = offsetMonochromePixels(width, height, pixels, horizontalOffsetDots);
  const chunks = [Uint8Array.from([0x1b, 0x40, 0x1b, 0x61, 0x00]), makeRasterCommand(width, height, aligned)];
  if (feedLines) chunks.push(Uint8Array.from([0x1b, 0x64, Math.max(0, Math.min(255, feedLines))]));
  if (cut) chunks.push(Uint8Array.from([0x1d, 0x56, 0x00]));
  return Array.from(concatBytes(chunks));
}

function buildSamplePrintBytes({printableDots = 384, feedLines = 3, cut = true, businessName = 'SNAPKIOSK', eventName = '', thankYouMessage = 'THANK YOU FOR JOINING US'} = {}) {
  const columns = Math.max(16, Math.floor(printableDots / 12));
  const ascii = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .toUpperCase();
  const fit = value => ascii(value).slice(0, columns);
  const centered = value => {
    const line = fit(value);
    const left = Math.max(0, Math.floor((columns - line.length) / 2));
    return `${' '.repeat(left)}${line}\n`;
  };
  const field = (label, value) => `${fit(label).slice(0, 10).padEnd(10)} ${fit(value).slice(0, Math.max(1, columns - 11))}\n`;
  const rule = `${'-'.repeat(columns)}\n`;
  const safeEvent = fit(eventName) || 'SPECIAL EVENT';
  const date = new Date().toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: '2-digit'}).toUpperCase();
  const textBytes = value => Uint8Array.from(Array.from(value, character => character.charCodeAt(0)));
  const parts = [
    Uint8Array.from([0x1b, 0x40, 0x1b, 0x4d, 0x00, 0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01]),
    textBytes(centered('BOARDING PASS')),
    Uint8Array.from([0x1b, 0x45, 0x00]),
    textBytes(centered(businessName)),
    textBytes(centered('EVENT PHOTO BOOTH')),
    Uint8Array.from([0x1b, 0x61, 0x00]),
    textBytes(rule),
    textBytes(field('EVENT', safeEvent)),
    textBytes(field('PASSENGER', 'PHOTO GUEST')),
    textBytes(field('DATE', date)),
    textBytes(field('GATE', 'SNAPKIOSK')),
    textBytes(field('SEAT', 'MEMORY 01')),
    textBytes(rule),
    Uint8Array.from([0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01]),
    textBytes(centered('HAVE A GREAT EVENT')),
    Uint8Array.from([0x1b, 0x45, 0x00]),
    textBytes(centered(thankYouMessage)),
    Uint8Array.from([0x1b, 0x61, 0x00]),
  ];
  if (feedLines) parts.push(Uint8Array.from([0x1b, 0x64, Math.max(0, Math.min(255, feedLines))]));
  if (cut) parts.push(Uint8Array.from([0x1d, 0x56, 0x00]));
  return Array.from(concatBytes(parts));
}

module.exports = {
  buildAlignmentPrintBytes,
  buildSamplePrintBytes,
  connectPrinter: (address) => requireAndroidAdapter().connect(address),
  disconnectPrinter: () => requireAndroidAdapter().disconnect(),
  getPairedPrinters: () => requireAndroidAdapter().getPairedDevices(),
  isBluetoothEnabled: () => requireAndroidAdapter().isEnabled(),
  isBluetoothSupported: () => requireAndroidAdapter().isSupported(),
  onDiscoveryFinished,
  onPrinterFound,
  openBluetoothSettings: () => requireAndroidAdapter().openBluetoothSettings(),
  requestBluetoothPermissions,
  startPrinterDiscovery: () => requireAndroidAdapter().startDiscovery(),
  sendPrinterBytes: bytes => requireAndroidAdapter().writeBytes(bytes),
  stopPrinterDiscovery: async () => {
    if (Platform.OS !== 'android' || !native) return false;
    return native.stopDiscovery();
  },
};
