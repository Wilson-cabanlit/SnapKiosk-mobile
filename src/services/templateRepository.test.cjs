const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeEventTemplate} = require('./templateRepository');

function assignedConfiguration(elements = [{id: 'photo-1', type: 'photo', x: 10, y: 20, width: 200, height: 300}]) {
  const layout = {schemaVersion: '1.0', outputFormat: 'color', width: 600, height: 900, background: '#ffffff', elements};
  const thermal58 = {...layout, outputFormat: 'thermal-58mm', width: 384, height: 576};
  const thermal80 = {...layout, outputFormat: 'thermal-80mm', width: 576, height: 864};
  return {
    eventId: 'event-1', eventName: 'Wedding', version: 4, publishedAt: '2026-11-25T00:00:00.000Z',
    configuration: {eventId: 'event-1', templateId: 'free-blue-boarding-pass', templateVersionId: 'template-version-3', template: {
      ...layout, templateVersion: 3, outputFormat: 'ticket-6x4', width: 600, height: 900,
      metadata: {requiredPhotoCount: 1, supportedPaperFormats: ['color', 'thermal58', 'thermal80']},
      variants: {color: layout, thermal58, thermal80},
    }},
  };
}

test('normalizes the embedded assigned template and retains all output variants', () => {
  const template = normalizeEventTemplate(assignedConfiguration().configuration, assignedConfiguration(), 'profile-a');
  assert.equal(template.source, 'central');
  assert.equal(template.eventId, 'event-1');
  assert.equal(template.configurationVersion, 4);
  assert.equal(template.version, 3);
  assert.equal(template.templateVersionId, 'template-version-3');
  assert.equal(template.photoSlots.length, 1);
  assert.deepEqual(Object.keys(template.templateSchema.variants).sort(), ['color', 'thermal58', 'thermal80']);
});

test('rejects a published template requiring unavailable private assets', () => {
  const payload = assignedConfiguration([{id: 'logo', type: 'photo', x: 0, y: 0, width: 100, height: 100, assetId: 'private-logo'}]);
  assert.throws(() => normalizeEventTemplate(payload.configuration, payload, 'profile-a'), /device-authenticated asset download route/);
});

test('rejects unsupported element types rather than activating a partial design', () => {
  const payload = assignedConfiguration([{id: 'graphic', type: 'graphic', x: 0, y: 0, width: 100, height: 100}]);
  assert.throws(() => normalizeEventTemplate(payload.configuration, payload, 'profile-a'), /not supported on this kiosk/);
});

test('accepts Web Admin variant-only template containers and JSON-encoded template data', () => {
  const payload = assignedConfiguration();
  const assigned = payload.configuration.template;
  payload.configuration.template = JSON.stringify({
    name: 'Assigned wedding design',
    variants: assigned.variants,
    metadata: assigned.metadata,
  });
  const template = normalizeEventTemplate(payload.configuration, payload, 'profile-a');
  assert.equal(template.name, 'Assigned wedding design');
  assert.equal(template.photoSlots.length, 1);
  assert.ok(template.templateSchema.variants.thermal58);
});

test('gives actionable guidance when the event was published without a template', () => {
  const event = {eventId: 'event-1', eventName: 'Wedding', version: 1, configuration: {eventId: 'event-1', templateId: null}};
  assert.throws(() => normalizeEventTemplate(event.configuration, event, 'profile-a'), /Template Library, publish a template, assign it to this event/);
});
