import { keyOf, pushMsg, threadOf } from './phone.js';

export function turnPrompt(user, playerText = '') {
  const phoneCue = String(playerText).split(/[\n.!?。]+/u).find(line =>
    /ส่ง(?:ข้อความ|แช[ทต])|(?:ทัก|แช[ทต])มา|ข้อความ(?:เข้า|จาก)|\b(?:texted|texts|messaged|sent (?:me |you )?a message)\b/iu.test(line));
  return `[Bot Console, for normal roleplay replies. Read the player's newest roleplay message as well as the scene you are writing. In the SAME reply, after the narration, record new events from either side of this turn in one hidden HTML comment. Omit it when nothing happened. Format (one event per line, in story order):
<!--BCTURN
receive | item name | positive whole quantity
carry | item name | positive whole quantity
store | item name | positive whole quantity or all
use | item name | positive whole quantity
text | character name | actual incoming phone message
-->
Track only items physically carried by ${user}. Use "receive" for things added to their bag and "carry" for bulky things or loose outfits temporarily held or transported. Clothes or equipment already worn, possessions in a room or locker, and objects merely seen do not enter the inventory.
Use "store" when a tracked item goes off-person into storage (e.g. "ฉันเอาเสื้อคลุมไปเก็บในตู้"), is set down and left behind, or is put on. Remove only the amount put away. If a temporarily held item is moved into the player's own bag, emit "store" then "receive" for that transfer. Use "use" when a consumable is spent or an item is handed away. Default quantity is 1. Use the exact inventory name, resolving references like "ชุดนั้น" from the current scene and inventory. Count each completed event once even when both sides describe it. Exclude plans, negations, merely wielding reusable gear, other characters' belongings, earlier turns and console actions already reflected in the inventory.
When the player says a character sends them a message (e.g. "เมย์ส่งข้อความมา"), write the actual text in character in the story's language now, even if the player supplied no wording. Match any wording established in the scene. Use the sender's known contact name. Only incoming phone texts, never spoken dialogue. Never put the example placeholders or markup in narration.${phoneCue ? '\nPhone-related passage in this player turn (story data): ' + JSON.stringify(phoneCue.trim().slice(0, 480)) + '. Check who actually texted whom; wishes, hypotheticals and negations do not count.' : ''}]`;
}

