export const XP_PER_LEVEL = 100;
export const POINTS_PER_LEVEL = 50;
export const POINTS_PER_REPLY = 2;

const emptyAccount = () => ({ xp: 0, points: 0, missions: {}, replies: {}, owned: [], equipped: '' });
export const accountLevel = xp => 1 + Math.floor(xp / XP_PER_LEVEL);

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
  account.xp += xp;
  const levels = accountLevel(account.xp) - level;
  account.points += points + levels * POINTS_PER_LEVEL;
  return { xp, points, levels };
}

export function createProgressStore(headers, onChange) {
  let account = emptyAccount();
  let key;
  function read() {
    return Object.assign(emptyAccount(), JSON.parse(localStorage.getItem(key) || '{}'));
  }
  const ready = (async () => {
    let handle = 'default-user';
    if (headers) {
      try {
        const response = await fetch('/api/users/me', { headers, signal: AbortSignal.timeout(5000) });
        if (response.ok) handle = (await response.json()).handle || handle;
        else if (response.status !== 404) throw new Error('Account lookup failed');
      } catch (error) {
        console.warn('[Bot Console] local account unavailable', error);
        return false;
      }
    }
    try {
      key = 'bc_account_v1:' + encodeURIComponent(handle);
      account = read();
      window.addEventListener('storage', event => {
        if (event.key !== key) return;
        account = read();
        onChange();
      });
      onChange();
      return true;
    } catch (error) {
      console.warn('[Bot Console] local storage unavailable', error);
      return false;
    }
  })();
  return {
    get: () => account,
    async update(change) {
      if (!await ready) return false;
      function commit() {
        const next = read();
        const result = change(next);
        if (!result) return false;
        localStorage.setItem(key, JSON.stringify(next));
        account = next;
        onChange();
        return result;
      }
      try {
        return navigator.locks?.request ? await navigator.locks.request(key, commit) : commit();
      } catch (error) {
        console.warn('[Bot Console] local account save failed', error);
        return false;
      }
    },
  };
}
