const nameKey = name => String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const safeFilename = /^[^<>:"/\\|?*\x00-\x1f]+\.(?:png|json)$/i;
const editableAvatar = name => safeFilename.test(name) && name.endsWith('.png') && name.indexOf('.png') === name.length - 4;
const versionParts = version => typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) ? version.split('.').map(Number) : null;
const cardName = card => card?.data?.name ?? card?.name;
const visibleVersion = card => card.data ? card.data.character_version : card.character_version;
const trackedVersion = card => card.data?.extensions?.bot_console?.cardVersion;

function compareVersion(card, candidate) {
  const version = candidate.folder === 'hsr' ? visibleVersion(card) : trackedVersion(card) ?? visibleVersion(card);
  const current = versionParts(version), incoming = versionParts(candidate.version);
  if (!current || !incoming) return -1;
  return current[0] - incoming[0] || current[1] - incoming[1] || current[2] - incoming[2];
}

function installed(card, candidate) {
  const comparison = compareVersion(card, candidate);
  if (comparison !== 0) return comparison > 0;
  return hasCardContent(card, candidate);
}

function hasCardContent(card, candidate) {
  const extensions = card.data?.extensions;
  if (candidate.lorebook && extensions?.world !== candidate.lorebook.slice(0, -5)) return false;
  const scripts = Array.isArray(extensions?.regex_scripts) ? extensions.regex_scripts : [];
  return Object.entries(candidate.requiredRegex || {}).every(([name, marker]) =>
    scripts.some(script => script?.scriptName === name && !script.disabled &&
      typeof script.replaceString === 'string' && script.replaceString.includes(marker)));
}

function canRepairVersion(card, candidate) {
  return candidate.folder === 'hsr' && compareVersion(card, candidate) < 0 &&
    (trackedVersion(card) === candidate.version ||
      (candidate.preserveCardFrom && visibleVersion(card) === candidate.preserveCardFrom)) &&
    hasCardContent(card, candidate);
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
  if (!response.ok) throw new Error('Bot update manifest unavailable');
  const value = await response.json();
  return (Array.isArray(value) ? value : [value]).filter(config =>
    typeof config?.name === 'string' && config.name.trim() && versionParts(config.version) &&
    typeof config.file === 'string' && safeFilename.test(config.file) && !config.file.startsWith('.') &&
    (config.folder === undefined || config.folder === 'hi3' || config.folder === 'hsr'));
}

const bundledUrl = (name, folder) => new URL(`./bots/${folder ? folder + '/' : ''}${encodeURIComponent(name)}`, import.meta.url);

const obsoleteHsrPhoneRegex = script => /\bHSR_PHONE\b/i.test(script?.findRegex || '');
const obsoleteHsrPhoneEntry = entry => /\bHSR_PHONE\b/i.test(entry?.content || '') &&
  (entry.comment?.trim() === 'มือถือ' || /ASTRALLINK TERMINAL PROTOCOL/i.test(entry.content));

function findLoreEntry(entries, comment) {
  return Object.keys(entries).find(key => {
    const entry = entries[key];
    if (nameKey(entry?.comment) === nameKey(comment)) return true;
    const content = String(entry?.content || '');
    if (comment === 'Bond & Trust Controller') return /bondDelta/i.test(content) && /trustDelta/i.test(content);
    if (comment === 'Amber Era Calendar Controller') return /Qlipoth/i.test(content) && /76\D+240/.test(content);
    return false;
  });
}

function loreEntryContent(existing, bundled, controls) {
  if (controls.includes(bundled.comment)) return bundled.content;
  const content = existing.content || '';
  if (bundled.comment !== 'NPC List' || /^[ \t]*Caelus[ \t]*=/im.test(content)) return content;
  const line = bundled.content.match(/^[ \t]*Caelus[ \t]*=[^\r\n]+/im)?.[0];
  if (!line) return content;
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  if (/^[ \t]*Stelle[ \t]*=[^\r\n]+/im.test(content)) {
    return content.replace(/^[ \t]*Stelle[ \t]*=[^\r\n]+/im, stelle => stelle + newline + line);
  }
  return content + (content && !content.endsWith('\n') ? newline : '') + line;
}

function needsLoreRepair(existing, bundled, controls) {
  if (Object.values(existing).some(obsoleteHsrPhoneEntry)) return true;
  return Object.values(bundled).some(entry => {
    const managed = controls.includes(entry.comment);
    if (!managed && entry.comment !== 'NPC List') return false;
    const previous = existing[findLoreEntry(existing, entry.comment)];
    return !previous || previous.content !== loreEntryContent(previous, entry, controls);
  });
}

