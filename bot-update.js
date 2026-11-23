const nameKey = name => String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const safeFilename = /^[^<>:"/\\|?*\x00-\x1f]+\.(?:png|json)$/i;
const editableAvatar = name => safeFilename.test(name) && name.endsWith('.png') && name.indexOf('.png') === name.length - 4;
const versionParts = version => /^\d+\.\d+\.\d+$/.test(version) ? version.split('.').map(Number) : null;
const cardName = card => card?.data?.name ?? card?.name;

function installed(card, version) {
  const raw = card.data?.extensions?.bot_console?.cardVersion ?? card.data?.character_version ?? card.character_version;
  if (raw === version) return true;
  const current = versionParts(raw), incoming = versionParts(version);
  if (!current || !incoming) return false;
  return (current[0] - incoming[0] || current[1] - incoming[1] || current[2] - incoming[2]) >= 0;
}

function pngCard(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
    throw new Error('Invalid card PNG');
  }
  const decoder = new TextDecoder();
  const metadata = new Map();
  for (let start = 8; start + 12 <= view.byteLength;) {
    const length = view.getUint32(start);
    const end = start + 12 + length;
    if (end > view.byteLength) throw new Error('Invalid PNG chunk length');
    const kind = decoder.decode(new Uint8Array(buffer, start + 4, 4));
    if (kind === 'IEND') break;
    if (kind === 'tEXt') {
      const chunk = new Uint8Array(buffer, start + 8, length);
      const delimiter = chunk.indexOf(0);
      if (delimiter > 0) {
        const key = decoder.decode(chunk.subarray(0, delimiter)).toLowerCase();
        if ((key === 'chara' || key === 'ccv3') && !metadata.has(key)) {
          metadata.set(key, decoder.decode(chunk.subarray(delimiter + 1)));
        }
      }
    }
    start = end;
  }
  const json = atob(metadata.get('ccv3') || metadata.get('chara') || '');
  return JSON.parse(decoder.decode(Uint8Array.from(json, char => char.charCodeAt(0))));
}

async function bundledConfig() {
  const response = await fetch(new URL('./bot-update.json', import.meta.url), { cache: 'no-store', signal: AbortSignal.timeout(7000) });
  if (!response.ok) return null;
  const config = await response.json();
  if (!config || typeof config.name !== 'string' || !config.name.trim() || !versionParts(config.version) ||
      typeof config.file !== 'string' || !safeFilename.test(config.file) || /^\./.test(config.file)) return null;
  return config;
}

function cardForm(card, current, candidate, picture) {
  const data = card.data || card;
  const extensions = data.extensions || {};
  const savedExtensions = current.data?.extensions || {};
  const fav = savedExtensions.fav ?? current.fav ?? false;
  const depth = extensions.depth_prompt || {};
  const form = new FormData();
  for (const field of ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator', 'system_prompt', 'post_history_instructions']) {
    form.set(field, String(data[field] ?? ''));
  }
  form.set('creator_notes', String(data.creator_notes ?? data.creatorcomment ?? ''));
  form.set('avatar_url', current.avatar);
  form.set('ch_name', cardName(current));
  form.set('chat', current.chat || '');
  form.set('create_date', current.create_date || '');
  form.set('character_version', candidate.version);
  form.set('talkativeness', extensions.talkativeness ?? data.talkativeness ?? 0.5);
  form.set('fav', String(fav));
  form.set('depth_prompt_prompt', depth.prompt ?? '');
  form.set('depth_prompt_depth', depth.depth ?? 4);
  form.set('depth_prompt_role', depth.role ?? 'system');
  for (const field of ['tags', 'alternate_greetings']) {
    for (const value of Array.isArray(data[field]) ? data[field] : []) {
      if (typeof value === 'string') form.append(field, value);
    }
  }
  form.set('json_data', JSON.stringify({ data }));
  form.set('extensions', JSON.stringify({
    ...extensions, fav, world: savedExtensions.world || extensions.world || '',
    bot_console: { cardVersion: candidate.version },
  }));
  if (picture) form.set('avatar', picture, candidate.file);
  return form;
}

