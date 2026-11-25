const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const TEMPLATE_KEY = 'snapkiosk.templates.v1';
const SYNC_CACHE_KEY = 'snapkiosk.event-sync-cache.v1';
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
    id: createId(), name: name.trim(), presetId, enabled: true, version: 1, source: 'local',
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

function eventTemplateKey(profileId, eventId) {
  return `${profileId}:${eventId}`;
}

function requiredPhotoCount(template) {
  return Math.max(1, Number(template?.metadata?.requiredPhotoCount) || 0,
    (template?.variants?.color || template)?.elements?.filter(element => element.type === 'photo').length || 0);
}

function displayTemplateName(configuration, event) {
  const explicit = event.templateName || configuration.templateName || configuration.template?.name || configuration.template?.metadata?.name;
  if (explicit) return explicit;
  const id = String(configuration.templateId || 'event-layout').replace(/^free-/, '').replace(/-[a-f0-9]{8,}$/i, '');
  if (/^[a-f0-9-]{24,}$/i.test(id)) return 'Event layout';
  return id.split(/[-_]/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ') || event.eventName || 'Event template';
}

function parseTemplateObject(value) {
  if (typeof value === 'string') {
    try {return JSON.parse(value);} catch {return null;}
  }
  return value && typeof value === 'object' ? value : null;
}

function resolveTemplateDefinition(eventConfiguration) {
  let config = parseTemplateObject(eventConfiguration) || {};
  if (config.configuration && typeof config.configuration === 'object' && !config.template && !config.templateDefinition) config = config.configuration;
  let container = parseTemplateObject(config.template || config.templateDefinition || config.assignedTemplate || config.photoTemplate || config.templateLayout || config.templateJson || config.layout);
  if (Array.isArray(container)) container = container.find(item => item.id === config.templateId) || container[0] || null;
  if (container && !Array.isArray(container)) {
    if (!container.elements && !container.variants && container.template) container = parseTemplateObject(container.template);
    if (!container?.elements && !container?.variants) container = parseTemplateObject(container?.schema || container?.definition || container?.layout) || container;
  }
  const variantSource = parseTemplateObject(container?.variants || config.templateVariants || config.variants) || {};
  const layoutLike = layout => layout && Number.isFinite(layout.width) && Number.isFinite(layout.height) && Array.isArray(layout.elements);
  const base = layoutLike(container) ? container : parseTemplateObject(variantSource.color || variantSource.thermal58 || variantSource.thermal80);
  if (!layoutLike(base)) {
    const templateKeys = container && typeof container === 'object' ? Object.keys(container).slice(0, 16).join(', ') : `none (event configuration fields: ${Object.keys(config).slice(0, 16).join(', ') || 'none'})`;
    throw new Error(`This event configuration has no supported template layout (received template fields: ${templateKeys}). In Web Admin, open Template Library, publish a template, assign it to this event, then sync again.`);
  }
  const variants = {};
  for (const [name, value] of Object.entries(variantSource)) {
    const layout = parseTemplateObject(value);
    if (layoutLike(layout)) variants[name] = layout;
  }
  if (!variants.color && base.outputFormat !== 'thermal-58mm' && base.outputFormat !== 'thermal-80mm') variants.color = base;
  return {
    container,
    schema: {...base, variants},
    metadata: base.metadata || container?.metadata || {},
    name: container?.name || config.templateName || null,
    templateId: config.templateId || container?.id || null,
    templateVersionId: config.templateVersionId || container?.versionId || null,
  };
}

function normalizeEventTemplate(configuration, event, profileId) {
  const resolved = resolveTemplateDefinition(configuration);
  const source = resolved.schema;
  const metadata = resolved.metadata;
  if (!/^1\.\d+$/.test(source.schemaVersion || '') || !Number.isFinite(source.width) || !Number.isFinite(source.height) || !Array.isArray(source.elements)) {
    throw new Error(`The assigned template uses schema “${source.schemaVersion || 'missing'}”; this kiosk requires a supported 1.x template schema.`);
  }
  const layouts = {...(source.variants || {}), ...(source.outputFormat === 'color' ? {color: source} : {})};
  const variants = Object.keys(layouts).length ? layouts : {color: source};
  const allowedTypes = new Set(['photo', 'text', 'shape']);
  for (const [variantName, layout] of Object.entries(variants)) {
    if (!/^1\.\d+$/.test(layout?.schemaVersion || source.schemaVersion) || !Number.isFinite(layout?.width) || !Number.isFinite(layout?.height) || layout.width <= 0 || layout.height <= 0 || !Array.isArray(layout.elements) || layout.elements.length > 100) {
      throw new Error(`Template variant “${variantName}” has an unsupported schema or invalid dimensions.`);
    }
    for (const element of layout.elements) {
      if (!allowedTypes.has(element.type)) throw new Error(`Template element type “${element.type}” is not supported on this kiosk.`);
      if (element.assetId) throw new Error('This template requires private design assets, but the web API does not provide a device-authenticated asset download route.');
      if (![element.x, element.y, element.width, element.height].every(Number.isFinite) || element.x < 0 || element.y < 0 || element.width <= 0 || element.height <= 0 || element.x + element.width > layout.width || element.y + element.height > layout.height) throw new Error('The template contains invalid element coordinates.');
    }
  }
  const colorLayout = variants.color || Object.values(variants)[0];
  const slots = colorLayout.elements.filter(element => element.type === 'photo');
  if (slots.length < 1) throw new Error('The assigned template needs at least one photo element.');
  const mappedPhotoIndexes = slots.map((element, index) => Number(String(element.id || '').match(/photo[-_ ]?(\d+)/i)?.[1]) || index + 1);
  const templateId = resolved.templateId || metadata.id || `event-${event.eventId}`;
  const templateVersion = Number(source.templateVersion || metadata.templateVersion || 1);
  return {
    id: `web-${profileId}-${event.eventId}-${templateId}`,
    name: resolved.name || displayTemplateName(configuration, event),
    enabled: true,
    version: Number.isFinite(templateVersion) ? templateVersion : 1,
    source: 'central',
    profileId,
    eventId: event.eventId,
    configurationVersion: event.version,
    templateVersionId: resolved.templateVersionId,
    eventVariables: event.configuration || {},
    requiredPhotoCount: Math.max(Number(metadata.requiredPhotoCount) || 0, slots.length, ...mappedPhotoIndexes, 1),
    supportedPaperFormats: metadata.supportedPaperFormats || Object.keys(variants),
    digitalOutputs: ['digital-copy.jpg', 'receipt-copy.png', 'animated-copy.gif'].filter((_, index) => {
      const declared = metadata.digitalOutputs || [];
      return index === 0 ? declared.some(output => /^digital-copy\.(png|jpe?g)$/i.test(output))
        : index === 1 ? declared.some(output => /^receipt-copy\.png$/i.test(output))
          : declared.some(output => /^animated-copy\.gif$/i.test(output)) && metadata.gif?.enabled !== false;
    }),
    templateSchemaVersion: source.schemaVersion,
    templateSchema: {...source, variants},
    canvas: {width: 1, height: colorLayout.height / colorLayout.width, unit: 'normalized'},
    photoSlots: slots.map((element, index) => ({x: element.x / colorLayout.width, y: element.y / colorLayout.height, width: element.width / colorLayout.width, height: element.height / colorLayout.height, fit: element.fit || 'cover', photoIndex: mappedPhotoIndexes[index] - 1})),
    presetId: 'web-template',
    createdAt: event.publishedAt || new Date().toISOString(),
    updatedAt: event.publishedAt || new Date().toISOString(),
  };
}

async function readSyncCache() {
  const raw = await AsyncStorage.getItem(SYNC_CACHE_KEY);
  if (!raw) return {profiles: {}};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && parsed.profiles ? parsed : {profiles: {}};
}

async function getSyncState(profileId) {
  const cache = await readSyncCache();
  return profileId ? cache.profiles[profileId] || null : null;
}

async function activateEventConfiguration(profileId, eventId, configuration, template, syncInfo) {
  const cache = await readSyncCache();
  const previous = cache.profiles[profileId] || {events: {}};
  const events = {...(previous.events || {})};
  events[eventId] = {configuration, template, syncInfo};
  const next = {...cache, profiles: {...cache.profiles, [profileId]: {...previous, syncFailure: null, lastSyncOutcome: {kind: 'success', title: 'Synchronized successfully', detail: `Configuration v${syncInfo.serverVersion} is active.`, at: syncInfo.syncedAt}, activeEventId: eventId, events}}};
  await AsyncStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(next));
  return next.profiles[profileId];
}

