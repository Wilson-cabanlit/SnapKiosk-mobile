const keychainModule = require('react-native-keychain');
// react-native-keychain 10 exposes its API as a default export when loaded
// through CommonJS require (used by this JavaScript service).
const Keychain = keychainModule.default || keychainModule;
const {NativeModules} = require('react-native');
const AsyncStorage = require('@react-native-async-storage/async-storage').default;
const {isValidPin} = require('../utils/pin');
const {LOCKOUT_MS, nextFailedAttempt} = require('../utils/authAttempts');

const SERVICE = 'com.snapkiosk.admin-pin';
const ATTEMPT_KEY = 'snapkiosk.admin-auth-attempts';

function ensureSecureStorageAvailable() {
  const nativeKeychain = NativeModules.RNKeychainManager;
  if (
    typeof Keychain.getGenericPassword !== 'function' ||
    typeof Keychain.setGenericPassword !== 'function' ||
    !nativeKeychain ||
    typeof nativeKeychain.getGenericPasswordForOptions !== 'function' ||
    typeof nativeKeychain.setGenericPasswordForOptions !== 'function'
  ) {
    throw new Error('Secure PIN storage is missing from this app build. Rebuild and reinstall SnapKiosk after installing dependencies.');
  }
}

async function getLockoutMs() {
  const saved = await AsyncStorage.getItem(ATTEMPT_KEY);
  if (!saved) return 0;
  const state = JSON.parse(saved);
  if (!state.lockedUntil || state.lockedUntil <= Date.now()) return 0;
  return state.lockedUntil - Date.now();
}

async function registerFailedAttempt() {
  const saved = await AsyncStorage.getItem(ATTEMPT_KEY);
  const previous = saved ? JSON.parse(saved) : {};
  const next = nextFailedAttempt(previous);
  await AsyncStorage.setItem(ATTEMPT_KEY, JSON.stringify(next));
  return next.lockedUntil ? LOCKOUT_MS : 0;
}

async function resetFailedAttempts() {
  await AsyncStorage.removeItem(ATTEMPT_KEY);
}

async function hasAdminPin() {
  ensureSecureStorageAvailable();
  return Boolean(await Keychain.getGenericPassword({service: SERVICE}));
}

async function setAdminPin(pin) {
  ensureSecureStorageAvailable();
  if (!isValidPin(pin)) {
    throw new Error('Choose a six-digit administrator PIN.');
  }
  const saved = await Keychain.setGenericPassword('admin', pin, {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (!saved) throw new Error('The device could not save the administrator PIN securely.');
}

async function verifyAdminPin(pin) {
  ensureSecureStorageAvailable();
  if (!isValidPin(pin)) return false;
  const credential = await Keychain.getGenericPassword({service: SERVICE});
  return Boolean(credential && credential.password === pin);
}

module.exports = {hasAdminPin, setAdminPin, verifyAdminPin, getLockoutMs, registerFailedAttempt, resetFailedAttempts};
