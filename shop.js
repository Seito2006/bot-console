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
    { id: 'field-bandage', cat: 'เวชภัณฑ์', name: 'ผ้าพันแผลสนาม', hp: 120, price: 35, desc: 'ใช้ทำแผลเบื้องต้น' },
    { id: 'trauma-kit', cat: 'เวชภัณฑ์', name: 'ชุดปฐมพยาบาลฉุกเฉิน', hp: 600, price: 165, desc: 'ชุดทำแผลและยาฉุกเฉินสำหรับผู้บาดเจ็บหนัก' },
    { id: 'purifier-dose', cat: 'เวชภัณฑ์', name: 'ยาต้านการกัดกร่อนขนาดพกพา', corr: -80, price: 65, desc: 'ยาขนาดเล็กสำหรับการปนเปื้อนระดับต่ำ' },
    { id: 'decon-kit', cat: 'เวชภัณฑ์', name: 'ชุดฟื้นฟูหลังสัมผัสฮงไก', hp: 200, corr: -350, price: 310, desc: 'ใช้ฟื้นฟูร่างกายและลดการกัดกร่อนหลังออกจากพื้นที่ปนเปื้อน' },
    { id: 'signal-flare', cat: 'ใช้ในภารกิจ', name: 'พลุส่งสัญญาณ', price: 55, desc: 'ใช้เรียกกำลังสนับสนุนหรือระบุตำแหน่งจุดนัดพบในฉาก' },
    { id: 'spare-cell', cat: 'ใช้ในภารกิจ', name: 'แบตเตอรี่สำรอง', price: 75, desc: 'เก็บไว้เปลี่ยนให้วิทยุหรืออุปกรณ์สำรวจในฉาก' },
    { id: 'field-radio', cat: 'ใช้ในภารกิจ', name: 'วิทยุสื่อสารพกพา', price: 190, desc: 'ใช้ประสานงานกับทีมระหว่างออกสำรวจในโรลเพลย์' },
    { id: 'honkai-scanner', cat: 'ใช้ในภารกิจ', name: 'เครื่องตรวจวัดฮงไก', price: 380, desc: 'อุปกรณ์สำรวจสำหรับตรวจระดับการปนเปื้อนในฉาก' },
    { id: 'canteen-water', cat: 'อาหารและเครื่องดื่ม', name: 'น้ำดื่มจากโรงอาหาร', price: 10, desc: 'พกไปดื่มระหว่างเดินทางหรือหลังฝึก' },
    { id: 'rice-ball', cat: 'อาหารและเครื่องดื่ม', name: 'ข้าวปั้นไส้แซลมอน', price: 25, desc: 'มื้อเบาสำหรับพักระหว่างฉาก' },
    { id: 'cafeteria-bento', cat: 'อาหารและเครื่องดื่ม', name: 'ข้าวกล่อง St. Freya', price: 60, desc: 'ชุดอาหารโรงเรียนสำหรับพกไปกินนอกสถานที่' },
    { id: 'milk-tea', cat: 'อาหารและเครื่องดื่ม', name: 'ชานมไข่มุก', price: 45, desc: 'เครื่องดื่มหวานสำหรับแวะซื้อหลังเลิกเรียน' },
    { id: 'photo-print', cat: 'ของขวัญ', name: 'รูปโพลารอยด์พร้อมกรอบ', bond: 6, price: 55, desc: 'ของขวัญสำหรับเก็บความทรงจำจากฉากที่เล่นด้วยกัน' },
    { id: 'butterfly-pin', cat: 'ของขวัญ', name: 'เข็มกลัดผีเสื้อ', bond: 13, price: 170, desc: 'เครื่องประดับชิ้นเล็กสำหรับมอบให้ตัวละคร' },
    { id: 'music-box', cat: 'ของขวัญ', name: 'กล่องดนตรีไขลาน', bond: 20, price: 360, desc: 'ของขวัญสำหรับโอกาสพิเศษ' },
    { id: 'field-notebook', cat: 'ของใช้', name: 'สมุดบันทึกพกพา', price: 35, desc: 'ใช้จดเบาะแส พิกัด หรือข้อมูลที่เจอในฉาก' },
    { id: 'pocket-torch', cat: 'ของใช้', name: 'ไฟฉายแบบหนีบ', price: 70, desc: 'หนีบติดกระเป๋าไว้ส่องทางในที่มืดระหว่างโรลเพลย์' },
    { id: 'alloy-plate', cat: 'วัสดุและอะไหล่', name: 'แผ่นโลหะผสม', price: 110, desc: 'วัสดุสำหรับเล่นฉากซ่อมเกราะหรือประกอบอุปกรณ์' },
    { id: 'control-chip', cat: 'วัสดุและอะไหล่', name: 'ชิปควบคุมสำรอง', price: 210, desc: 'อะไหล่สำหรับเล่นฉากซ่อมวงจรและเครื่องมือสำรวจ' },
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
    ...(shop?.story || []).filter(item => ![...base, ...(shop.custom || [])].some(existing => itemKey(existing.name) === itemKey(item.name))),
  ];
}

const itemKey = name => t(name).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();

