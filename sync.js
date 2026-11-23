

const FILES_URL = '/user/files/';

export async function accountHandle(headers) {
  if (!headers) return 'default-user';
  try {
    const response = await fetch('/api/users/me', { headers, signal: AbortSignal.timeout(5000) });
    if (response.ok) return (await response.json()).handle || 'default-user';
    if (response.status === 404) return 'default-user';
    throw new Error('Account lookup failed');
  } catch (error) {
    console.warn('[Bot Console] account unavailable', error);
    return null;
  }
}

export function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const serverFileUrl = (name, version) => FILES_URL + encodeURIComponent(name) + (version ? '?v=' + encodeURIComponent(version) : '');

export async function uploadFile(headers, name, base64) {
  if (!headers) throw new Error('no request headers');
  const response = await fetch('/api/files/upload', {
    method: 'POST', headers, body: JSON.stringify({ name, data: base64 }), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('upload failed: HTTP ' + response.status);
  return true;
}

export async function deleteFile(headers, name) {
  if (!headers) return false;
  try {
    const response = await fetch('/api/files/delete', {
      method: 'POST', headers, body: JSON.stringify({ path: 'user/files/' + name }), signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch { return false; }
}

async function readRemote(name) {
  const response = await fetch(FILES_URL + encodeURIComponent(name) + '?t=' + Date.now(), {
    cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('read failed: HTTP ' + response.status);
  try { return JSON.parse(await response.text()); } catch { return null; }
}

 
export function createSyncedDoc({ name, headers, cacheKey, empty, merge, onChange, interval = 30000 }) {
  const norm = doc => merge(empty(), doc && typeof doc === 'object' ? doc : {});
  let doc = empty();
  let queue = Promise.resolve();
  let online = false;
  const lockName = 'bc-sync:' + name;
  const notify = () => { try { onChange?.(); } catch (error) { console.warn('[Bot Console] sync listener failed', error); } };

  const readCache = () => {
    try { return norm(JSON.parse(localStorage.getItem(cacheKey) || 'null')); } catch { return empty(); }
  };
  const writeCache = value => { try { localStorage.setItem(cacheKey, JSON.stringify(value)); } catch {   } };

  const exclusive = task => {
    const run = () => (navigator.locks?.request ? navigator.locks.request(lockName, task) : task());
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  };

  async function reconcile() {
    const local = readCache();
    let remote = null;
    let reachable = true;
    try { remote = await readRemote(name); } catch (error) { reachable = false; console.warn('[Bot Console] sync read failed:', name, error); }
    online = reachable;
    const merged = merge(local, remote || empty());
    if (reachable && headers && stable(merged) !== stable(norm(remote))) {
      try { await uploadFile(headers, name, utf8ToBase64(JSON.stringify(merged))); }
      catch (error) { online = false; console.warn('[Bot Console] sync write failed:', name, error); }
    }
    writeCache(merged);
    const changed = stable(merged) !== stable(doc);
    doc = merged;
    return changed;
  }

  const sync = () => exclusive(reconcile).then(changed => { if (changed) notify(); return changed; }).catch(() => false);

  const ready = (async () => {
    doc = readCache();
    await Promise.resolve();
    notify();
    await sync();
    return true;
  })();

  const poll = () => { if (document.visibilityState === 'visible') void sync(); };
  document.addEventListener('visibilitychange', poll);
  window.addEventListener('focus', poll);
  window.addEventListener('online', poll);
  window.addEventListener('storage', event => {
    if (event.key !== cacheKey) return;
    doc = readCache();
    notify();
  });
  setInterval(poll, interval);

  return {
    ready,
    get: () => doc,
    isOnline: () => online,
    sync,

    async update(change) {
      await ready;
      let result = false;
      try {
        await exclusive(async () => {

          let remote = null;
          try { remote = await readRemote(name); online = true; } catch { online = false; }
          const next = merge(readCache(), remote || empty());
          result = change(next);
          if (!result) return;
          const merged = merge(next, empty());
          writeCache(merged);
          doc = merged;
          if (online && headers) {
            try { await uploadFile(headers, name, utf8ToBase64(JSON.stringify(merged))); }
            catch (error) { online = false; console.warn('[Bot Console] sync write failed:', name, error); }
          }
        });
      } catch (error) {
        console.warn('[Bot Console] save failed', error);
        return false;
      }
      if (result) notify();
      return result;
    },
  };
}

export const emptyPrefs = () => ({ v: 1, keys: {} });

export function mergePrefs(a, b) {
  const out = emptyPrefs();
  for (const src of [a, b]) {
    const keys = src && typeof src === 'object' && src.keys && typeof src.keys === 'object' ? src.keys : {};
    for (const [key, entry] of Object.entries(keys)) {
      if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.at)) continue;
      const have = out.keys[key];

      if (!have || entry.at > have.at || (entry.at === have.at && stable(entry.v) > stable(have.v))) {
        out.keys[key] = { v: entry.v, at: entry.at };
      }
    }
  }
  return out;
}

export const prefValue = (doc, key, fallback) => (Object.hasOwn(doc?.keys || {}, key) ? doc.keys[key].v : fallback);

export function setPref(doc, key, value) {
  const prev = Object.hasOwn(doc.keys, key) ? doc.keys[key].at : 0;
  doc.keys[key] = { v: value, at: Math.max(Date.now(), prev + 1) };
}
