const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const TEMPLATE_KEY = 'snapkiosk.templates.v1';
const PRESETS = {
  single: {
    label: 'Single photo', width: 2, height: 3,
    photoSlots: [{x: 0.055, y: 0.045, width: 0.89, height: 0.78}],
  },
  strip2: {
    label: 'Two-photo strip', width: 2, height: 6,
    photoSlots: [
      {x: 0.06, y: 0.04, width: 0.88, height: 0.43},
      {x: 0.06, y: 0.53, width: 0.88, height: 0.43},
    ],
  },
  strip4: {
    label: 'Four-photo strip', width: 2, height: 6,
    photoSlots: [0, 1, 2, 3].map(index => ({x: 0.06, y: 0.035 + index * 0.24, width: 0.88, height: 0.215})),
  },
  grid4: {
    label: 'Four-photo grid', width: 4, height: 3,
    photoSlots: [
      {x: 0.04, y: 0.04, width: 0.44, height: 0.44},
      {x: 0.52, y: 0.04, width: 0.44, height: 0.44},
      {x: 0.04, y: 0.52, width: 0.44, height: 0.44},
      {x: 0.52, y: 0.52, width: 0.44, height: 0.44},
    ],
  },
};

function createId() {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTemplate(presetId, name) {
  const preset = PRESETS[presetId];
  if (!preset) throw new Error('Choose a supported photo layout.');
  return {
    id: createId(), name: name.trim(), presetId, enabled: true, version: 1,
    canvas: {width: preset.width, height: preset.height, unit: 'normalized'},
    photoSlots: preset.photoSlots.map(slot => ({...slot})),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function validateTemplate(template) {
  if (!template || typeof template.name !== 'string' || !template.name.trim()) return 'Template name is required.';
  if (!template.canvas || template.canvas.unit !== 'normalized') return 'Template canvas must use normalized coordinates.';
  if (!Array.isArray(template.photoSlots) || template.photoSlots.length < 1 || template.photoSlots.length > 8) return 'A template must contain between one and eight photo slots.';
  for (const slot of template.photoSlots) {
    if (['x', 'y', 'width', 'height'].some(key => !Number.isFinite(slot[key]))) return 'Photo slot coordinates must be numbers.';
    if (slot.x < 0 || slot.y < 0 || slot.width <= 0 || slot.height <= 0 || slot.x + slot.width > 1 || slot.y + slot.height > 1) return 'Every photo slot must stay inside the normalized canvas.';
  }
  return null;
}

async function listTemplates() {
  const saved = await AsyncStorage.getItem(TEMPLATE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) return parsed;
  }
  const defaults = [
    createTemplate('single', 'Classic portrait'),
    createTemplate('strip2', 'Two-photo strip'),
    createTemplate('strip4', 'Four-photo strip'),
    createTemplate('grid4', 'Four-photo collage'),
  ];
  await AsyncStorage.setItem(TEMPLATE_KEY, JSON.stringify(defaults));
  return defaults;
}

async function saveTemplates(templates) {
  const invalid = templates.map(validateTemplate).find(Boolean);
  if (invalid) throw new Error(invalid);
  await AsyncStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
  return templates;
}

module.exports = {PRESETS, TEMPLATE_KEY, createTemplate, listTemplates, saveTemplates, validateTemplate};