async function stageEventConfiguration(profileId, eventId, configuration, template, syncInfo) {
  const cache = await readSyncCache();
  const previous = cache.profiles[profileId] || {events: {}};
  const events = {...(previous.events || {})};
  events[eventId] = {...events[eventId], pending: {configuration, template, syncInfo}};
  const next = {...cache, profiles: {...cache.profiles, [profileId]: {...previous, syncFailure: null, lastSyncOutcome: {kind: 'pending', title: 'Update downloaded · waiting for session to finish', detail: `Server configuration v${syncInfo.serverVersion} will activate when the kiosk is idle.`, at: syncInfo.syncedAt}, events}}};
  await AsyncStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(next));
  return next.profiles[profileId];
}

async function recordSyncFailure(profileId, message) {
  if (!profileId) return null;
  const cache = await readSyncCache();
  const previous = cache.profiles[profileId] || {events: {}};
  const failedAt = new Date().toISOString();
  const detail = String(message || 'Synchronization failed.');
  const next = {...cache, profiles: {...cache.profiles, [profileId]: {...previous, syncFailure: {message: detail, failedAt}, lastSyncOutcome: {kind: 'failed', title: 'Synchronization failed', detail, at: failedAt}}}};
  await AsyncStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(next));
  return next.profiles[profileId];
}