export function createBotUpdater(context, onChange, generating) {
  const offered = new Set();
  let configPromise, offer = null, checking = false, busy = false;
  const dialog = document.createElement('dialog');
  dialog.id = 'bc-bot-update';
  dialog.className = 'bc-update-popup';
  dialog.setAttribute('aria-labelledby', 'bc-bot-update-title');
  dialog.innerHTML = `<h2 id="bc-bot-update-title">อัปเดตบอท</h2><p role="status"></p>
    <div class="bc-update-actions"><button type="button" data-dismiss>ไว้ทีหลัง</button>
    <button type="button" data-update>อัปเดตบอท</button></div>`;
  document.body.append(dialog);
  const message = dialog.querySelector('p');
  const button = dialog.querySelector('[data-update]');
  const headers = () => context().getRequestHeaders?.();
  const show = () => {
    if (!offer || dialog.open || document.hidden || generating() || document.querySelector('dialog[open]')) return;
    message.textContent = `${offer.name} (${offer.avatar}) มีการ์ดเวอร์ชัน ${offer.version} พร้อมติดตั้ง ประวัติแชทเดิมจะยังอยู่`;
    dismiss.textContent = 'ไว้ทีหลัง';
    button.hidden = false;
    dialog.showModal();
    offered.add(offer.avatar);
  };
  const dismiss = dialog.querySelector('[data-dismiss]');
  dismiss.addEventListener('click', () => dialog.close());

  async function getCard(avatar) {
    const response = await fetch('/api/characters/get', {
      method: 'POST', headers: headers(), body: JSON.stringify({ avatar_url: avatar }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Existing character card unavailable');
    return response.json();
  }

  async function check() {
    if (checking || busy || dialog.open || generating()) return;
    checking = true;
    try {
      configPromise ||= bundledConfig().catch(() => null);
      const config = await configPromise;
      if (!config) return;
      const c = context();
      const matches = (c.characters || []).filter(card => nameKey(cardName(card)) === nameKey(config.name));
      const selected = matches.length === 1 ? matches[0] : matches.find(card => card.avatar === c.characters[c.characterId]?.avatar);
      const avatar = selected?.avatar;
      let next = null;
      if (typeof avatar === 'string' && editableAvatar(avatar) && !installed(selected, config.version)) {
        if (offer?.avatar === avatar) next = offer;
        else {
          const current = await getCard(avatar);
          if (nameKey(cardName(current)) === nameKey(config.name) && !installed(current, config.version)) next = { ...config, avatar };
        }
      }
      if (offer?.avatar !== next?.avatar) {
        offer = next;
        onChange();
      }
      if (offer && !offered.has(offer.avatar)) show();
    } catch (error) {
      console.warn('[Bot Console] bot update check failed', error);
    } finally {
      checking = false;
    }
  }

  button.addEventListener('click', async () => {
    if (!offer || busy) return;
    if (generating()) {
      message.textContent = 'รอให้บอทตอบจบก่อน แล้วลองอีกครั้ง';
      return;
    }
    const candidate = offer;
    busy = true;
    button.disabled = true;
    message.textContent = 'กำลังอัปเดตบอท…';
    try {
      const current = await getCard(candidate.avatar);
      if (current.avatar !== candidate.avatar || nameKey(cardName(current)) !== nameKey(candidate.name)) throw new Error('Character changed');
      if (!installed(current, candidate.version)) {
        const filename = encodeURIComponent(candidate.file);
        const options = { cache: 'no-store', signal: AbortSignal.timeout(15000) };
        let response = await fetch(new URL('./bots/' + filename, import.meta.url), options);
        if (response.status === 404) response = await fetch(new URL('./' + filename, import.meta.url), options);
        if (!response.ok) throw new Error('Bundled character file unavailable');
        const picture = /\.png$/i.test(candidate.file) ? await response.blob() : null;
        const card = picture ? pngCard(await picture.arrayBuffer()) : await response.json();
        const data = card?.data || card;
        if (nameKey(cardName(card)) !== nameKey(candidate.name) ||
            !['description', 'personality', 'scenario', 'first_mes', 'system_prompt'].some(field => typeof data[field] === 'string' && data[field].trim())) {
          throw new Error('Bundled file does not contain the expected character');
        }
        if (generating()) throw new Error('Generation in progress');
        const form = cardForm(card, current, candidate, picture);
        const requestHeaders = new Headers(context().getRequestHeaders?.({ omitContentType: true }));
        requestHeaders.delete('Content-Type');
        const saved = await fetch('/api/characters/edit', {
          method: 'POST', headers: requestHeaders, body: form, signal: AbortSignal.timeout(45000),
        });
        if (!saved.ok || !installed(await getCard(candidate.avatar), candidate.version)) throw new Error('Character card was not saved');
      }
      offer = null;
      try { await context().getOneCharacter?.(candidate.avatar); } catch (error) { console.warn('[Bot Console] card refresh failed', error); }
      message.textContent = `อัปเดต ${candidate.name} เป็นเวอร์ชัน ${candidate.version} แล้ว`;
      button.hidden = true;
      dismiss.textContent = 'ปิด';
      onChange();
    } catch (error) {
      console.warn('[Bot Console] bot card update failed', error);
      message.textContent = 'อัปเดตบอทไม่สำเร็จ กดลองอีกครั้งได้';
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  document.addEventListener('close', event => {
    if (event.target.id === 'bc-update-dialog') void check();
  }, true);
  return {
    get: () => offer,
    check,
    open: show,
  };
}
