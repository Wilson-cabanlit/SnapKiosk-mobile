const AsyncStorage = require('@react-native-async-storage/async-storage').default;
const {DEFAULT_BRAND, normalizeBrand} = require('../utils/brand');

const BRAND_KEY = 'snapkiosk.brand-settings.v1';

async function loadBrand() {
  const saved = await AsyncStorage.getItem(BRAND_KEY);
  return saved ? normalizeBrand(JSON.parse(saved)) : DEFAULT_BRAND;
}

async function saveBrand(brand) {
  const normalized = normalizeBrand(brand);
  await AsyncStorage.setItem(BRAND_KEY, JSON.stringify(normalized));
  return normalized;
}

module.exports = {BRAND_KEY, loadBrand, saveBrand};