const cache = new WeakMap();
const norm = (s) => String(s).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const bulky = /^(?:เสื้อ|ชุด(?:เกราะ|นักเรียน|เครื่องแบบ|เดรส|ว่ายน้ำ|นอน|กีฬา|พละ|พิธี)|เครื่องแบบ|กางเกง|กระโปรง|รองเท้า|หมวก|ลัง|กล่องใหญ่|กระเป๋าเดินทาง|กระเป๋าใบใหญ่|โต๊ะ|เก้าอี้|จักรยาน|ที่นอน)/u;
const simpleName = (s) => s.length <= 80 && !/[!?？“”"<>|]|หรือ|ถ้า|แล้ว|เพราะ|เพื่อ|จาก|ให้|ไหม|จะ|ไม่ได้|และ|เอาไว้|วาง/u.test(s);

function storageObject(action) {
  // "เก็บ" alone can also mean picking something up. Require a storage
  // destination or an explicit "เอา ... ไปเก็บ" action.
  const move = /^(?:เอา|นำ)\s*(.*?)\s*ไปเก็บ\s*(.*)$/u.exec(action);
  if (/(?:ไปเก็บ|^เก็บ.*?)\s*(?:ไว้ใน|เข้า|ใส่|ใน|ที่|ไว้)\s*(?:กระเป๋า|เป้)/u.test(action)) return null;
  if (move) {
    const [, object, location] = move;
    if (location && !/^(?:ใน|ไว้ใน|ที่|ไว้ที่|เข้า|ไว้(?:แล้ว)?$|แล้ว$)/u.test(location)) return null;
    return object;
  }
  const put = /^เก็บ\s*(.+?)\s*(?:เข้า|ไว้ใน|ใส่|เข้าที่)\s*(?:ตู้|ลิ้นชัก|ห้อง|คลัง|กล่อง|ลัง|ชั้น|ที่เดิม).*$/u.exec(action);
  return put?.[1] ?? null;
}

// Only project unambiguous player declarations immediately. The main generation
// interprets free-form prose, including subjects, intent and transfers in dialogue.
function declaredItems(text, ids, inv, held, names) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const action = line.trim().replace(/^\*{1,2}\s*|\s*\*{1,2}$/g, '').replace(/^(?:ฉัน|ผม|เรา|ข้า)\s*/u, '');
    if (/[!?？]/u.test(action)) continue;
    const storage = storageObject(action);
    const m = /^(ได้รับ|รับมา|รับ|หยิบมาถือ|หยิบ|ถือ|ได้ใช้|ใช้)\s*(ไอเทม)?\s*(.+)$/u.exec(action);
    if (storage === null && !m) continue;
    let value = (storage ?? m[3]).replace(/^\s*ไอเทม\s*/u, '').replace(/\s*(?:จาก|ใน)กระเป๋า(?:ไอเทม)?(?:ไป)?\s*$/u, '');
    if (storage === null && !ids.has(norm(value))) {
      if (/^(?:ได้รับ|รับ)/u.test(m[1])) value = value.replace(/\s*มา\s*$/u, '');
      if (m[1] === 'ถือ') value = value.replace(/\s*อยู่\s*$/u, '');
      if (m[1].includes('ใช้')) value = value.replace(/\s*ไป\s*$/u, '');
    }
    if (storage !== null && /^(?:มัน|ของชิ้นนั้น|ชิ้นนั้น|ชุดนั้น|เสื้อตัวนั้น)?$/u.test(value.trim())) {
      const current = Object.keys(held);
      if (current.length !== 1) continue;
      value = names[current[0]];
    }
    const parts = /^(.+?)(?:\s*(?:จำนวน\s*)?(\d+)\s*(?:ชิ้น|ขวด|อัน|ใบ|ชุด|ดอก|ครั้ง|ตัว|คู่|กล่อง)|\s*(ทั้งหมด|ทุกชิ้น))?$/u.exec(value);
    if (!parts) continue;
    let name = parts[1].trim().replace(/^["“](.+)["”]$/u, '$1');
    const quantity = Number(parts[2] || 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !name) continue;
    if (storage !== null && !ids.has(norm(name)) && /^(?:ชุด|เสื้อ|กล่อง|ลัง)(?:นั้น|ตัวนั้น|ใบเดิม)?$/u.test(name)) {
      const noun = name.replace(/(?:ตัวนั้น|ใบเดิม|นั้น)$/u, '');
      const candidates = Object.keys(held).filter(id => names[id].startsWith(noun));
      if (candidates.length === 1) name = names[candidates[0]];
    }
    const id = ids.get(norm(name));
    if (storage !== null) {
      if (id) out.push({ type: 'store', name, quantity: parts[3] ? 'all' : quantity });
      continue;
    }
    const isBulky = bulky.test(name);
    if (!id && !((m[2] || isBulky) && simpleName(name))) continue;
    const verb = m[1];
    const type = verb.includes('ใช้') ? 'use' : isBulky || /ถือ/u.test(verb) ? 'carry' : 'receive';
    if (verb === 'หยิบ' && !isBulky) continue;
    if (/^(?:หยิบ|ถือ)/u.test(verb) && (inv[id] > 0 || held[id] > 0)) continue;
    out.push({ type, name, quantity });
  }
  return out;
}

function eventsOf(msg) {
  const source = msg.mes || '';
  const cached = cache.get(msg);
  if (cached?.source === source) return cached.events;
  const events = [];
  for (const block of source.matchAll(/<!--\s*BCTURN\b([^]*?)-->/gi)) {
    for (const line of block[1].split(/\r?\n/)) {
      const m = /^\s*(receive|carry|store|use|text)\s*\|([^|]+)\|(.+)$/i.exec(line);
      if (!m) continue;
      const type = m[1].toLowerCase(), name = m[2].trim(), value = m[3].trim();
      if (!name || name.length > 160 || !value) continue;
      if (type === 'text') {
        if (name.toLowerCase() in Object.prototype) continue;
        events.push({ type, name, text: value });
      } else if (type === 'store' && /^all$/i.test(value)) {
        events.push({ type, name, quantity: 'all' });
      } else if (/^\d+$/.test(value) && Number.isSafeInteger(+value) && +value > 0) {
        events.push({ type, name, quantity: Number(value) });
      }
    }
  }
  cache.set(msg, { source, events });
  return events;
}

