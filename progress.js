import { createSyncedDoc, accountHandle } from './sync.js';

export const XP_PER_LEVEL = 100;
export const POINTS_PER_LEVEL = 50;
export const POINTS_PER_REPLY = 2;

export const accountLevel = xp => 1 + Math.floor(xp / XP_PER_LEVEL);

const emptyAccount = () => ({
  v: 2, xp: 0, points: 0, xpBase: 0, bonus: 0,
  missions: {}, replies: {}, spends: {}, owned: [], equipped: '', equippedAt: 0,
});

const plain = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function settle(account) {
  const xp = Object.values(account.missions).reduce((sum, value) => sum + num(value), 0) + num(account.xpBase);
  const earned = Object.keys(account.replies).length * POINTS_PER_REPLY + (accountLevel(xp) - 1) * POINTS_PER_LEVEL;
  const spent = Object.values(account.spends).reduce((sum, value) => sum + num(value), 0);
  account.xp = xp;
  account.points = Math.max(0, earned + num(account.bonus) - spent);
  return account;
}

function upgrade(raw) {
  const a = plain(raw);
  if (a.v >= 2) return a;
  const missions = plain(a.missions);
  const replies = plain(a.replies);
  const missionSum = Object.values(missions).reduce((sum, value) => sum + num(value), 0);
  const xpBase = Math.max(0, num(a.xp) - missionSum);
  const level = accountLevel(missionSum + xpBase);
  const derived = Object.keys(replies).length * POINTS_PER_REPLY + (level - 1) * POINTS_PER_LEVEL;
  return { ...a, v: 2, xpBase, bonus: Math.max(0, num(a.points) - derived) };
}

const union = (a, b, pick) => {
  const out = {};
  for (const source of [plain(a), plain(b)]) {
    for (const [key, value] of Object.entries(source)) {
      if (BAD_KEYS.has(key)) continue;
      out[key] = Object.hasOwn(out, key) ? pick(out[key], value) : value;
    }
  }
  return out;
};

export function mergeAccounts(left, right) {
  const a = upgrade(left);
  const b = upgrade(right);
  const newer = num(b.equippedAt) > num(a.equippedAt) ? b : a;
  const out = {
    ...emptyAccount(),
    xpBase: Math.max(num(a.xpBase), num(b.xpBase)),
    bonus: Math.max(num(a.bonus), num(b.bonus)),
    missions: union(a.missions, b.missions, (x, y) => Math.max(num(x), num(y))),
    replies: union(a.replies, b.replies, () => 1),
    spends: union(a.spends, b.spends, (x, y) => Math.max(num(x), num(y))),
    owned: [...new Set([...(Array.isArray(a.owned) ? a.owned : []), ...(Array.isArray(b.owned) ? b.owned : [])])]
      .filter(id => typeof id === 'string'),
    equipped: typeof newer.equipped === 'string' ? newer.equipped : '',
    equippedAt: Math.max(num(a.equippedAt), num(b.equippedAt)),
  };
  return settle(out);
}

export function missionExp(rank) {
  const difficulty = String(rank ?? '').normalize('NFKC').toLowerCase().trim()
    .replace(/^(?:rank|ระดับ|ความยาก|แรงก์)\s*[:：-]?\s*/u, '');
  const grades = {
    e: 15, d: 20, c: 30, b: 40, a: 60, s: 80, 's+': 90, ss: 100, sss: 120,
    easy: 20, normal: 30, medium: 40, hard: 60, expert: 80, extreme: 100,
    ง่าย: 20, ปกติ: 30, ปานกลาง: 40, ยาก: 60, 'ยากมาก': 80, สูงสุด: 100,
  };
  return Object.hasOwn(grades, difficulty) ? grades[difficulty] : 30;
}

export function grantActivity(account, chat, missions, reply) {
  let xp = 0;
  const level = accountLevel(account.xp);
  for (const [id, rank] of missions) {
    const key = JSON.stringify([chat, id]);
    if (Object.hasOwn(account.missions, key)) continue;
    const earned = missionExp(rank);
    account.missions[key] = earned;
    xp += earned;
  }
  const replyKey = reply && JSON.stringify([chat, reply]);
  const points = replyKey && !Object.hasOwn(account.replies, replyKey) ? POINTS_PER_REPLY : 0;
  if (points) account.replies[replyKey] = 1;
  settle(account);
  return { xp, points, levels: accountLevel(account.xp) - level };
}

export function createProgressStore(headers, onChange) {
  let account = emptyAccount();
  let synced;
  let starting;

  const start = () => starting ||= (async () => {
    const handle = await accountHandle(headers);
    if (handle === null) return null;
    const doc = createSyncedDoc({
      name: 'bc_account.json',
      headers,
      cacheKey: 'bc_account_v2:' + encodeURIComponent(handle),
      empty: emptyAccount,
      merge: mergeAccounts,
      onChange: () => { account = synced.get(); onChange(); },
    });
    synced = doc;
    await doc.ready;
    const legacyKey = 'bc_account_v1:' + encodeURIComponent(handle);
    try {
      const old = localStorage.getItem(legacyKey);
      if (old && !localStorage.getItem(legacyKey + ':moved')) {
        const parsed = JSON.parse(old);
        await doc.update(next => { Object.assign(next, mergeAccounts(next, parsed)); return true; });
        if (doc.isOnline()) localStorage.setItem(legacyKey + ':moved', '1');
      }
    } catch (error) { console.warn('[Bot Console] could not import the old local account', error); }
    account = doc.get();
    onChange();
    return doc;
  })().then(doc => { if (!doc) starting = undefined; return doc; });

  void start();
  return {
    get: () => account,
    isOnline: () => !!synced?.isOnline(),
    sync: () => synced?.sync(),
    async update(change) {
      const doc = await start();
      if (!doc) return false;
      return doc.update(next => {
        const result = change(next);
        if (result) settle(next);
        return result;
      });
    },
  };
}
