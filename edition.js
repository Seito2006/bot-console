import { verifyEd25519 } from './ed25519.js';

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

const SPKI_PREFIX = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];

function rawPublicKey(kid) {
  const spki = decodeBase64Url(VERIFY_KEYS[kid]);
  if (!spki || spki.length !== 44 || SPKI_PREFIX.some((b, i) => spki[i] !== b)) return null;
  return spki.slice(12);
}

async function subtleKey(kid) {
  const encoded = VERIFY_KEYS[kid];
  if (!encoded || !globalThis.crypto?.subtle) return null;
  if (!verifierCache.has(kid)) {
    const bytes = decodeBase64Url(encoded);
    verifierCache.set(kid, bytes
      ? crypto.subtle.importKey('spki', bytes, { name: 'Ed25519' }, false, ['verify']).catch(() => null)
      : Promise.resolve(null));
  }
  try { return await verifierCache.get(kid); } catch { return null; }
}

// WebCrypto first. Browsers without Ed25519 in WebCrypto (older Android Chrome / WebView) or pages
// served over plain http (no crypto.subtle) fall back to the bundled pure-JS verifier, which checks
// the very same signature against the very same public key.
async function signatureValid(kid, message, signature) {
  const key = await subtleKey(kid);
  if (key) {
    try { return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, message); } catch { /* fall through */ }
  }
  const raw = rawPublicKey(kid);
  return !!raw && verifyEd25519(raw, signature, message);
}

let lastReason = '';
export const licenseReason = () => lastReason;

// Signed license format: BC1.<base64url-payload>.<base64url-Ed25519-signature>
// The signature covers the exact text "BC1.<base64url-payload>".
// Returns { key, reason }: key is the normalised license text when valid, otherwise '' and a reason
// ('empty' | 'format' | 'clock' | 'expired' | 'signature').
export async function checkKey(raw) {
  const value = String(raw ?? '').replace(/\s+/g, '');
  if (!value) return { key: '', reason: 'empty' };
  if (value.length > 1024) return { key: '', reason: 'format' };
  const [prefix, encodedPayload, encodedSignature, extra] = value.split('.');
  if (prefix !== 'BC1' || !encodedPayload || !encodedSignature || extra !== undefined) return { key: '', reason: 'format' };

  try {
    const payloadBytes = decodeBase64Url(encodedPayload);
    const signature = decodeBase64Url(encodedSignature);
    if (!payloadBytes || !signature || signature.length !== 64) return { key: '', reason: 'format' };

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload || payload.v !== 1 || payload.p !== 'bot-console' || !UUID.test(payload.id)) return { key: '', reason: 'format' };
    if (!Number.isSafeInteger(payload.iat) || (payload.exp !== null && !Number.isSafeInteger(payload.exp))) return { key: '', reason: 'format' };

    const now = Math.floor(Date.now() / 1000);
    if (payload.iat > now + 300) return { key: '', reason: 'clock' };
    if (payload.exp !== null && (payload.exp <= now || payload.exp <= payload.iat)) return { key: '', reason: 'expired' };

    const message = encoder.encode(`${prefix}.${encodedPayload}`);
    if (!await signatureValid(payload.kid, message, signature)) return { key: '', reason: 'signature' };
    return { key: `${prefix}.${encodedPayload}.${encodedSignature}`, reason: '' };
  } catch {
    return { key: '', reason: 'format' };
  }
}

export async function parseKey(raw) {
  return (await checkKey(raw)).key || null;
}

export const premium = () => !!active;
export const licenseKey = () => active;

export async function setLicense(raw) {
  const r = await checkKey(raw);
  active = r.key;
  lastReason = r.reason;
  return !!active;
}

export function clearLicense() {
  active = '';
  lastReason = '';
}

export const maskKey = (key) => {
  if (!key) return '';
  const [prefix, payload] = String(key).split('.');
  return payload ? `${prefix}.${payload.slice(0, 8)}…` : `${String(key).slice(0, 7)}…`;
};
