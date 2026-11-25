const keychainModule = require('react-native-keychain');
const Keychain = keychainModule.default || keychainModule;
const {loadDeviceConfig} = require('./deviceConfig');
const {transitionSession, upsertSession} = require('./sessionRepository');
const {composeSession} = require('./composition/composer');

const LEGACY_DEVICE_CREDENTIAL_SERVICE = 'com.snapkiosk.device-credential';
const DEVICE_CREDENTIAL_SERVICE_PREFIX = 'com.snapkiosk.device-credential.';

function secureBytes(length) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error('Secure random generation is unavailable. Reinstall the latest SnapKiosk build, then try pairing again.');
  const remoteChromeDebugger = global.__DEV__ && global['RN$Bridgeless'] !== true && typeof global.nativeCallSyncHook === 'undefined';
  if (remoteChromeDebugger) throw new Error('Secure pairing is disabled while remote JavaScript debugging is active. Close the remote debugger and reload SnapKiosk.');
  const bytes = new Uint8Array(length);
  cryptoApi.getRandomValues(bytes);
  return bytes;
}

function randomToken(length = 32) {
  return Array.from(secureBytes(length), byte => byte.toString(16).padStart(2, '0')).join('');
}

function profileIdForApiUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '').toLowerCase();
  const bytes = new Uint8Array(normalized.length);
  for (let index = 0; index < normalized.length; index += 1) bytes[index] = normalized.charCodeAt(index) & 0xff;
  return sha256(bytes).slice(0, 24);
}

async function activeProfileId() {
  const config = await loadDeviceConfig();
  if (config.backend?.mode === 'standalone' || !config.backend?.apiBaseUrl) return null;
  return profileIdForApiUrl(config.backend?.apiBaseUrl);
}

function sha256(bytes) {
  const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const hash = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const words = new Uint32Array(64);
  const rotate = (value, count) => (value >>> count) | (value << (32 - count));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15]; const b = words[index - 2];
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + constants[index] + words[index]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, word => word.toString(16).padStart(8, '0')).join('');
}

async function readCredential(profileId = null) {
  const resolvedProfileId = profileId || await activeProfileId();
  if (!resolvedProfileId) return null;
  const service = `${DEVICE_CREDENTIAL_SERVICE_PREFIX}${resolvedProfileId}`;
  let stored = await Keychain.getGenericPassword({service});
  if (!stored) {
    stored = await Keychain.getGenericPassword({service: LEGACY_DEVICE_CREDENTIAL_SERVICE});
    if (stored) {
      try {
        await saveCredential(JSON.parse(stored.password), resolvedProfileId);
        await Keychain.resetGenericPassword({service: LEGACY_DEVICE_CREDENTIAL_SERVICE});
      } catch { return null; }
    }
  }
  if (!stored) return null;
  try { return JSON.parse(stored.password); } catch { return null; }
}

async function saveCredential(value, profileId = null) {
  const resolvedProfileId = profileId || await activeProfileId();
  if (!resolvedProfileId) throw new Error('Save a non-standalone API address before pairing this kiosk.');
  const saved = await Keychain.setGenericPassword('device', JSON.stringify(value), {
    service: `${DEVICE_CREDENTIAL_SERVICE_PREFIX}${resolvedProfileId}`,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (!saved) throw new Error('The device credential could not be saved securely.');
}

async function apiRequest(path, {method = 'GET', body, token, headers = {}} = {}) {
  const config = await loadDeviceConfig();
  const base = String(config.backend?.apiBaseUrl || '').trim().replace(/\/+$/, '');
  if (!base || config.backend?.mode === 'standalone') throw new Error('Set and test the API address in administrator Backend Connection settings first.');
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: `Bearer ${token}`} : {}), ...headers},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || `SnapKiosk API request failed (${response.status}).`);
  return result.data;
}

async function beginPairing({name, model = 'Android photo kiosk', appVersion = '0.1.0'}) {
  const pairingCode = randomToken(32);
  const request = await apiRequest('/devices/pairing-requests', {
    method: 'POST',
    body: {pairingCode, name, model, appVersion},
  });
  return {...request, pairingCode};
}

async function completePairing(pairingCode, profileId = null, deviceName = null) {
  const result = await apiRequest('/devices/pairing/complete', {method: 'POST', body: {pairingCode}});
  await saveCredential({deviceId: result.deviceId, credential: result.credential, deviceName, pairedAt: new Date().toISOString()}, profileId);
  return result;
}

