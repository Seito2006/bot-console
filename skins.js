export const SKINS = [
  { id: 'seele', ui: { ac: '#6369aa', ac2: '#75bbc8', deep: '#232744', ink: '#272c48', mu: '#666780' }, title: 'Herrscher of Rebirth', who: 'Seele', name: 'Seele · Herrscher of Rebirth', wall: 'seele.webp', card: 'seele.webp', thumb: 'seele.webp',
    fonts: ['Marcellus', 'Sarabun:wght@400;500;600;700'] },
  { id: 'mei', ui: { ac: '#985fed', ac2: '#55c7da', deep: '#211638', ink: '#2b2142', mu: '#75658d' }, title: 'Xentinel', who: 'Raiden Mei', card: 'mei-c.jpg', name: 'Mei · Xentinel', thumb: 'mei-t.jpg', wall: 'mei.jpg',
    fonts: ['Marcellus', 'Sarabun:wght@400;500;600;700', 'Trirong:wght@400;600'] },
  { id: 'kiana', ui: { ac: '#ff315b', ac2: '#ff9fb2', deep: '#23131a', ink: '#fff6f7', mu: '#d4aab3' }, title: 'Ba-Dum!', who: 'Kiana', card: 'kiana-c.jpg', name: 'Kiana · Ba-Dum!', thumb: 'kiana-t.jpg', wall: 'kiana.jpg',
    fonts: ['Kanit:ital,wght@0,400;0,600;1,600;1,700', 'Prompt:wght@400;500;600'] },
  { id: 'bronya', ui: { ac: '#9b6def', ac2: '#a7dcec', deep: '#191323', ink: '#f6f1fc', mu: '#b1a6c2' }, title: 'Heart of the Night', who: 'Bronya', card: 'bronya-c.jpg', name: 'Bronya · Heart of the Night', thumb: 'bronya-t.jpg', wall: 'bronya.jpg',
    fonts: ['Josefin+Sans:wght@400;600;700', 'Niramit:wght@400;500;600;700'] },
  { id: 'theresa', ui: { ac: '#ad294b', ac2: '#dba89e', deep: '#391321', ink: '#321724', mu: '#815562' }, title: 'Lunar Vow', who: 'Theresa', card: 'theresa-c.jpg', name: 'Theresa · Lunar Vow', thumb: 'theresa-t.jpg', wall: 'theresa.jpg',
    fonts: ['Cinzel:wght@500;700', 'Pridi:wght@400;500;600'] },
  { id: 'fenghuang', ui: { ac: '#bb501f', ac2: '#eeb95b', deep: '#542311', ink: '#3a1c0c', mu: '#a2765a' }, title: 'Fenghuang', who: 'Fu Hua', card: 'fenghuang-c.jpg', name: 'Fu Hua · Fenghuang', thumb: 'fenghuang-t.jpg', wall: 'fenghuang.jpg',
    fonts: ['Playfair+Display:ital,wght@0,600;0,700;1,600;1,700', 'Taviraj:wght@400;500;600', 'Niramit:wght@400;500;600;700'] },
  { id: 'sentience', ui: { ac: '#946733', ac2: '#ab3854', deep: '#202938', ink: '#1a2236', mu: '#6c7896' }, title: 'Sentience', who: 'Fu Hua', card: 'sentience-c.jpg', name: 'Fu Hua · Sentience', thumb: 'sentience-t.jpg', wall: 'sentience-wall.jpg',
    fonts: ['Oxanium:wght@500;600;700', 'Bai+Jamjuree:wght@400;500;600;700'] },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) || null;

export function fontHref(id) {
  const s = skinById(id);
  if (!s || !s.fonts?.length) return '';
  return `https://fonts.googleapis.com/css2?${s.fonts.map((f) => `family=${f}`).join('&')}&display=swap`;
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).replace('#', '').slice(i - 1, i + 1), 16));
const toHex = (a) => `#${a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mixW = (a, t) => a.map((v) => v + (255 - v) * t);

// Colours used to repaint the bot's chat cards (Field HUD, character banner, Valkyrie status) for a skin.
export function uiPalette(id) {
  const u = skinById(id)?.ui;
  if (!u) return null;
  const ac = hexRgb(u.ac);
  return {
    ac: u.ac, ac2: u.ac2 || toHex(mixW(ac, 0.4)), t1: toHex(mixW(ac, 0.95)), t2: toHex(mixW(ac, 0.86)), pale: toHex(mixW(ac, 0.9)),
    deep: u.deep, ink: u.ink, mu: u.mu, rgb: ac.join(','), drgb: hexRgb(u.deep).join(','),
  };
}
