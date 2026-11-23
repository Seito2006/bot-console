const INTERVAL = 15 * 60 * 1000;
const OFFICIAL_REMOTE = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)seito2006\/bot-console(?:\.git)?\/?$/i;
const folder = decodeURIComponent(new URL('./', import.meta.url).pathname.split('/').at(-2));

async function releaseFile(name) {
  const response = await fetch(new URL(name, import.meta.url), { cache: 'no-store', signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error('Release information unavailable');
  return response.json();
}

function compareVersions(a, b) {
  const parts = version => /^\d+\.\d+\.\d+$/.test(version) ? version.split('.').map(Number) : [];
  const left = parts(a), right = parts(b);
  if (!left.length || !right.length) return NaN;
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

async function renderLog(container, { from = '', through = '' } = {}) {
  container.textContent = 'กำลังโหลดรายการอัปเดต…';
  try {
    const releases = await releaseFile('./changelog.json');
    container.replaceChildren();
    for (const entry of releases) {
      if (from && compareVersions(entry.version, from) <= 0) continue;
      if (through && compareVersions(entry.version, through) > 0) continue;
      if (!Array.isArray(entry.changes) || !entry.changes.length) continue;
      const title = document.createElement('h3'), list = document.createElement('ul');
      title.textContent = 'เวอร์ชัน ' + entry.version;
      for (const change of entry.changes) {
        const item = document.createElement('li');
        item.textContent = change;
        list.append(item);
      }
      container.append(title, list);
    }
    if (!container.childElementCount) container.textContent = 'ยังไม่มีรายการเปลี่ยนแปลงสำหรับอัปเดตนี้';
  } catch {
    container.textContent = 'โหลดรายการเปลี่ยนแปลงไม่สำเร็จ';
  }
}

export function createUpdater(context, onChange) {
  let lastCheck = 0;
  let installation;
  let status = 'idle';
  let version = '';
  let offered = false;
  let notesPending = false;
  const dialog = document.createElement('dialog');
  dialog.id = 'bc-update-dialog';
  dialog.className = 'bc-update-popup';
  dialog.setAttribute('aria-labelledby', 'bc-update-title');
  dialog.innerHTML = `<h2 id="bc-update-title">อัปเดต Bot Console</h2>
    <p role="status"></p><div class="bc-release-log" hidden></div><div class="bc-update-actions">
    <button type="button" data-dismiss>ไว้ทีหลัง</button><button type="button" data-update>อัปเดต</button></div>`;
  document.body.append(dialog);
  const detail = dialog.querySelector('p');
  const installedLog = dialog.querySelector('.bc-release-log');
  const updateButton = dialog.querySelector('[data-update]');
  const dismiss = dialog.querySelector('[data-dismiss]');

  function offerUpdate() {
    if (status === 'installed' && notesPending && !document.hidden) {
      if (!dialog.open && document.querySelector('dialog[open]')) return;
      if (!dialog.open) dialog.showModal();
      notesPending = false;
      return;
    }
    if (status !== 'available' || offered || document.hidden || document.querySelector('dialog[open]')) return;
    dialog.showModal();
    offered = true;
  }

  function setStatus(next) {
    status = next;
    detail.textContent = {
      available: 'มีอัปเดตใหม่จาก GitHub พร้อมติดตั้ง',
      installing: 'กำลังติดตั้งอัปเดต…',
      installed: 'ติดตั้งเรียบร้อยแล้ว เปิดหน้าใหม่เพื่อใช้เวอร์ชันล่าสุด',
      forbidden: 'การติดตั้งนี้ต้องใช้บัญชีผู้ดูแลของ SillyTavern',
      failed: 'ติดตั้งอัปเดตไม่สำเร็จ กดลองอีกครั้งได้',
    }[next] || '';
    updateButton.disabled = next === 'installing' || next === 'forbidden';
    updateButton.textContent = next === 'installed' ? 'โหลดหน้าใหม่' : next === 'failed' ? 'ลองอีกครั้ง' : 'อัปเดต';
    dismiss.textContent = next === 'installed' ? 'ปิด' : 'ไว้ทีหลัง';
    onChange();
  }

  async function request(action, timeout) {
    const response = await fetch('/api/extensions/' + action, {
      method: 'POST', headers: context().getRequestHeaders?.(),
      body: JSON.stringify(installation), signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw Object.assign(new Error('Update service returned ' + response.status), { status: response.status });
    return response.json();
  }

  async function check(manual = false) {
    if (status === 'installed' || status === 'installing' || status === 'checking') return;
    if (!manual && (Date.now() - lastCheck < INTERVAL || status === 'available')) return;
    lastCheck = Date.now();
    setStatus('checking');
    try {
      if (!version) {
        version = (await releaseFile('./manifest.json')).version || '';
      }
      if (!installation) {
        const list = await fetch('/api/extensions/discover', { signal: AbortSignal.timeout(8000) });
        if (!list.ok) throw new Error('Extension discovery failed');
        const found = (await list.json()).find(entry => entry.name === 'third-party/' + folder && ['local', 'global'].includes(entry.type));
        if (!found) return setStatus('unsupported');
        installation = { extensionName: folder, global: found.type === 'global' };
      }
      const info = await request('version', 20000);
      if (!info.currentCommitHash || !OFFICIAL_REMOTE.test(info.remoteUrl || '')) return setStatus('unsupported');
      if (info.isUpToDate !== false) return setStatus('current');
      setStatus('available');
      if (manual) offered = false;
      offerUpdate();
    } catch {
      setStatus('offline');
    }
  }

  updateButton.addEventListener('click', async () => {
    if (status === 'installed') { location.reload(); return; }
    if (!['available', 'failed'].includes(status)) return;
    setStatus('installing');
    try {
      await request('update', 120000);
    } catch (error) {
      setStatus(error.status === 403 ? 'forbidden' : 'failed');
      return;
    }
    const from = version;
    try { version = (await releaseFile('./manifest.json')).version || version; } catch { /* Use the cached version when the new manifest is unavailable. */ }
    await renderLog(installedLog, { from: compareVersions(version, from) > 0 ? from : '', through: version });
    installedLog.hidden = false;
    notesPending = true;
    setStatus('installed');
    offerUpdate();
  });
  dismiss.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (status !== 'installed' || notesPending) return;
    installedLog.hidden = true;
    installedLog.replaceChildren();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    offerUpdate();
    void check();
  });
  document.addEventListener('close', offerUpdate, true);
  setInterval(() => { if (!document.hidden) void check(); }, INTERVAL);
  return {
    get: () => ({ version, status }),
    check,
    open: () => {
      if (['available', 'installed', 'failed', 'forbidden'].includes(status)) {
        if (!dialog.open) dialog.showModal();
        if (!document.hidden) offerUpdate();
      }
      else void check(true);
    },
  };
}
