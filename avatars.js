const F = (label, file, ...keys) => ({ label, file, keys: keys.map((k) => k.toLowerCase()) });

export const CHARS = [
  { id: 'raiden mei', mentions: ['raiden mei', 'mei', 'เมย์', 'ไรเด็น'], forms: [
    F('Adult', 'Raiden Mei (Adult).jpg', 'adult'),
    F('Herrscher of Thunder', 'Raiden Mei (Herrscher of Thunder).jpg', 'herrscher of thunder', 'thunder', 'สายฟ้า'),
    F('Herrscher of Origin', 'Raiden-Mei-_Herrscher-of-Origin_.jpeg', 'herrscher of origin', 'origin'),
    F('Xentinel', 'Raiden Mei (Xentinel Dawnbearing Crescent).jpeg', 'xentinel', 'dawnbearing'),
    F('St. Freya', 'Raiden Mei (St. Freya).jpg', 'st. freya', 'st freya', 'freya'),
  ] },
  { id: 'kiana kaslana', mentions: ['kiana kaslana', 'kiana', 'เคียน่า'], forms: [
    F('St. Freya', 'Kiana Kaslana(St. Freya).png', 'st. freya', 'st freya', 'freya'),
    F('After Great War', 'Kiana Kaslana (After Great War).png', 'after great war'),
    F('Ba-Dum! Fiery Wishing Star', 'Kiana Kaslana (Ba-Dum! Fiery Wishing Star).jpg', 'ba-dum', 'fiery wishing star'),
    F('Herrscher of Finality', 'Kiana Kaslana (Herrscher of Finally).jpg', 'herrscher of finality', 'herrscher of finally', 'finality'),
    F('Herrscher of Fire', 'Kiana Kaslana (Herrscher of Fire).jpg', 'herrscher of fire'),
    F('Herrscher of Void', 'Kiana Kaslana (Herrscher of Void).png', 'herrscher of void', 'void'),
  ] },
  { id: 'fu hua', mentions: ['fu hua', 'ฟู่ฮัว', 'ฟูฮัว'], forms: [
    F('Fu Hua', 'Fu Hua.jpg'),
    F('Azure Empyrea', 'Fu Hua (Azure Empyrea).jpg', 'azure empyrea'),
    F('Fenghuang of Vicissitude', 'Fu Hua (Fenghuang of Vicissitude).jpg', 'fenghuang'),
    F('Herrscher of Sentience', 'Fu Hua (Herrscher of Sentience).jpg', 'herrscher of sentience', 'sentience'),
    F('Phoenix', 'Fu Hua (Phoenix).jpg', 'phoenix'),
    F('St. Freya', 'Fu Hua (St. Freya).jpg', 'st. freya', 'st freya', 'freya'),
  ] },
  { id: 'theresa apocalypse', mentions: ['theresa apocalypse', 'theresa', 'เทเรซ่า'], forms: [
    F('Lunar Vow', 'Theresa Apocalypse (Lunar vow).jpg', 'lunar vow'),
    F("Schicksal's Imperative", "Theresa Apocalypse (Schicksal's Imperative).jpg", 'schicksal'),
    F('St. Freya', 'Theresa Apocalypse (St. Freya).jpg', 'st. freya', 'st freya', 'freya'),
  ] },
  { id: 'bronya zaychik', mentions: ['bronya zaychik', 'bronya', 'โบรเนีย'], forms: [
    F('Zaychik', 'bronya zaychik.jpg'),
    F('Adult', 'bronya adult.jpg', 'adult'),
    F('St. Freya', 'Bronya (St. Freya).jpg', 'st. freya', 'st freya', 'freya'),
  ] },
  { id: 'murata himeko', mentions: ['murata himeko', 'himeko', 'ฮิเมโกะ'], forms: [
    F('Himeko', 'Murata Himeko.jpg'),
  ] },
  { id: 'seele vollerei', mentions: ['seele vollerei', 'seele', 'เซเล'], forms: [
    F('Vollerei', 'Seele Vollerei.jpg', 'vollerei'),
    F('Nyx', 'Seele Nyx.jpg', 'nyx'),
    F('Redeyes', 'Seele Redeyes.jpg', 'redeyes'),
    F('Herrscher of Rebirth', 'Seele HoR.jpg', 'herrscher of rebirth'),
  ] },
  { id: 'elysia', mentions: ['elysia', 'อีลีเซีย'], forms: [
    F('Elysia', 'Elysia.jpg'),
    F('Herrscher of Human', 'Elysia Hoh.jpg', 'herrscher of human'),
    F('Love', 'Elysia Love.jpg'),
  ] },
  { id: 'rita rossweisse', mentions: ['rita rossweisse', 'rita', 'ริต้า'], forms: [
    F('Rita', 'Rita Rossweisse.jpg'),
  ] },
  { id: 'griseo', mentions: ['griseo'], forms: [
    F('Griseo', 'Griseo.jpg'),
    F('Kid', 'Griseo Kid.jpg', 'kid'),
  ] },
];

