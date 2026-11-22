export const DEFAULT_SHOP = {
  currency: { name: 'Coin', icon: 'fa-coins' },
  start: 1000,
  items: [
    { id: 'repair-kit', cat: 'ใช้ในภารกิจ', name: 'ชุดซ่อมแซมสนาม', price: 120, desc: 'ซ่อมแซมชุดเกราะและอุปกรณ์ระหว่างภารกิจ' },
    { id: 'hp-potion', cat: 'ใช้ในภารกิจ', name: 'ยาฟื้นฟู HP', hp: 300, price: 80, desc: 'ฟื้นพลังชีวิตได้ทันที' },
    { id: 'anti-corr', cat: 'ใช้ในภารกิจ', name: 'ยาลดการกัดกร่อน', corr: -200, price: 150, desc: 'ลดค่า Corruption ในร่างกาย' },
    { id: 'energy-drink', cat: 'ใช้ในภารกิจ', name: 'เครื่องดื่มพลังงาน', price: 40, desc: 'ช่วยให้ตื่นตัวและมีแรงต่อสู้ต่อ' },
    { id: 'cake', cat: 'ของขวัญ', name: 'เค้กสตรอว์เบอร์รี่', bond: 8, price: 90, desc: 'ขนมหวานที่ใครๆ ก็ชอบ' },
    { id: 'flowers', cat: 'ของขวัญ', name: 'ช่อดอกไม้', bond: 10, price: 120, desc: 'ช่อดอกไม้เล็กๆ สำหรับคนพิเศษ' },
    { id: 'teddy', cat: 'ของขวัญ', name: 'ตุ๊กตาหมีตัวเล็ก', bond: 15, price: 200, desc: 'ตุ๊กตานุ่มนิ่มน่ากอด' },
    { id: 'tea-set', cat: 'ของขวัญ', name: 'ชุดน้ำชา', bond: 12, price: 260, desc: 'ชุดน้ำชาสวยๆ สำหรับช่วงเวลาผ่อนคลาย' },
    { id: 'crystal', cat: 'ของใช้', name: 'คริสตัลพลังงาน', price: 500, desc: 'ผลึกพลังงานบริสุทธิ์ ใช้เป็นวัตถุดิบหรือแลกเปลี่ยน' },
  ],
};

const t = (s) => String(s ?? '').trim();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function toMoney(v) {
  const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export const fmtMoney = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—');

export function ensureShop(meta) {
  if (!meta.shop || typeof meta.shop !== 'object') meta.shop = {};
  const s = meta.shop;
  if (!Array.isArray(s.custom)) s.custom = [];
  if (!s.inv || typeof s.inv !== 'object') s.inv = {};
  if (!Array.isArray(s.log)) s.log = [];
  return s;
}

export function catalog(profile, shop) {
  const base = (profile?.shop || DEFAULT_SHOP).items || [];
  return [
    ...base.map((i) => ({ ...i, own: false })),
    ...(shop?.custom || []).map((i) => ({ ...i, cat: 'ของที่เพิ่มเอง', own: true })),
  ];
}

export const newItemId = () => `c-${uid()}`;

export function tryBuy(balance, price, qty = 1) {
  const cost = price * qty;
  if (!Number.isFinite(balance)) return { ok: false, reason: 'no-balance' };
  if (!(price >= 0) || !(qty >= 1)) return { ok: false, reason: 'bad-item' };
  if (balance < cost) return { ok: false, reason: 'poor', need: cost - balance };
  return { ok: true, balance: balance - cost, cost };
}

export function shopContextBlock({ balance, currency, inv, names, user }) {
  const cur = currency?.name || 'Coin';
  const owned = Object.entries(inv || {})
    .filter(([, q]) => q > 0)
    .map(([id, q]) => `${names[id] || id} x${q}`);
  const bal = Number.isFinite(balance) ? `${fmtMoney(balance)} ${cur}` : 'unknown';
  return `[${user}'s wallet: ${bal}. Items ${user} owns (bought in the shop): ${owned.length ? owned.join(', ') : 'none'}. Treat this as true: ${user} cannot pay for or use what they do not have. If the story spends or earns money, add one hidden line at the end of the reply: <!--BC\nplayer.money: <new total number>\n-->]`;
}

export function rewardAmount(text, currencyName = 'Coin') {
  const unit = `(?:coins?|เหรียญ|${String(currencyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`;
  const s = String(text ?? '').replace(/(\d),(?=\d{3})/g, '$1');
  const m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}|${unit}\\s*[:x×]?\\s*(\\d+(?:\\.\\d+)?)`, 'i'));
  return m ? Math.round(Number(m[1] ?? m[2])) || 0 : 0;
}