function mergeLorebook(existing, bundled, controls) {
  const entries = Object.fromEntries(Object.entries(existing.entries).filter(([, entry]) => !obsoleteHsrPhoneEntry(entry)));
  let nextId = Math.max(-1, ...Object.keys(entries).map(Number).filter(Number.isSafeInteger)) + 1;
  for (const [id, entry] of Object.entries(bundled.entries)) {
    const match = findLoreEntry(entries, entry.comment);
    if (match !== undefined) {
      const content = loreEntryContent(entries[match], entry, controls);
      if (entries[match].content !== content) {
        entries[match] = { ...entries[match], content };
      }
      continue;
    }
    const uid = Object.hasOwn(entries, id) ? nextId++ : Number(id);
    nextId = Math.max(nextId, uid + 1);
    entries[uid] = { ...entry, uid };
  }
  return { ...bundled, ...existing, entries };
}

const tagsOf = card => [...new Set([card?.tags, card?.data?.tags].flatMap(tags =>
  Array.isArray(tags) ? tags.filter(tag => typeof tag === 'string' && tag.trim()) : []))];
const missingTags = (card, config) => (config.requiredTags || []).filter(tag => !tagsOf(card).includes(tag));

function missingLibraryTags(context, avatar, config) {
  const { tags, tagMap } = context;
  if (!Array.isArray(tags) || !tagMap) return [];
  const assigned = tagMap[avatar] || [];
  return (config.requiredTags || []).filter(name => !tags.some(tag =>
    nameKey(tag.name) === nameKey(name) && assigned.includes(tag.id)));
}

function repairEmbeddedBook(current, bundled, controls) {
  const source = bundled.data.character_book;
  const book = current.data?.character_book;
  const entries = Array.isArray(book?.entries) ? book.entries.filter(entry => !obsoleteHsrPhoneEntry(entry)) : [];
  let nextId = Math.max(-1, ...entries.map(entry => entry.id).filter(Number.isSafeInteger)) + 1;
  for (const entry of source.entries.filter(entry => controls.includes(entry.comment) || entry.comment === 'NPC List')) {
    const index = findLoreEntry(entries, entry.comment);
    if (index === undefined) {
      entries.push({ ...entry, id: nextId++ });
    } else {
      const content = loreEntryContent(entries[index], entry, controls);
      if (entries[index].content !== content) entries[index] = { ...entries[index], content };
    }
  }
  return { ...current, data: { ...current.data, character_book: { ...source, ...book, entries } } };
}

function cardForm(card, current, candidate, picture) {
  const data = card.data || card;
  const extensions = data.extensions || {};
  const savedExtensions = current.data?.extensions || {};
  const fav = savedExtensions.fav ?? current.fav ?? false;
  const world = candidate.lorebook?.slice(0, -5) || savedExtensions.world || extensions.world || '';
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
  form.set('world', world);
  form.set('talkativeness', extensions.talkativeness ?? data.talkativeness ?? 0.5);
  form.set('fav', String(fav));
  form.set('depth_prompt_prompt', depth.prompt ?? '');
  form.set('depth_prompt_depth', depth.depth ?? 4);
  form.set('depth_prompt_role', depth.role ?? 'system');
  const tags = [...new Set([...tagsOf(current), ...tagsOf(card), ...(candidate.requiredTags || [])])];
  form.set('tags', tags.join(','));
  for (const value of Array.isArray(data.alternate_greetings) ? data.alternate_greetings : []) {
    if (typeof value === 'string') form.append('alternate_greetings', value);
  }
  form.set('json_data', JSON.stringify({ data: { ...data, character_version: candidate.version, tags } }));
  form.set('extensions', JSON.stringify({
    ...extensions, fav, world,
    bot_console: { ...savedExtensions.bot_console, ...extensions.bot_console, cardVersion: candidate.version },
  }));
  if (picture) form.set('avatar', picture, candidate.cover || candidate.file);
  return form;
}