async function registerAndUploadSession({session, digitalPath, thermalPath, gifBytes, consentAt}) {
  const paired = await readCredential();
  if (!paired?.credential) throw new Error('Pair this kiosk with the SnapKiosk web platform before creating a guest download link.');
  const savedConfig = await loadDeviceConfig();
  const gallery = String(savedConfig.backend?.galleryBaseUrl || '').replace(/\/+$/, '');
  if (!gallery) throw new Error('Set the guest Gallery Base URL in administrator Backend Connection settings.');
  const deviceConfig = await apiRequest('/devices/configuration', {token: paired.credential});
  const eventId = deviceConfig?.eventId || deviceConfig?.configuration?.eventId;
  if (!eventId) throw new Error('This kiosk is not assigned to an active event. Assign it in SnapKiosk Event Setup, publish its configuration, and try again.');
  const guestToken = randomToken(32);
  const capturedAt = session.photos?.[0]?.capturedAt || session.createdAt;
  const registration = await apiRequest('/device/sessions', {
    method: 'POST',
    token: paired.credential,
    body: {
      eventId,
      capturedAt,
      idempotencyKey: session.deliveryIdempotencyKey || randomToken(24),
      guestToken,
      clientGalleryEligible: false,
      consents: [
        {type: 'capture_storage', granted: true, recordedAt: consentAt, source: 'kiosk'},
        {type: 'individual_delivery', granted: true, recordedAt: consentAt, source: 'kiosk'},
      ],
    },
  });
  const assets = [
    {assetType: 'composition', contentType: 'image/jpeg', path: digitalPath, key: 'digital'},
    {assetType: 'thumbnail', contentType: 'image/png', path: thermalPath, key: 'receipt'},
    {assetType: 'composition', contentType: 'image/gif', bytes: gifBytes, key: 'animated'},
  ];
  for (const asset of assets) {
    let bytes;
    if (asset.bytes) bytes = new Uint8Array(asset.bytes);
    else {
      const fileResponse = await fetch(asset.path.startsWith('file://') ? asset.path : `file://${asset.path}`);
      if (!fileResponse.ok) throw new Error(`Could not read the ${asset.key} image for upload.`);
      bytes = new Uint8Array(await fileResponse.arrayBuffer());
    }
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error(`The ${asset.key} image must be between 1 byte and 25 MB.`);
    const sha = sha256(bytes);
    const authorization = await apiRequest(`/device/sessions/${encodeURIComponent(registration.sessionId)}/assets`, {
      method: 'POST', token: paired.credential,
      body: {assetType: asset.assetType, contentType: asset.contentType, sizeBytes: bytes.length, sha256: sha, idempotencyKey: `${session.id}-${asset.key}-${sha}`.slice(0, 160)},
    });
    if (authorization.status === 'uploaded') continue;
    const uploadUrl = new URL(authorization.uploadUrl);
    const configuredApi = new URL((await loadDeviceConfig()).backend.apiBaseUrl);
    if (uploadUrl.origin !== configuredApi.origin) throw new Error('The API returned an upload destination on a different server. Check the backend configuration.');
    const upload = await fetch(authorization.uploadUrl, {
      method: 'PUT',
      headers: {...authorization.headers, 'X-Upload-Token': authorization.uploadToken, 'X-Content-SHA256': sha},
      body: bytes,
    });
    const uploadResult = await upload.json().catch(() => ({}));
    if (!upload.ok || uploadResult.data?.uploaded !== true) throw new Error(uploadResult.error?.message || `The ${asset.key} image upload failed (${upload.status}).`);
  }
  const galleryLink = new URL(registration.guestUrl);
  const downloadUrl = `${gallery}${galleryLink.pathname}`;
  const check = await fetch(`${(await loadDeviceConfig()).backend.apiBaseUrl.replace(/\/+$/, '')}/gallery/guest/${encodeURIComponent(guestToken)}`, {headers: {Accept: 'application/json'}});
  const checkBody = await check.json().catch(() => ({}));
  if (!check.ok || checkBody.data?.status !== 'active') throw new Error('The guest gallery has not confirmed that the uploaded files are ready. No QR link was created.');
  return {downloadUrl, expiresAt: registration.guestExpiresAt, remoteSessionId: registration.sessionId};
}

async function deliverConsentedSession(session, generatedComposition = null) {
  if (session.downloadUrl && session.uploadStatus === 'available') return session;
  if (!session.digitalDeliveryConsentAt) throw new Error('This customer did not opt in to digital photo delivery.');
  const generated = generatedComposition || await composeSession(session.id, session.composition?.filterId || 'original', {includeGif: true});
  if (!generated.digitalPath || !generated.thermalPath || !generated.gifBytes?.length) throw new Error('The printable composition, receipt, and animated GIF could not be prepared.');
  const prepared = {...session, deliveryIdempotencyKey: session.deliveryIdempotencyKey || `session-${session.id}`};
  await upsertSession(prepared);
  const result = await registerAndUploadSession({session: prepared, digitalPath: generated.digitalPath, thermalPath: generated.thermalPath, gifBytes: generated.gifBytes, consentAt: prepared.digitalDeliveryConsentAt});
  const delivered = prepared.status === 'print' ? transitionSession(prepared, 'delivery') : prepared;
  return upsertSession({...delivered, uploadStatus: 'available', downloadUrl: result.downloadUrl, deliveryExpiresAt: result.expiresAt, remoteSessionId: result.remoteSessionId});
}

module.exports = {activeProfileId, apiRequest, beginPairing, completePairing, deliverConsentedSession, profileIdForApiUrl, readCredential, registerAndUploadSession, sha256};
