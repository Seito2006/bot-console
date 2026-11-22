const VERIFY_KEYS = {
  k1: 'MCowBQYDK2VwAyEAxvBccLYD9Ssybk5Gi85dHDd4QOoJCzFwA0aVsdIMGs8',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const verifierCache = new Map();
const encoder = new TextEncoder();
let active = '';

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function verificationKey(kid) {
  const encoded = VERIFY_KEYS[kid];
  if (!encoded || !globalThis.crypto?.subtle) return null;
  if (!verifierCache.has(kid)) {
    const bytes = decodeBase64Url(encoded);
    verifierCache.set(kid, bytes
      ? crypto.subtle.importKey('spki', bytes, { name: 'Ed25519' }, false, ['verify'])
      : Promise.resolve(null));
  }
  try { return await verifierCache.get(kid); } catch { return null; }
}

// Signed license format: BC1.<base64url-payload>.<base64url-Ed25519-signature>
// The signature covers the exact text "BC1.<base64url-payload>".
export async function parseKey(raw) {
  const value = String(raw ?? '').replace(/\s+/g, '');
  if (!value || value.length > 1024) return null;
  const [prefix, encodedPayload, encodedSignature, extra] = value.split('.');
  if (prefix !== 'BC1' || !encodedPayload || !encodedSignature || extra !== undefined) return null;

  try {
    const payloadBytes = decodeBase64Url(encodedPayload);
    const signature = decodeBase64Url(encodedSignature);
    if (!payloadBytes || !signature || signature.length !== 64) return null;

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload || payload.v !== 1 || payload.p !== 'bot-console' || !UUID.test(payload.id)) return null;
    if (!Number.isSafeInteger(payload.iat) || (payload.exp !== null && !Number.isSafeInteger(payload.exp))) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.iat > now + 300) return null;
    if (payload.exp !== null && (payload.exp <= now || payload.exp <= payload.iat)) return null;

    const key = await verificationKey(payload.kid);
    if (!key) return null;
    const message = encoder.encode(`${prefix}.${encodedPayload}`);
    const valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, message);
    return valid ? `${prefix}.${encodedPayload}.${encodedSignature}` : null;
  } catch {
    return null;
  }
}

export const premium = () => !!active;
export const licenseKey = () => active;

export async function setLicense(raw) {
  active = await parseKey(raw) || '';
  return !!active;
}

export const maskKey = (key) => {
  if (!key) return '';
  const [prefix, payload] = String(key).split('.');
  return payload ? `${prefix}.${payload.slice(0, 8)}…` : `${String(key).slice(0, 7)}…`;
};