async function recordSyncOutcome(profileId, outcome) {
  if (!profileId) return null;
  const cache = await readSyncCache();
  const previous = cache.profiles[profileId] || {events: {}};
  const next = {...cache, profiles: {...cache.profiles, [profileId]: {...previous, ...(outcome.kind === 'failed' ? {} : {syncFailure: null}), lastSyncOutcome: {...outcome, at: new Date().toISOString()}}}};
  await AsyncStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(next));
  return next.profiles[profileId];
}

async function activatePendingEventConfiguration(profileId) {
  const cache = await readSyncCache();
  const previous = cache.profiles[profileId];
  if (!previous) return null;
  const events = {...(previous.events || {})};
  const nextEvent = Object.entries(events).filter(([, value]) => value.pending).sort((left, right) => Number(right[1].pending.syncInfo?.serverVersion || 0) - Number(left[1].pending.syncInfo?.serverVersion || 0))[0];
  if (!nextEvent) return previous;
  const [eventId, value] = nextEvent;
  const {pending, ...current} = value;
  events[eventId] = {...current, configuration: pending.configuration, template: pending.template, syncInfo: pending.syncInfo};
  const updated = {...cache, profiles: {...cache.profiles, [profileId]: {...previous, syncFailure: null, lastSyncOutcome: {kind: 'success', title: 'Synchronized successfully', detail: `Configuration v${pending.syncInfo?.serverVersion ?? '—'} is active.`, at: new Date().toISOString()}, activeEventId: eventId, events}}};
  await AsyncStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(updated));
  return updated.profiles[profileId];
}

async function listEventTemplates(profileId, eventId) {
  const state = await getSyncState(profileId);
  const selectedEventId = eventId || state?.activeEventId;
  const entry = selectedEventId ? state?.events?.[selectedEventId] : null;
  return entry?.template?.enabled ? [entry.template] : [];
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

async function listCustomerTemplates(profileId, eventId) {
  const synced = await listEventTemplates(profileId, eventId);
  if (synced.length) return synced;
  return (await listTemplates()).filter(template => template.enabled && template.source !== 'central');
}

async function saveTemplates(templates) {
  const invalid = templates.map(validateTemplate).find(Boolean);
  if (invalid) throw new Error(invalid);
  await AsyncStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
  return templates;
}

module.exports = {
  PRESETS, SYNC_CACHE_KEY, TEMPLATE_KEY, activateEventConfiguration,
  activatePendingEventConfiguration, createTemplate, eventTemplateKey, getSyncState,
  listCustomerTemplates, listEventTemplates, listTemplates, normalizeEventTemplate,
  readSyncCache, recordSyncFailure, recordSyncOutcome, requiredPhotoCount, resolveTemplateDefinition, saveTemplates, stageEventConfiguration,
  validateTemplate,
};
