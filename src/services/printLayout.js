const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const PRINT_LAYOUT_KEY = 'snapkiosk.print-layout.v1';
const DEFAULT_PRINT_LAYOUT = Object.freeze({frame: false, photoTop: 0, photoBottom: 0, elements: []});

function normalizePrintLayout(value = {}) {
  const elements = Array.isArray(value.elements) ? value.elements.slice(0, 12).map((element, index) => ({
    id: typeof element.id === 'string' ? element.id : `layout-text-${index}`,
    text: typeof element.text === 'string' ? element.text.slice(0, 160) : '',
    x: Number.isFinite(element.x) ? Math.max(0, Math.min(1, element.x)) : 0.1,
    y: Number.isFinite(element.y) ? Math.max(0, Math.min(1, element.y)) : 0.1,
    width: Number.isFinite(element.width) ? Math.max(0.1, Math.min(1, element.width)) : 0.8,
    size: Number.isInteger(element.size) ? Math.max(1, Math.min(6, element.size)) : 2,
    align: ['left', 'center', 'right'].includes(element.align) ? element.align : 'center',
    enabled: element.enabled !== false,
  })).filter(element => element.text.trim()) : [];
  const photoTop = Number.isFinite(value.photoTop) ? Math.max(0, Math.min(0.35, value.photoTop)) : 0;
  const photoBottom = Number.isFinite(value.photoBottom) ? Math.max(0, Math.min(0.35, value.photoBottom)) : 0;
  const paddingScale = photoTop + photoBottom > 0.5 ? 0.5 / (photoTop + photoBottom) : 1;
  return {frame: Boolean(value.frame), photoTop: photoTop * paddingScale, photoBottom: photoBottom * paddingScale, elements};
}

async function loadPrintLayout() {
  const saved = await AsyncStorage.getItem(PRINT_LAYOUT_KEY);
  return saved ? normalizePrintLayout(JSON.parse(saved)) : DEFAULT_PRINT_LAYOUT;
}

async function savePrintLayout(layout) {
  const normalized = normalizePrintLayout(layout);
  await AsyncStorage.setItem(PRINT_LAYOUT_KEY, JSON.stringify(normalized));
  return normalized;
}

module.exports = {DEFAULT_PRINT_LAYOUT, PRINT_LAYOUT_KEY, loadPrintLayout, normalizePrintLayout, savePrintLayout};