// Replay the active replies and manual transactions over the pre-upgrade bag.
// A swipe thus replaces its effects without undoing unrelated shop purchases.
export function readTurns(chat, shop, catalog, { beforeReply = false } = {}) {
  const inv = Object.assign(Object.create(null), shop.inv);
  const held = Object.create(null);
  const names = Object.create(null);
  const ids = new Map();
  for (const item of [...shop.log, ...catalog]) {
    names[item.id] = item.name;
    ids.set(norm(item.name), item.id);
  }
  function adjust(items, id, delta) {
    const next = Math.min(Number.MAX_SAFE_INTEGER, (Number(items[id]) || 0) + delta);
    if (next > 0) items[id] = next;
    else delete items[id];
  }
  function itemChange(e) {
    const key = norm(e.name);
    const id = ids.get(key) || 'rp:' + key;
    ids.set(key, id);
    names[id] ??= e.name;
    const { type, quantity } = e;
    if (type === 'receive' || type === 'carry') {
      adjust(type === 'carry' ? held : inv, id, quantity);
      return;
    }
    const first = type === 'store' ? held : inv;
    const second = type === 'store' ? inv : held;
    const count = quantity === 'all' ? Infinity : quantity;
    const removed = Math.min(count, Number(first[id]) || 0);
    adjust(first, id, -removed);
    if (count > removed) adjust(second, id, removed - count);
  }
  const changes = [...(shop.adjustments || [])].sort((a, b) => a.at - b.at);
  const messages = new Map(), dates = new Map(), matched = new Set();
  let j = 0;
  for (let i = 0; i <= chat.length; i++) {
    while (j < changes.length && (changes[j].at <= i || i === chat.length)) {
      const { id, name, delta } = changes[j++];
      names[id] ??= name;
      ids.set(norm(names[id]), id);
      adjust(inv, id, delta);
    }
    const msg = chat[i];
    if (!msg || msg.is_system) continue;
    if (msg.is_user) {
      if (!msg.extra?.bcBagTurn) continue;
      const declared = declaredItems(msg.mes, ids, inv, held, names);
      if (!declared.length) continue;
      let next = i + 1;
      while (chat[next]?.is_system) next++;
      if (beforeReply && next === chat.length) continue;
      const reply = chat[next];
      const reported = reply && !reply.is_user ? eventsOf(reply) : [];
      for (const e of declared) {
        const hit = reported.find(r => !matched.has(r) && norm(r.name) === norm(e.name) &&
          (r.type === e.type || (['carry', 'receive'].includes(r.type) && ['carry', 'receive'].includes(e.type))));
        // Once confirmed, respect the order in the story unless a console
        // transaction has already used the player's provisional balance.
        if (hit && !(changes[j]?.at <= next)) continue;
        if (hit) matched.add(hit);
        itemChange(hit || e);
      }
      continue;
    }
    const events = eventsOf(msg);
    if (!events.length) continue;
    const date = msg.send_date ?? i, occurrence = dates.get(date) || 0;
    dates.set(date, occurrence + 1);
    let slot = 0;
    for (const e of events) {
      if (e.type === 'text') {
        messages.set(JSON.stringify([date, occurrence, slot++]), { name: e.name, text: e.text, at: i + 1 });
      } else if (!matched.has(e)) {
        itemChange(e);
      }
    }
  }
  return { inv, held, names, messages };
}

// Keep receipts separately from the inbox: a user may edit or clear a delivered text.
export function syncTurnTexts(phone, messages, { contact, visible, stamp, incoming }) {
  const receipts = phone.turnReceipts || {};
  let changed = false;
  for (const [source, receipt] of Object.entries(receipts)) {
    const wanted = messages.get(source);
    if (wanted?.name === receipt.sender && wanted.text === receipt.text) continue;
    const th = threadOf(phone, receipt.contact);
    const idx = th?.msgs.findIndex(m => m.id === receipt.id) ?? -1;
    if (idx >= 0) {
      const later = th.msgs.slice(idx + 1).filter(m => m.from === 'them').length;
      if (th.unread > later) th.unread--;
      th.msgs.splice(idx, 1);
      th.updated = th.msgs.at(-1)?.ts || 0;
    }
    delete receipts[source];
    changed = true;
  }
  for (const [source, event] of messages) {
    if (receipts[source]) continue;
    const name = contact(event.name);
    const m = pushMsg(phone, name, { ...stamp, from: 'them', text: event.text, at: event.at });
    const th = threadOf(phone, name);
    if (!visible(keyOf(name))) th.unread = (th.unread || 0) + 1;
    receipts[source] = { sender: event.name, contact: name, text: event.text, id: m.id };
    changed = true;
    incoming(name, event);
  }
  if (changed) phone.turnReceipts = receipts;
  return changed;
}
