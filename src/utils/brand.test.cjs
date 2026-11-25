const test = require('node:test');
const assert = require('node:assert/strict');
const {DEFAULT_BRAND, normalizeBrand} = require('./brand');
const {isValidPin} = require('./pin');
const {LOCKOUT_MS, nextFailedAttempt} = require('./authAttempts');

test('brand config fills unspecified defaults and merges colors', () => {
  const brand = normalizeBrand({businessName: 'Mila Studio', colors: {coral: '#ff0000'}});
  assert.equal(brand.businessName, 'Mila Studio');
  assert.equal(brand.welcomeMessage, DEFAULT_BRAND.welcomeMessage);
  assert.equal(brand.colors.coral, '#ff0000');
  assert.equal(brand.colors.cream, DEFAULT_BRAND.colors.cream);
});

test('administrator PIN accepts exactly six digits', () => {
  assert.equal(isValidPin('123456'), true);
  assert.equal(isValidPin('12345'), false);
  assert.equal(isValidPin('12345a'), false);
  assert.equal(isValidPin(' 123456'), false);
});

test('administrator attempts pause for one minute after five failures in the window', () => {
  const start = 1_000_000;
  let state = {};
  for (let index = 0; index < 5; index += 1) state = nextFailedAttempt(state, start + index * 1000);
  assert.equal(state.failures, 5);
  assert.equal(state.lockedUntil, start + 4_000 + LOCKOUT_MS);
});

test('administrator attempt window resets after five minutes', () => {
  const state = nextFailedAttempt({failures: 4, startedAt: 10_000}, 10_000 + 5 * 60 * 1000 + 1);
  assert.equal(state.failures, 1);
});
