// Pure-JS Ed25519 signature verification (RFC 8032), BigInt based.
// Only used when the browser has no WebCrypto Ed25519 (older Android Chrome / WebView,
// or a page opened over plain http on a LAN address where crypto.subtle does not exist).
const P = (1n << 255n) - 19n;
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const D = (((P - 121665n) % P) * modPow(121666n, P - 2n, P)) % P;
const I = modPow(2n, (P - 1n) / 4n, P);
const M64 = (1n << 64n) - 1n;

function mod(a, m = P) { const r = a % m; return r >= 0n ? r : r + m; }
function modPow(b, e, m) {
  let r = 1n;
  b %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

// ---- SHA-512 -------------------------------------------------------------
const K = [
  '428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc', '3956c25bf348b538', '59f111f1b605d019',
  '923f82a4af194f9b', 'ab1c5ed5da6d8118', 'd807aa98a3030242', '12835b0145706fbe', '243185be4ee4b28c', '550c7dc3d5ffb4e2',
  '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235', 'c19bf174cf692694', 'e49b69c19ef14ad2', 'efbe4786384f25e3',
  '0fc19dc68b8cd5b5', '240ca1cc77ac9c65', '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5',
  '983e5152ee66dfab', 'a831c66d2db43210', 'b00327c898fb213f', 'bf597fc7beef0ee4', 'c6e00bf33da88fc2', 'd5a79147930aa725',
  '06ca6351e003826f', '142929670a0e6e70', '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed', '53380d139d95b3df',
  '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b', 'a2bfe8a14cf10364', 'a81a664bbc423001',
  'c24b8b70d0f89791', 'c76c51a30654be30', 'd192e819d6ef5218', 'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8',
  '19a4c116b8d2d0c8', '1e376c085141ab53', '2748774cdf8eeb99', '34b0bcb5e19b48a8', '391c0cb3c5c95a63', '4ed8aa4ae3418acb',
  '5b9cca4f7763e373', '682e6ff3d6b2b8a3', '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec',
  '90befffa23631e28', 'a4506cebde82bde9', 'bef9a3f7b2c67915', 'c67178f2e372532b', 'ca273eceea26619c', 'd186b8c721c0c207',
  'eada7dd6cde0eb1e', 'f57d4f7fee6ed178', '06f067aa72176fba', '0a637dc5a2c898a6', '113f9804bef90dae', '1b710b35131c471b',
  '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc', '431d67c49c100d4c', '4cc5d4becb3e42b6', '597f299cfc657e2a',
  '5fcb6fab3ad6faec', '6c44198c4a475817',
].map((h) => BigInt(`0x${h}`));

const rotr = (x, n) => ((x >> n) | (x << (64n - n))) & M64;

export function sha512(bytes) {
  let h = [
    '6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1',
    '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179',
  ].map((x) => BigInt(`0x${x}`));
  const len = bytes.length;
  const padLen = (((len + 17 + 127) >> 7) << 7);
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[len] = 0x80;
  const bits = BigInt(len) * 8n;
  for (let i = 0; i < 16; i++) buf[padLen - 1 - i] = Number((bits >> BigInt(8 * i)) & 0xffn);
  const w = new Array(80);
  for (let off = 0; off < padLen; off += 128) {
    for (let i = 0; i < 16; i++) {
      let v = 0n;
      for (let j = 0; j < 8; j++) v = (v << 8n) | BigInt(buf[off + i * 8 + j]);
      w[i] = v;
    }
    for (let i = 16; i < 80; i++) {
      const s0 = rotr(w[i - 15], 1n) ^ rotr(w[i - 15], 8n) ^ (w[i - 15] >> 7n);
      const s1 = rotr(w[i - 2], 19n) ^ rotr(w[i - 2], 61n) ^ (w[i - 2] >> 6n);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & M64;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 80; i++) {
      const S1 = rotr(e, 14n) ^ rotr(e, 18n) ^ rotr(e, 41n);
      const ch = (e & f) ^ (~e & M64 & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) & M64;
      const S0 = rotr(a, 28n) ^ rotr(a, 34n) ^ rotr(a, 39n);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) & M64;
      hh = g; g = f; f = e; e = (d + t1) & M64; d = c; c = b; b = a; a = (t1 + t2) & M64;
    }
    h = [a, b, c, d, e, f, g, hh].map((x, i) => (h[i] + x) & M64);
  }
  const out = new Uint8Array(64);
  h.forEach((x, i) => { for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((x >> BigInt(8 * (7 - j))) & 0xffn); });
  return out;
}

// ---- Edwards25519 ----------------------------------------------------------
const leToBig = (bytes) => { let v = 0n; for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]); return v; };

function decodePoint(bytes) {
  if (bytes.length !== 32) return null;
  const copy = Uint8Array.from(bytes);
  const sign = copy[31] >> 7;
  copy[31] &= 0x7f;
  const y = leToBig(copy);
  if (y >= P) return null;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  let x = mod(u * modPow(v, 3n, P) * modPow(u * modPow(v, 7n, P), (P - 5n) / 8n, P));
  const vx2 = mod(v * x * x);
  if (vx2 !== u) {
    if (vx2 === mod(-u)) x = mod(x * I);
    else return null;
  }
  if (x === 0n && sign === 1) return null;
  if (Number(x & 1n) !== sign) x = mod(-x);
  return [x, y, 1n, mod(x * y)];
}

function add(p, q) {
  const [x1, y1, z1, t1] = p;
  const [x2, y2, z2, t2] = q;
  const a = mod((y1 - x1) * (y2 - x2));
  const b = mod((y1 + x1) * (y2 + x2));
  const c = mod(t1 * 2n * D * t2);
  const d = mod(z1 * 2n * z2);
  const e = b - a;
  const f = d - c;
  const g = d + c;
  const h = b + a;
  return [mod(e * f), mod(g * h), mod(f * g), mod(e * h)];
}

function mul(point, scalar) {
  let r = [0n, 1n, 1n, 0n];
  let q = point;
  let s = scalar;
  while (s > 0n) {
    if (s & 1n) r = add(r, q);
    q = add(q, q);
    s >>= 1n;
  }
  return r;
}

const GY = mod(4n * modPow(5n, P - 2n, P));
const BASE = decodePoint((() => {
  const out = new Uint8Array(32);
  let v = GY;
  for (let i = 0; i < 32; i++) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
})());

const samePoint = (p, q) => mod(p[0] * q[2]) === mod(q[0] * p[2]) && mod(p[1] * q[2]) === mod(q[1] * p[2]);

// publicKey: 32 raw bytes, signature: 64 bytes, message: Uint8Array. Cofactorless check, S < L enforced.
export function verifyEd25519(publicKey, signature, message) {
  try {
    if (!publicKey || publicKey.length !== 32 || !signature || signature.length !== 64) return false;
    const A = decodePoint(publicKey);
    const R = decodePoint(signature.slice(0, 32));
    if (!A || !R || !BASE) return false;
    const S = leToBig(signature.slice(32));
    if (S >= L) return false;
    const input = new Uint8Array(64 + message.length);
    input.set(signature.slice(0, 32), 0);
    input.set(publicKey, 32);
    input.set(message, 64);
    const h = mod(leToBig(sha512(input)), L);
    return samePoint(mul(BASE, S), add(R, mul(A, h)));
  } catch {
    return false;
  }
}