export function createBotUpdater(context, onChange, generating) {
  const offered = new Set();
  let configPromise, offers = [], selectedOffer = null, checking = false, busy = false;
  let recheck = false;
  let updateRevision = 0;
  const dialog = document.createElement('dialog');
  dialog.id = 'bc-bot-update';
  dialog.className = 'bc-update-popup';
  dialog.setAttribute('aria-labelledby', 'bc-bot-update-title');
  dialog.innerHTML = `<h2 id="bc-bot-update-title">อัปเดตบอท</h2><p role="status"></p>
    <div class="bc-release-log" hidden></div>
    <div class="bc-update-actions"><button type="button" data-dismiss>ไว้ทีหลัง</button>
    <button type="button" data-update>อัปเดตบอท</button></div>`;
  document.body.append(dialog);
  const message = dialog.querySelector('p');
  const releaseLog = dialog.querySelector('.bc-release-log');
  const button = dialog.querySelector('[data-update]');
  const headers = () => context().getRequestHeaders?.();
  const offerKey = offer => JSON.stringify([offer.avatar, offer.version]);
  const show = offer => {
    if (!offer || busy || dialog.open || document.hidden || generating() || document.querySelector('dialog[open]')) return;
    selectedOffer = offer;
    const book = offer.lorebookControls ? ' ระบบจะอัปเดตตัวควบคุมใน Lorebook และเก็บรายการอื่นไว้' :
      offer.lorebook ? ` ระบบจะบันทึกทับ Lorebook ชื่อ “${offer.lorebook.slice(0, -5)}”` : '';
    message.textContent = !offer.repairVersion && (offer.repairLorebook || offer.repairTags || offer.repairEmbedded || offer.repairLibraryTags || offer.repairRegex) ? `พร้อมอัปเดตข้อมูลเสริมของ ${offer.name}${book}` :
      `พร้อมอัปเดต ${offer.name} (${offer.avatar}) เป็นเวอร์ชัน ${offer.version} ประวัติแชทจะยังอยู่${book}`;
    dismiss.textContent = 'ไว้ทีหลัง';
    releaseLog.hidden = true;
    releaseLog.replaceChildren();
    button.hidden = false;
    dialog.showModal();
    offered.add(offerKey(offer));
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

  async function bundledFile(name, folder) {
    if (typeof name !== 'string' || !/^[^<>:"/\\|?*\x00-\x1f]+\.(?:json|png|jpg|jpeg|webp)$/i.test(name) || name.startsWith('.')) throw new Error('Invalid bundled filename');
    const response = await fetch(bundledUrl(name, folder), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Bundled file unavailable: ' + name);
    return response;
  }

  async function getLorebook(name) {
    const response = await fetch('/api/worldinfo/get', {
      method: 'POST', headers: headers(), body: JSON.stringify({ name }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Existing Lorebook could not be read');
    const book = await response.json();
    if (!book?.entries || typeof book.entries !== 'object' || Array.isArray(book.entries)) throw new Error('Invalid existing Lorebook');
    return book;
  }

  async function installLorebook(candidate) {
    if (!candidate.lorebook) return;
    const file = candidate.lorebook;
    if (typeof file !== 'string' || !/\.json$/i.test(file)) throw new Error('Invalid Lorebook filename');
    let data = await (await bundledFile(file, candidate.folder)).json();
    if (!data?.entries || typeof data.entries !== 'object' || !Object.keys(data.entries).length) throw new Error('Invalid Lorebook data');
    const name = file.slice(0, -5);
    if (candidate.lorebookControls) data = mergeLorebook(await getLorebook(name), data, candidate.lorebookControls);
    if (generating()) throw new Error('Generation in progress');
    const response = await fetch('/api/worldinfo/edit', {
      method: 'POST', headers: headers(), body: JSON.stringify({ name, data }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Lorebook update failed');
  }

  async function saveCard(card, current, candidate, picture) {
    if (generating()) throw new Error('Generation in progress');
    const requestHeaders = new Headers(context().getRequestHeaders?.({ omitContentType: true }));
    requestHeaders.delete('Content-Type');
    const saved = await fetch('/api/characters/edit', {
      method: 'POST', headers: requestHeaders, body: cardForm(card, current, candidate, picture),
      signal: AbortSignal.timeout(45000),
    });
    if (!saved.ok) throw new Error('Character card was not saved');
    const updated = await getCard(candidate.avatar);
    if (!installed(updated, candidate) || visibleVersion(updated) !== candidate.version || missingTags(updated, candidate).length) {
      throw new Error('Character card was not saved');
    }
    return updated;
  }

  async function check(folder = '') {
    if (!folder && checking) recheck = true;
    if (checking || busy || dialog.open || generating()) {
      return 'กำลังตรวจสอบหรือมีงานในแชท รอสักครู่แล้วลองอีกครั้ง';
    }
    checking = true;
    const revision = updateRevision;
    try {
      configPromise ||= bundledConfig();
      const manifest = await configPromise;
      const configs = folder ? manifest.filter(config => config.folder === folder) : manifest;
      if (folder && !configs.length) return 'ชุดอัปเดตของบอทนี้ไม่อยู่ในส่วนเสริมที่โหลดอยู่';
      const c = context();
      const active = c.characters?.[c.characterId]?.avatar;
      const outcomes = await Promise.allSettled(configs.map(async config => {
        const matches = (c.characters || []).filter(card => nameKey(cardName(card)) === nameKey(config.name));
        const selected = matches.length === 1 ? matches[0] : matches.find(card => card.avatar === active);
        const avatar = selected?.avatar;
        if (!selected) return { detail: matches.length ? 'เปิดแชทของการ์ด HSR ใบที่ต้องการอัปเดต' : 'ไม่พบการ์ด HSR ในคลังตัวละคร' };
        if (typeof avatar !== 'string' || !editableAvatar(avatar)) return { detail: 'อ่านไฟล์การ์ดที่เลือกไม่ได้' };
        if (!folder && !config.lorebookControls && installed(selected, config)) return {};
        const current = await getCard(avatar);
        if (nameKey(cardName(current)) !== nameKey(config.name)) return { detail: 'ชื่อการ์ดที่เลือกไม่ตรงกับชุดอัปเดต' };
        const repairVersion = canRepairVersion(current, config);
        if (installed(current, config) || repairVersion) {
          if (config.lorebookControls && (repairVersion || compareVersion(current, config) === 0)) {
            const [book, bundled] = await Promise.all([
              getLorebook(config.lorebook.slice(0, -5)),
              bundledFile(config.lorebook, config.folder).then(response => response.json()),
            ]);
            const repairLorebook = needsLoreRepair(book.entries, bundled.entries, config.lorebookControls);
            const repairTags = missingTags(current, config).length > 0;
            const repairLibraryTags = missingLibraryTags(context(), avatar, config).length > 0;
            const embedded = current.data?.character_book?.entries || [];
            const repairEmbedded = needsLoreRepair(embedded, bundled.entries, config.lorebookControls);
            const scripts = current.data?.extensions?.regex_scripts;
            const repairRegex = Array.isArray(scripts) && scripts.some(obsoleteHsrPhoneRegex);
            if (repairVersion || repairLorebook || repairTags || repairEmbedded || repairLibraryTags || repairRegex) {
              return { offer: { ...config, avatar, repairVersion, repairLorebook, repairTags, repairEmbedded, repairLibraryTags, repairRegex } };
            }
          }
          return { detail: compareVersion(current, config) > 0
            ? 'การ์ด HSR เป็นรุ่นใหม่กว่าชุดอัปเดตที่มี'
            : 'การ์ด HSR เป็นรุ่นล่าสุดแล้ว เปิดหน้าสร้างตัวละครเพื่อเลือกผู้บุกเบิก' };
        }
        return { offer: { ...config, avatar } };
      }));
      if (busy || revision !== updateRevision) return;
      const found = outcomes.flatMap(result => {
        if (result.status === 'rejected') {
          console.warn('[Bot Console] character update check failed', result.reason);
          return [];
        }
        return result.value.offer ? [result.value.offer] : [];
      });
      const next = folder ? [...offers.filter(offer => offer.folder !== folder), ...found] : found;
      if (JSON.stringify(offers.map(offerKey)) !== JSON.stringify(next.map(offerKey))) {
        offers = next;
        onChange();
      }
      if (folder) {
        if (found.length) show(found[0]);
        else return outcomes[0]?.value?.detail || 'ตรวจสอบการ์ดไม่สำเร็จ ลองอีกครั้งได้';
        return;
      }
      const unseen = offers.filter(offer => !offered.has(offerKey(offer)));
      const latest = context();
      const current = latest.characters?.[latest.characterId];
      const currentOffer = unseen.find(offer => offer.avatar === current?.avatar);
      show(currentOffer || unseen[0]);
    } catch (error) {
      configPromise = null;
      console.warn('[Bot Console] bot update check failed', error);
      return 'โหลดชุดอัปเดตการ์ดไม่สำเร็จ ลองอีกครั้งได้';
    } finally {
      checking = false;
      if (recheck) {
        recheck = false;
        void check();
      }
    }
  }

  button.addEventListener('click', async () => {
    if (!selectedOffer || busy) return;
    if (generating()) {
      message.textContent = 'รอให้บอทตอบจบก่อน แล้วลองอีกครั้ง';
      return;
    }
    const candidate = selectedOffer;
    busy = true;
    updateRevision++;
    button.disabled = true;
    message.textContent = 'กำลังอัปเดตบอท…';
    try {
      const current = await getCard(candidate.avatar);
      if (current.avatar !== candidate.avatar || nameKey(cardName(current)) !== nameKey(candidate.name)) throw new Error('Character changed');
      if (compareVersion(current, candidate) > 0) throw new Error('Character version advanced after the update check');
      let saved = current;
      const repairVersion = candidate.repairVersion && canRepairVersion(current, candidate);
      if (!installed(current, candidate) && !repairVersion) {
        const filename = encodeURIComponent(candidate.file);
        const options = { cache: 'no-store', signal: AbortSignal.timeout(15000) };
        let response = await fetch(bundledUrl(candidate.file, candidate.folder), options);
        if (response.status === 404 && !candidate.folder) response = await fetch(new URL('./' + filename, import.meta.url), options);
        if (!response.ok) throw new Error('Bundled character file unavailable');
        const cardImage = /\.png$/i.test(candidate.file) ? await response.blob() : null;
        const card = cardImage ? pngCard(await cardImage.arrayBuffer()) : await response.json();
        const data = card?.data || card;
        if (nameKey(cardName(card)) !== nameKey(candidate.name) ||
            !['description', 'personality', 'scenario', 'first_mes', 'system_prompt'].some(field => typeof data[field] === 'string' && data[field].trim())) {
          throw new Error('Bundled file does not contain the expected character');
        }
        const picture = candidate.cover ? await (await bundledFile(candidate.cover, candidate.folder)).blob() : cardImage;
        if (generating()) throw new Error('Generation in progress');
        await installLorebook(candidate);
        saved = await saveCard(card, current, candidate, picture);
      } else {
        if (candidate.repairLorebook) await installLorebook(candidate);
        if (repairVersion || candidate.repairEmbedded || candidate.repairRegex || (candidate.repairTags && missingTags(current, candidate).length)) {
          let card = candidate.repairEmbedded
            ? repairEmbeddedBook(current, await (await bundledFile(candidate.file, candidate.folder)).json(), candidate.lorebookControls)
            : current;
          if (candidate.repairRegex && Array.isArray(card.data?.extensions?.regex_scripts)) {
            const extensions = card.data.extensions;
            const regex_scripts = extensions.regex_scripts.filter(script => !obsoleteHsrPhoneRegex(script));
            card = { ...card, data: { ...card.data, extensions: { ...extensions, regex_scripts } } };
          }
          saved = await saveCard(card, current, candidate);
        }
      }
      offers = offers.filter(offer => offerKey(offer) !== offerKey(candidate));
      selectedOffer = null;
      try { await context().getOneCharacter?.(candidate.avatar); } catch (error) { console.warn('[Bot Console] card refresh failed', error); }
      const host = context();
      if (host.characters?.[host.characterId]?.avatar === candidate.avatar) {
        const field = document.querySelector('#character_version_textarea');
        if (field) field.value = visibleVersion(saved) || '';
      }
      if (candidate.requiredTags?.length) {
        try {
          const { importTags, tag_import_setting } = await import('/scripts/tags.js');
          if (tag_import_setting?.ALL !== undefined) {
            await importTags?.({ avatar: candidate.avatar, tags: candidate.requiredTags }, { importSetting: tag_import_setting.ALL });
          }
        } catch (error) { console.warn('[Bot Console] local tag import unavailable', error); }
      }
      let reloadWorld = false;
      if (candidate.lorebook) {
        try {
          const { worldInfoCache, updateWorldInfoList } = await import('/scripts/world-info.js');
          if (!worldInfoCache?.delete) throw new Error('World info cache is unavailable');
          worldInfoCache.delete(candidate.lorebook.slice(0, -5));
          await updateWorldInfoList?.();
        } catch { reloadWorld = true; }
      }
      const pendingTag = missingLibraryTags(context(), candidate.avatar, candidate).length > 0;
      message.textContent = `อัปเดต ${candidate.name} เป็นเวอร์ชัน ${candidate.version} แล้ว${candidate.lorebook ? ' พร้อม Lorebook' : ''}${reloadWorld ? ' กรุณาโหลดหน้าใหม่เพื่อใช้ Lorebook ล่าสุด' : ''}${pendingTag ? ' แท็กอยู่ในการ์ดแล้ว แต่ SillyTavern ยังไม่แสดงในรายการตัวละคร' : ''}`;
      if (Array.isArray(candidate.changes) && candidate.changes.length) {
        const title = document.createElement('h3');
        title.textContent = candidate.name;
        const list = document.createElement('ul');
        for (const change of candidate.changes) {
          const item = document.createElement('li');
          item.textContent = change;
          list.append(item);
        }
        releaseLog.replaceChildren(title, list);
        releaseLog.hidden = false;
      }
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
    if (event.target !== dialog && !document.hidden) void check();
  }, true);
  return {
    get: () => offers,
    check,
    open: avatar => show(offers.find(offer => offer.avatar === avatar)),
  };
}