const SHOP_AREAS = [
  [/ห้องพยาบาล|คลินิก|โรงพยาบาล|infirmary|clinic|hospital|medbay/i, 'ห้องพยาบาล', ['เวชภัณฑ์'], ['hp-potion', 'anti-corr']],
  [/โรงอาหาร|คาเฟ่|ร้านอาหาร|canteen|cafeteria|caf[eé]|restaurant/i, 'โรงอาหาร', ['อาหารและเครื่องดื่ม'], ['energy-drink', 'cake']],
  [/ตลาด|ย่านการค้า|ร้านค้า|market|bazaar|shopping district/i, 'ตลาด', ['ของขวัญ', 'อาหารและเครื่องดื่ม', 'ของใช้', 'วัสดุและอะไหล่'], []],
  [/ไฮเปอเรียน|hyperion|คลังเสบียง|armory|supply depot/i, 'คลังเสบียง', ['ใช้ในภารกิจ', 'เวชภัณฑ์', 'วัสดุและอะไหล่'], ['canteen-water', 'crystal']],
  [/st\.?\s*freya|เซนต์เฟรยา|เซนต์เฟรย์ย่า|โรงเรียน|academy/i, 'ร้านโรงเรียน', ['อาหารและเครื่องดื่ม', 'ของขวัญ', 'ของใช้'], ['field-bandage', 'energy-drink', 'hp-potion']],
  [/เขตอพยพ|เขตปนเปื้อน|สนามรบ|ซากเมือง|evacuation|battlefield|contaminated|ruins|nagazora|นางาโซระ/i, 'เสบียงภาคสนาม', ['ใช้ในภารกิจ'], ['field-bandage', 'canteen-water', 'purifier-dose']],
];
const GENERAL_SUPPLIES = ['canteen-water', 'rice-ball', 'field-bandage', 'spare-cell', 'pocket-torch'];

export function localShop(items, location) {
  const [, name, categories, extras] = SHOP_AREAS.find(([pattern]) => pattern.test(location || ''))
    || [null, 'เสบียงพื้นฐาน', [], GENERAL_SUPPLIES];
  const place = itemKey(location);
  return {
    name,
    items: items.flatMap(item => {
      if (item.locations) {
        const offer = item.locations.get(place);
        return offer ? [{ ...item, ...offer }] : [];
      }
      return item.own || categories.includes(item.cat) || extras.includes(item.id) ? [item] : [];
    }),
  };
}

export function storyStock(locations) {
  const items = new Map();
  for (const [message, location] of locations) {
    for (const block of message.mes.matchAll(/<!--\s*BCSHOP\b([\s\S]*?)-->/g)) {
      for (const line of block[1].trim().split(/\r?\n/).slice(0, 6)) {
        const [name, amount, desc] = line.split('|').map(t);
        const price = Number(amount);
        if (!name || name.length > 80 || !amount || !/^\d+$/.test(amount) || price < 1 || price > 100000) continue;
        const key = itemKey(name);
        if (!items.has(key)) {
          if (items.size >= 80) continue;
          items.set(key, { id: 'rp:' + key, name, price, desc: (desc || '').slice(0, 160), cat: 'สินค้าจากโรลเพลย์', locations: new Map() });
        }
        const offers = items.get(key).locations;
        if (!offers.has(itemKey(location))) offers.set(itemKey(location), { price, desc: (desc || '').slice(0, 160) });
      }
    }
  }
  return [...items.values()];
}

export const newItemId = () => `c-${uid()}`;

export function tryBuy(balance, price, qty = 1) {
  const cost = price * qty;
  if (!Number.isFinite(balance)) return { ok: false, reason: 'no-balance' };
  if (!(price >= 0) || !(qty >= 1)) return { ok: false, reason: 'bad-item' };
  if (balance < cost) return { ok: false, reason: 'poor', need: cost - balance };
  return { ok: true, balance: balance - cost, cost };
}

export function shopContextBlock({ balance, currency, inv, held, names, user, stock = [], storyShop = false }) {
  const cur = currency?.name || 'Coin';
  const list = (items) => Object.entries(items || {})
    .filter(([, q]) => q > 0)
    .map(([id, q]) => `${names[id] || id} x${q}`).join(', ') || 'none';
  const bal = Number.isFinite(balance) ? `${fmtMoney(balance)} ${cur}` : 'unknown';
  const shop = storyShop ? ` When a merchant actually lists NEW goods for sale in the roleplay, append one hidden HTML comment in this format: <!--BCSHOP\nitem name | price as a positive integer in ${cur} | short description\n-->. Record up to six items in the story language and keep the HI3_HUD location consistent for the same shop. On arrival at a new shop, set the HUD location to that shop or area in the same reply. Omit goods already listed here (${stock.slice(-22).map(item => item.name).join(', ')}), freebies, wishes, and goods that are merely seen. Listing stock does not buy or award it.` : '';
  return `[${user}'s wallet: ${bal}. In their bag: ${list(inv)}. Held temporarily outside the bag: ${list(held)}. Use these as the current carried quantities and respect the wallet balance. Items left elsewhere are available when retrieved in the story. If the story spends or earns money, add one hidden line at the end of the reply: <!--BC\nplayer.money: <new total number>\n-->${shop}]`;
}

export function rewardAmount(text, currencyName = 'Coin') {
  const unit = `(?:coins?|เหรียญ|${String(currencyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`;
  const s = String(text ?? '').replace(/(\d),(?=\d{3})/g, '$1');
  const m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}|${unit}\\s*[:x×]?\\s*(\\d+(?:\\.\\d+)?)`, 'i'));
  return m ? Math.round(Number(m[1] ?? m[2])) || 0 : 0;
}
