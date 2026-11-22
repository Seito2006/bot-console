// Premium licence check. Key format: BC-XXXX-XXXX-CCCCCC (8 random chars + 6 check chars).
// Must stay in sync with keygen.mjs (same SALT, ALPHABET and hash).
const SALT = 'seito-bot-console/premium/v1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function hash53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function checkOf(body) {
  let n = hash53(SALT + body);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[n % ALPHABET.length];
    n = Math.floor(n / ALPHABET.length);
  }
  return out;
}

// Returns the canonical key ("BC-XXXX-XXXX-CCCCCC") or null when the text is not a valid key.
export function parseKey(raw) {
  let s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 16 && s.startsWith('BC')) s = s.slice(2);
  if (s.length !== 14) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  const body = s.slice(0, 8);
  const chk = s.slice(8);
  return checkOf(body) === chk ? `BC-${body.slice(0, 4)}-${body.slice(4)}-${chk}` : null;
}

let active = '';

export const premium = () => !!active;
export const licenseKey = () => active;

// Sets (or, with an empty/invalid value, clears) the active key. Returns true when Premium is on.
export function setLicense(raw) {
  active = parseKey(raw) || '';
  return !!active;
}

export const maskKey = (k) => (k ? `${k.slice(0, 7)}••••-••••${k.slice(-2)}` : '');