const EXTS = ['jpg', 'png', 'jpeg', 'webp'];
const BASE = new URL('./avatars/', import.meta.url).href;
const HSR_ALIASES = new Map([
  ['march7th', 'March.jpg'],
  ['march7', 'March.jpg'],
  ['march7ththehunt', 'March.jpg'],
  ['มาร์ชเซเว่นธ์', 'March.jpg'],
  ['มาร์ช7th', 'March.jpg'],
  ['danhengimbibitorlunae', 'Dan Heng Imbibitor Lunae.jpg'],
  ['danhengpermansorterrae', 'Dan Heng Permansor Terrae.jpg'],
  ['oleg', 'hsr Oleg.jpg'],
  ['pompom', 'Pompom.jpg'],
  ['ปอมปอม', 'Pompom.jpg'],
]);
const isUrl = (s) => /^(https?:|data:|\/)/i.test(s);
const hasExt = (s) => /\.(jpe?g|png|webp|gif)$/i.test(s);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const fileUrl = (f, pack = 'hi3') => `${BASE}${pack}/${encodeURIComponent(f)}`;

export function findChar(name, pack = 'hi3') {
  if (pack !== 'hi3') return null;
  const ln = String(name || '').trim().toLowerCase();
  if (!ln) return null;
  return (
    CHARS.find((c) => c.id === ln) ||
    CHARS.find((c) => ln.includes(c.id) || (ln.length >= 4 && c.id.includes(ln))) ||
    null
  );
}

function mentionTest(c) {
  const latin = c.mentions.filter((m) => /^[a-z .]+$/.test(m)).map((m) => new RegExp(`(^|[^a-z])${reEsc(m)}(?![a-z])`));
  const other = c.mentions.filter((m) => !/^[a-z .]+$/.test(m));
  return (text) => latin.some((re) => re.test(text)) || other.some((m) => text.includes(m));
}

function bestByKeys(text, forms) {
  let best = null;
  let len = 0;
  for (const f of forms) {
    for (const k of f.keys) {
      if (k.length > len && text.includes(k)) { best = f; len = k.length; }
    }
  }
  return best;
}

export function detectForm(c, avatarField, chat, depth = 80) {
  const a = String(avatarField || '').trim();
  if (a && !isUrl(a)) {
    const na = norm(a.replace(/\.[a-z]+$/i, ''));
    const byFile = c.forms.find((f) => {
      const nf = norm(f.file.replace(/\.[a-z]+$/i, ''));
      return na.length >= 4 && (na === nf || nf.includes(na) || na.includes(nf));
    });
    if (byFile) return byFile;
    const byKey = bestByKeys(a.toLowerCase(), c.forms);
    if (byKey) return byKey;
  }
  const mentioned = mentionTest(c);
  const list = chat || [];
  for (let i = list.length - 1; i >= 0 && i >= list.length - depth; i--) {
    const text = String(list[i]?.mes || '').toLowerCase();
    if (!text || !mentioned(text)) continue;
    const f = bestByKeys(text, c.forms);
    if (f) return f;
  }
  return null;
}

export function avatarCandidates(name, avatar, pack = 'hi3') {
  const out = [];
  const n = String(name || '').trim();
  const a = String(avatar || '').trim();
  if (pack !== 'hsr' && a && isUrl(a)) out.push(a);
  if (a && !isUrl(a)) {
    if (hasExt(a)) out.push(fileUrl(a, pack));
    else EXTS.forEach((e) => out.push(fileUrl(`${a}.${e}`, pack)));
  }
  if (n) {
    const alias = pack === 'hsr' ? HSR_ALIASES.get(norm(n)) : null;
    if (alias) out.push(fileUrl(alias, pack));
    for (const nm of new Set([n, n.toLowerCase()])) EXTS.forEach((e) => out.push(fileUrl(`${nm}.${e}`, pack)));
  }
  if (pack === 'hsr' && a && isUrl(a)) out.push(a);
  return [...new Set(out)];
}
