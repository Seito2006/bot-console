import { PROFILES, pickProfile, REQUIRED_NAME, hasName } from './profiles.js';
import { computeState, parseBar, esc } from './core.js';
import { avatarCandidates, findChar, detectForm, fileUrl } from './avatars.js';
import {
  keyOf, ensurePhone, threadOf, pushMsg, totalUnread, clock, cleanReply, cleanThought, aliasesFor,
  sceneChecker, chatSig, buildPhonePrompt, buildThoughtPrompt, phoneContextBlock, latestThoughts, thoughtFor, thoughtsPrompt,
  ensureAuto, buildAutoPrompt, parseAuto, stripNoise,
} from './phone.js';
import {
  eventsBlock, applyBar, giftBond, appointPrompt, parseAppts, apptKey, whenState, buildBoardPrompt, parseBoard,
} from './features.js';
import { premium, setLicense, licenseKey, licenseReason, clearLicense } from './edition.js';
import { skinById, SKINS, fontHref, uiPalette } from './skins.js';
import { applyChatUi, watchChat } from './ui-theme.js';
import { API_DEFAULT, PROVIDERS, apiReady, fetchModels, chat as apiChat, buildMessages } from './api.js';
import { DEFAULT_SHOP, rewardAmount, toMoney, fmtMoney, ensureShop, catalog, newItemId, tryBuy, shopContextBlock } from './shop.js';

const EXT_ID = 'bot_console';
const TOP_KEY = 'bc_fab_top';
const CFG_KEY = 'bc_settings';
const POS_KEY = 'bc_fab_pos';
const ICON_URL = new URL('./icon.jpg', import.meta.url).href;
const THEMES_URL = new URL('./themes/', import.meta.url).href;
const SKINS_CSS = new URL('./skins.css', import.meta.url).href;
const TABS = [
  { id: 'player', label: 'ผู้เล่น', icon: 'fa-user' },
  { id: 'rel', label: 'ความสัมพันธ์', icon: 'fa-heart' },
  { id: 'phone', label: 'ข้อความ', icon: 'fa-message' },
  { id: 'shop', label: 'ร้านค้า', icon: 'fa-store' },
  { id: 'mission', label: 'ภารกิจ', icon: 'fa-flag' },
  { id: 'appt', label: 'นัดหมาย', icon: 'fa-calendar-check' },
  { id: 'ui', label: 'UI', icon: 'fa-eye' },
  { id: 'settings', label: 'ตั้งค่า', icon: 'fa-gear' },
];

let tab = 'home';
let open = false;
let editing = null;
let imgMenu = null;
let urlFor = null;
let skillForm = null;
let relForm = null;
let regexBusy = false;
let cur = null;
let timer = null;
let panel = null;
let fab = null;

let lastMd = null;
let epoch = 0;
let phoneName = null;
let phoneDraft = {};
let phoneBusy = {};
let phoneSel = null;
let phoneForm = false;
let phoneStick = false;
let thoughtOpen = null;
let thoughtBusy = null;
let thoughtErr = null;
let missionForm = null;
let apptForm = null;
let giftFor = null;
let boardBusy = false;
let boardErr = null;
let notifyOpen = null;
let notify = null;
let notifyTimer = null;
let notifyName = null;
let notifyCount = 0;
let shopForm = null;
let autoBusy = false;
let autoTimer = null;
const sceneForce = new Map();

const ctx = () => SillyTavern.getContext();
const $ = (sel) => panel?.querySelector(sel);

function hasChat() {
  const c = ctx();
  return !!c.chatMetadata && (c.groupId || c.characterId !== undefined);
}

function getMeta() {
  if (!hasChat()) return null;
  const md = ctx().chatMetadata;
  if (!md[EXT_ID]) md[EXT_ID] = { profileId: null, manual: [], hidden: {} };
  const m = md[EXT_ID];
  if (!m.forms) m.forms = {};
  if (!m.manual) m.manual = [];
  if (!m.hidden) m.hidden = {};
  if (!m.me) m.me = {};
  if (!m.relImg) m.relImg = {};
  if (!m.customRel) m.customRel = {};
  if (!m.formMemo) m.formMemo = {};
  if (!m.thoughts) m.thoughts = {};
  if (m.thoughtsOn === undefined) m.thoughtsOn = true;
  ensurePhone(m);
  ensureAuto(m.phone, (ctx().chat || []).length);
  if (!m.mCustom) m.mCustom = {};
  if (!m.mClaimed) m.mClaimed = {};
  if (!Array.isArray(m.events)) m.events = [];
  if (!Array.isArray(m.appts)) m.appts = [];
  if (!m.apptState || typeof m.apptState !== 'object') m.apptState = {};
  if (!m.board || typeof m.board !== 'object') m.board = {};
  if (!Array.isArray(m.board.offers)) m.board.offers = [];
  if (!Array.isArray(m.board.declined)) m.board.declined = [];
  if (m.appointOn === undefined) m.appointOn = true;
  ensureShop(m);
  return m;
}

function save() {
  const c = ctx();
  try {
    if (c.saveMetadataDebounced) c.saveMetadataDebounced();
    else c.saveMetadata();
  } catch (e) {
    console.warn('[Bot Console] save failed', e);
  }
}

async function saveNow() {
  const c = ctx();
  try {
    if (c.saveMetadata) await c.saveMetadata();
    else if (c.saveMetadataDebounced) c.saveMetadataDebounced();
  } catch (e) {
    console.warn('[Bot Console] save failed', e);
    save();
  }
}

const toast = (kind, msg) => { try { toastr[kind](msg); } catch { } };
const formOpen = () => editing !== null || skillForm !== null || relForm !== null || urlFor !== null || phoneForm || shopForm !== null || missionForm !== null || apptForm !== null || giftFor !== null;

// Why the console is (not) showing in the current chat: 'ok' | 'nochat' | 'name'
function visibilityState() {
  if (!hasChat()) return 'nochat';
  if (REQUIRED_NAME && extSlot().showAll !== true && !hasName(ctx(), REQUIRED_NAME)) return 'name';
  return 'ok';
}

function resolveProfile() {
  if (visibilityState() !== 'ok') return null;
  const c = ctx();
  const saved = c.chatMetadata?.[EXT_ID]?.profileId;
  return PROFILES.find((p) => p.id === saved) || pickProfile(c);
}

function showVisibilityStatus() {
  const el = document.getElementById('bcx-vis');
  if (!el) return;
  const st = visibilityState();
  el.className = `bcx-vis ${st === 'ok' ? 'ok' : 'bad'}`;
  el.textContent = st === 'ok' ? 'ตอนนี้ปุ่มคอนโซลแสดงอยู่ในแชทนี้'
    : st === 'nochat' ? 'ยังไม่ได้เปิดแชท จึงยังไม่แสดงปุ่มคอนโซล'
      : `ปุ่มคอนโซลซ่อนอยู่: แชทนี้ไม่ใช่บอทชื่อ “${REQUIRED_NAME}” (เปิดสวิตช์ด้านบนเพื่อแสดงในทุกแชท)`;
}

function updateVisibility() {
  if (fab) fab.style.display = cur ? '' : 'none';
  if (!cur && open) setOpen(false);
  if (!cur) hideNotify();
  showVisibilityStatus();
}

const seenCache = new Map();
function seenForm(c, avatar) {
  const k = `${c.id}|${avatar || ''}`;
  if (!seenCache.has(k)) seenCache.set(k, detectForm(c, avatar, ctx().chat));
  return seenCache.get(k);
}

function rebuild() {
  seenCache.clear();
  const md = hasChat() ? ctx().chatMetadata : null;
  if (md !== lastMd) {
    lastMd = md;
    epoch++;
    phoneName = null; phoneDraft = {}; phoneBusy = {}; phoneSel = null; phoneForm = false;
    thoughtOpen = null; thoughtBusy = null; thoughtErr = null; sceneForce.clear();
    shopForm = null; missionForm = null; apptForm = null; giftFor = null; clearTimeout(autoTimer); hideNotify();
  }
  const profile = resolveProfile();
  if (!profile) {
    cur = null;
    applyUi();
    applyBlock();
    applyPhoneCtx();
    updateBadges();
    updateVisibility();
    return;
  }
  const meta = getMeta();
  cur = { profile, state: computeState(profile, ctx().chat || [], meta.manual) };
  mergeCustomRel(cur.state, meta);
  mergeCustomMission(cur.state, meta);
  try { rememberForms(); } catch (e) { console.warn('[Bot Console] form memory failed', e); }
  try { pruneEvents(); cur.appts = collectAppts(); checkAppts(); } catch (e) { console.warn('[Bot Console] appointments failed', e); }
  applyUi();
  applyBlock();
  applyPhoneCtx();
  updateBadges();
  updateVisibility();
}

function mergeCustomMission(state, meta) {
  const ms = state.mission || (state.mission = {});
  for (const [id, c] of Object.entries(meta.mCustom || {})) {
    ms[id] = {
      title: c.title, rank: c.rank, objective: c.objective, reward: c.reward, log: c.log, giver: c.giver,
      status: c.status || '', progress: Number(c.max) > 0 ? `${Number(c.cur) || 0}/${Number(c.max)}` : '',
      custom: true,
    };
  }
}

function mergeCustomRel(state, meta) {
  const rel = state.rel || (state.rel = {});
  for (const [name, base] of Object.entries(meta.customRel || {})) {
    const hit = Object.keys(rel).find((k) => k.trim().toLowerCase() === name.trim().toLowerCase());
    if (hit) rel[hit] = { ...base, ...rel[hit], custom: true, ckey: name };
    else rel[name] = { ...base, custom: true, ckey: name };
  }
}

function refresh() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      rebuild();
      if (open && !formOpen()) render();
    } catch (e) {
      console.error('[Bot Console] refresh failed', e);
      if (open && panel) $('#bc-body').innerHTML = empty(`เกิดข้อผิดพลาด<br><code>${esc(e?.message || e)}</code>`);
    }
  }, 120);
}

function applyUi() {
  [...document.body.classList]
    .filter((c) => c.startsWith('bc-hide-'))
    .forEach((c) => document.body.classList.remove(c));

  let style = document.getElementById('bc-ui-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'bc-ui-style';
    document.head.appendChild(style);
  }
  if (!cur) {
    style.textContent = '';
    return;
  }
  const meta = getMeta();
  style.textContent = (cur.profile.uiToggles || [])
    .map((t) => `body.bc-hide-${t.key} ${t.selector}{display:none!important}`)
    .join('\n');
  for (const t of cur.profile.uiToggles || []) {
    if (meta.hidden[t.key]) document.body.classList.add(`bc-hide-${t.key}`);
  }
}

function getPersonaAvatarUrl() {
  const c = ctx();
  const full = (file) => `User Avatars/${encodeURIComponent(file)}`;
  try {
    const file =
      document.querySelector('#user_avatar_block .avatar-container.selected')?.getAttribute('imgfile') ||
      c.userAvatar ||
      c.user_avatar ||
      window.user_avatar;
    if (file && typeof file === 'string') return full(file);
  } catch { }
  try {
    const chat = c.chat || [];
    for (let i = chat.length - 1; i >= 0; i--) {
      if (chat[i]?.is_user && chat[i].force_avatar) return chat[i].force_avatar;
    }
    const img = document.querySelector('#chat .mes[is_user="true"] .avatar img');
    if (img?.getAttribute('src')) return img.getAttribute('src');
  } catch { }
  return '';
}

function formFor(name, r) {
  const c = findChar(name);
  if (!c) return null;
  const meta = getMeta();
  const byFile = (file) => c.forms.find((f) => f.file === file);
  const manual = byFile(meta?.forms?.[c.id]);
  if (manual) return { c, form: manual, source: 'manual' };
  const seen = seenForm(c, r?.avatar);
  if (seen) return { c, form: seen, source: 'auto' };
  const memo = byFile(meta?.formMemo?.[c.id]);
  if (memo) return { c, form: memo, source: 'memo' };
  return { c, form: c.forms[0], source: 'default' };
}

function rememberForms() {
  const meta = getMeta();
  if (!meta || !cur) return;
  let changed = false;
  for (const [name, r] of Object.entries(cur.state.rel || {})) {
    const c = findChar(name);
    if (!c) continue;
    const seen = seenForm(c, r?.avatar);
    if (seen && meta.formMemo[c.id] !== seen.file) { meta.formMemo[c.id] = seen.file; changed = true; }
  }
  if (changed) save();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isTouch = () => !!window.matchMedia?.('(pointer: coarse)').matches;
const lastOf = (a) => (a && a.length ? a[a.length - 1] : undefined);

function userName() {
  return getMeta()?.me?.name || cur?.state?.player?.name || ctx().name1 || 'Player';
}

function relOf(name) {
  const rel = cur?.state?.rel || {};
  const hit = Object.keys(rel).find((k) => keyOf(k) === keyOf(name));
  return hit ? rel[hit] : null;
}

function portraitCands(name, r) {
  const mine = relImgFor(name);
  if (mine) return [mine];
  const fs = formFor(name, r);
  return fs ? [fileUrl(fs.form.file), ...avatarCandidates(name, '')] : avatarCandidates(name, r?.avatar);
}

function avatarCircle(name, r, cls = '') {
  const list = portraitCands(name, r).filter(Boolean);
  const img = list.length
    ? `<img class="bc-rimg" src="${esc(list[0])}" ${list.length > 1 ? `data-c="${esc(JSON.stringify(list))}" ` : ''}data-i="0" alt="">`
    : '';
  return `<span class="bcp-av ${cls}">${esc(firstChar(name).toUpperCase())}${img}</span>`;
}

function storyStamp() {
  const p = cur?.state?.player || {};
  return { sd: String(p.date ?? ''), st: String(p.time ?? '') };
}

function hereStatus(name) {
  const c = ctx();
  const key = keyOf(name);
  if (sceneForce.get(key) === chatSig(c.chat)) return { here: true, via: 'force' };
  if (!cur) return { here: false, via: 'none' };
  if (thoughtOf(name)) return { here: true, via: 'thought' };
  if (!cur.scene) cur.scene = sceneChecker(cur.state.player, c.chat || []);
  return cur.scene(aliasesFor(name, findChar(name)?.mentions));
}

function thoughtOf(name) {
  if (!cur) return '';
  if (cur.bct === undefined) cur.bct = latestThoughts(ctx().chat);
  return cur.bct ? thoughtFor(cur.bct.map, name, findChar(name)?.mentions) : '';
}

function applyThoughtPrompt(off = false) {
  const c = ctx();
  if (typeof c.setExtensionPrompt !== 'function') return;
  const text = cur && !off && getMeta()?.thoughtsOn !== false ? thoughtsPrompt(userName()) : '';
  try {
    const types = c.extension_prompt_types || {};
    const roles = c.extension_prompt_roles || {};
    c.setExtensionPrompt(`${EXT_ID}_thoughts`, text, types.IN_CHAT ?? 1, 0, false, roles.SYSTEM ?? 0);
  } catch (e) {
    console.warn('[Bot Console] thoughts prompt failed', e);
  }
}

function addEvent(text) {
  const m = getMeta();
  m.events.push({ id: newItemId(), text, at: (ctx().chat || []).length });
  if (m.events.length > 8) m.events.splice(0, m.events.length - 8);
}

function pruneEvents() {
  const m = getMeta();
  const chat = ctx().chat || [];
  const keep = m.events.filter((e) => !chat.slice(e.at).some((x) => x && !x.is_user && !x.is_system));
  if (keep.length !== m.events.length) { m.events = keep; save(); }
}

function applyEventsCtx(off = false) {
  const c = ctx();
  if (typeof c.setExtensionPrompt !== 'function') return;
  const text = cur && !off ? eventsBlock(getMeta()?.events, userName()) : '';
  try {
    const types = c.extension_prompt_types || {};
    const roles = c.extension_prompt_roles || {};
    c.setExtensionPrompt(`${EXT_ID}_events`, text, types.IN_CHAT ?? 1, 4, false, roles.SYSTEM ?? 0);
  } catch (e) {
    console.warn('[Bot Console] events prompt failed', e);
  }
}

function applyApptPrompt(off = false) {
  const c = ctx();
  if (typeof c.setExtensionPrompt !== 'function') return;
  const text = cur && !off && getMeta()?.appointOn !== false ? appointPrompt(userName()) : '';
  try {
    const types = c.extension_prompt_types || {};
    const roles = c.extension_prompt_roles || {};
    c.setExtensionPrompt(`${EXT_ID}_appt`, text, types.IN_CHAT ?? 1, 0, false, roles.SYSTEM ?? 0);
  } catch (e) {
    console.warn('[Bot Console] appointment prompt failed', e);
  }
}

function applyShopCtx(off = false) {
  const c = ctx();
  if (typeof c.setExtensionPrompt !== 'function') return;
  let text = '';
  if (cur && !off) {
    const sh = getMeta()?.shop;
    if (sh) {
      const names = {};
      for (const i of catalog(cur.profile, sh)) names[i.id] = i.name;
      text = shopContextBlock({ balance: balanceOf(), currency: shopCfg().currency, inv: sh.inv, names, user: userName() });
    }
  }
  try {
    const types = c.extension_prompt_types || {};
    const roles = c.extension_prompt_roles || {};
    c.setExtensionPrompt(`${EXT_ID}_shop`, text, types.IN_CHAT ?? 1, 3, false, roles.SYSTEM ?? 0);
  } catch (e) {
    console.warn('[Bot Console] shop context failed', e);
  }
}

let memMod = null;
let memReady = false;
let memMissing = false;
let memSig = '';
let memText = '';
const memOn = () => premium() && memReady && extSlot().mem !== false;

async function initMemory() {
  if (!premium() || memReady) return;
  try {
    const c = ctx();
    const et = c.eventTypes || c.event_types || {};
    if (!et.CHAT_COMPLETION_PROMPT_READY || !c.eventSource) return;
    memMod = await import('./memory.js');
    c.eventSource.on(et.CHAT_COMPLETION_PROMPT_READY, (data) => {
      try {
        if (cur && memOn() && data && Array.isArray(data.chat)) memMod.stripPrompt(data.chat);
      } catch (e) {
        console.warn('[Bot Console] memory strip failed', e);
      }
    });
    memReady = true;
    applyPhoneCtx();
  } catch (e) {
    memMissing = /memory\.js|module|import|fetch/i.test(String(e?.message || e));
    console.warn('[Bot Console] memory unavailable', e);
  }
}

function applyMemoryCtx(off = false) {
  const c = ctx();
  if (typeof c.setExtensionPrompt !== 'function') return;
  let text = '';
  if (cur && !off && memOn() && memMod) {
    const chat = c.chat || [];
    const last = String(chat[chat.length - 1]?.mes || '');
    const sig = `${chat.length}|${last.length}|${last.slice(-80)}`;
    if (sig !== memSig) {
      const texts = chat.filter((m) => m && !m.is_user && !m.is_system).map((m) => String(m.mes || ''));
      memText = memMod.memoryBlock(memMod.collectTracker(texts));
      memSig = sig;
    }
    text = memText;
  }
  try {
    const types = c.extension_prompt_types || {};
    const roles = c.extension_prompt_roles || {};
    c.setExtensionPrompt(`${EXT_ID}_memory`, text, types.IN_CHAT ?? 1, 1, false, roles.SYSTEM ?? 0);
  } catch (e) {
    console.warn('[Bot Console] memory prompt failed', e);
  }
}

function applyPhoneCtx(off = false) {
  applyMemoryCtx(off);
  applyThoughtPrompt(off);
  applyShopCtx(off);
  applyEventsCtx(off);
  applyApptPrompt(off);
  const c = ctx();
  if (typeof c.setExtensionPrompt !== 'function') return;
  let text = '';
  if (cur && !off) {
    const ph = getMeta()?.phone;
    if (ph && ph.share !== false) text = phoneContextBlock(ph, userName());
  }
  try {
    const types = c.extension_prompt_types || {};
    const roles = c.extension_prompt_roles || {};
    c.setExtensionPrompt(`${EXT_ID}_phone`, text, types.IN_CHAT ?? 1, 2, false, roles.SYSTEM ?? 0);
  } catch (e) {
    console.warn('[Bot Console] phone context failed', e);
  }
}

async function withoutPhoneCtx(fn) {
  applyPhoneCtx(true);
  try {
    return await fn();
  } finally {
    applyPhoneCtx();
  }
}

const GEN_TIMEOUT = 150000;
let abortGen = null;

async function quiet(prompt) {
  if (apiOn()) return apiQuiet(prompt);
  const c = ctx();
  const fn = c.generateQuietPrompt;
  if (typeof fn !== 'function') throw new Error('SillyTavern เวอร์ชันนี้ไม่มี generateQuietPrompt (ลองอัปเดต ST)');
  const objStyle = /quietPrompt/.test(Function.prototype.toString.call(fn));
  const run = Promise.resolve(objStyle ? fn({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false }) : fn(prompt, false, false));
  run.catch(() => {});
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error('โมเดลใช้เวลานานเกิน 2 นาที จึงหยุดรอ')), GEN_TIMEOUT);
    abortGen = () => rej(Object.assign(new Error('ยกเลิกแล้ว'), { cancelled: true }));
  });
  try {
    return String((await Promise.race([run, guard])) ?? '');
  } catch (e) {
    try { c.stopGeneration?.(); } catch { }
    throw e;
  } finally {
    clearTimeout(timer);
    abortGen = null;
  }
}

function cancelGen() {
  if (abortGen) abortGen();
}

function updateBadges() {
  const n = cur ? totalUnread(getMeta()?.phone) : 0;
  const txt = n > 99 ? '99+' : String(n);
  if (fab) {
    if (n) fab.dataset.unread = txt;
    else delete fab.dataset.unread;
  }
  const b = panel?.querySelector('.bc-badge');
  if (b) {
    b.hidden = !n;
    b.textContent = txt;
  }
}

function thoughtHtml(name) {
  const key = keyOf(name);
  const meta = getMeta();
  const sc = hereStatus(name);
  const n = esc(name);
  const card = (inner, extra = '') => `<div class="bc-thought"><i class="fa-solid fa-brain"></i><div class="bc-tbody">${inner}${extra}</div></div>`;
  if (!sc.here) {
    return `<div class="bc-thought off"><i class="fa-solid fa-eye-slash"></i><div class="bc-tbody"><b>${n} ไม่ได้อยู่ในฉากตอนนี้</b>
      <div class="bc-btns"><button class="bc-btn ghost sm" data-act="thoughtForce" data-name="${n}">ที่จริงเขาอยู่ในฉาก</button></div></div></div>`;
  }
  const stamp = (th) => {
    const when = [th?.sd, th?.st].filter(Boolean).join(' ');
    return when ? `<span class="bc-chip">${esc(when)}</span>` : '';
  };
  const text = (t) => `<div class="bc-ttext">${esc(t).replace(/\n/g, '<br>')}</div>`;
  const bot = thoughtOf(name);
  if (bot) {
    const p = cur.state.player || {};
    return card(`<div class="bc-line"><b>ความคิดในใจ</b>${stamp({ sd: p.date, st: p.time })}</div>${text(bot)}`);
  }
  if (thoughtBusy === key) {
    return card(`<b>กำลังอ่านความคิดของ ${n}…</b>`, '<div class="bc-btns"><button class="bc-btn ghost sm" data-act="genCancel">ยกเลิก</button></div>');
  }
  if (thoughtErr && thoughtErr.key === key) {
    return `<div class="bc-thought off"><i class="fa-solid fa-triangle-exclamation"></i><div class="bc-tbody"><b>อ่านไม่สำเร็จ</b>
      <div class="bc-dim">${esc(thoughtErr.msg)}</div>
      <div class="bc-btns"><button class="bc-btn sm" data-act="thoughtRegen" data-name="${n}">ลองใหม่</button></div></div></div>`;
  }
  const th = meta.thoughts[key];
  if (th) {
    const stale = th.sig !== chatSig(ctx().chat);
    return card(`<div class="bc-line"><b>ความคิดในใจ (ตีความเอง)</b>${stamp(th)}</div>${text(th.text)}`,
      `<div class="bc-btns"><button class="bc-btn ghost sm" data-act="thoughtRegen" data-name="${n}"><i class="fa-solid fa-rotate-right"></i>${stale ? 'อ่านใหม่ตอนนี้' : 'คิดใหม่'}</button></div>`);
  }
  return card(`<b>ข้อความล่าสุดของบอทไม่มีความคิดของ ${n}</b>`,
    `<div class="bc-btns"><button class="bc-btn sm" data-act="thoughtRegen" data-name="${n}">ให้ตีความตอนนี้</button></div>`);
}

function rerenderRel() {
  if (open && tab === 'rel' && !formOpen()) render();
}

function toggleThought(name) {
  thoughtOpen = thoughtOpen === name ? null : name;
  thoughtErr = null;
  render();
}

async function genThought(name) {
  const meta = getMeta();
  const key = keyOf(name);
  if (!meta || !cur || thoughtBusy) return;
  if (mainBusy()) { toast('warning', 'รอให้บอทตอบจบก่อน'); return; }
  const md = ctx().chatMetadata;
  const ep = epoch;
  const user = userName();
  thoughtBusy = key;
  thoughtErr = null;
  rerenderRel();
  try {
    const msgs = threadOf(meta.phone, name)?.msgs || [];
    const prompt = buildThoughtPrompt({ user, char: name, player: cur.state.player, here: true, msgs });
    const raw = await withoutPhoneCtx(() => quiet(prompt));
    const text = cleanThought(raw, { char: name, user, aliases: aliasesFor(name, findChar(name)?.mentions) });
    if (!text) throw new Error('โมเดลส่งข้อความว่างกลับมา');
    if (ctx().chatMetadata !== md || ep !== epoch) return;
    meta.thoughts[key] = { sig: chatSig(ctx().chat), text, ...storyStamp() };
    saveNow();
  } catch (e) {
    console.warn('[Bot Console] thought failed', e);
    if (ep === epoch && !e?.cancelled) thoughtErr = { key, msg: String(e?.message || e) };
  } finally {
    if (ep === epoch) {
      thoughtBusy = null;
      rerenderRel();
    }
  }
}

const phoneVisible = (key) => open && tab === 'phone' && !!phoneName && keyOf(phoneName) === key;

function sizeTa(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 110)}px`;
}

function phoneRefresh() {
  if (!open || tab !== 'phone' || !panel) return;
  if (phoneName) updateThread();
  else if (!formOpen()) render();
}

function updateThread(toBottom = true) {
  if (!open || tab !== 'phone' || !phoneName || !panel) return;
  const box = $('.bcp-msgs');
  if (!box) { render(); return; }
  const key = keyOf(phoneName);
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  box.innerHTML = msgsHtml(threadOf(getMeta().phone, phoneName), key);
  if (toBottom || near) box.scrollTop = box.scrollHeight;
  const send = $('.bcp-send');
  if (send) {
    send.classList.toggle('busy', !!phoneBusy[key]);
    send.disabled = !!phoneBusy[key];
  }
}

async function deliver(meta, th, name, parts, md, ep) {
  const key = keyOf(name);
  for (let i = 0; i < parts.length; i++) {
    if (ctx().chatMetadata !== md || ep !== epoch) return false;
    if (i) await sleep(Math.min(1600, 450 + parts[i].length * 20));
    if (ctx().chatMetadata !== md || ep !== epoch) return false;
    pushMsg(meta.phone, name, { from: 'them', text: parts[i], ...storyStamp(), at: (ctx().chat || []).length });
    th.unread = phoneVisible(key) ? 0 : (th.unread || 0) + 1;
    save();
    updateBadges();
    phoneRefresh();
  }
  return true;
}

async function requestReply(name, mode, note = '') {
  const meta = getMeta();
  const key = keyOf(name);
  if (!meta || !cur || phoneBusy[key]) return;
  if (mainBusy()) { toast('warning', 'รอให้บอทตอบจบก่อน'); return; }
  const md = ctx().chatMetadata;
  const ep = epoch;
  const user = userName();
  const th = threadOf(meta.phone, name, true);
  const char = th.name || name;
  phoneBusy[key] = true;
  phoneRefresh();
  try {
    const prompt = buildPhonePrompt({ user, char, player: cur.state.player, here: hereStatus(name).here, msgs: th.msgs, mode, note });
    const raw = await withoutPhoneCtx(() => quiet(prompt));
    const parts = cleanReply(raw, { char, user, aliases: aliasesFor(name, findChar(name)?.mentions) });
    if (!parts.length) throw new Error('โมเดลส่งข้อความว่างกลับมา');
    const done = await deliver(meta, th, name, parts, md, ep);
    if (done && mode === 'gift' && !phoneVisible(key)) {
      try { toastr.info(parts[parts.length - 1].replace(/\s+/g, ' ').slice(0, 90), `${char} ตอบเรื่องของขวัญ`, { timeOut: 9000 }); } catch { }
    }
  } catch (e) {
    console.warn('[Bot Console] phone reply failed', e);
    if (ep === epoch && !e?.cancelled) toast('error', `ตัวละครยังไม่ตอบ: ${e?.message || e}`);
  } finally {
    if (ep === epoch) {
      phoneBusy[key] = false;
      applyPhoneCtx();
      saveNow();
      phoneRefresh();
    }
  }
}

async function phoneSend() {
  const meta = getMeta();
  if (!meta || !phoneName) return;
  const key = keyOf(phoneName);
  if (phoneBusy[key]) return;
  const ta = $('.bcp-ta');
  const text = (ta ? ta.value : phoneDraft[key] || '').trim();
  const th = threadOf(meta.phone, phoneName, true);
  const lastMine = lastOf(th.msgs)?.from === 'me';
  if (!text && !lastMine) return;
  if (text) {
    pushMsg(meta.phone, phoneName, { from: 'me', text, ...storyStamp(), at: (ctx().chat || []).length });
    phoneDraft[key] = '';
    if (ta) { ta.value = ''; sizeTa(ta); }
    save();
    applyPhoneCtx();
    updateThread();
  }
  await requestReply(phoneName, 'reply');
}

function phoneRegen() {
  const meta = getMeta();
  if (!meta || !phoneName || phoneBusy[keyOf(phoneName)]) return;
  const th = threadOf(meta.phone, phoneName);
  if (!th || !th.msgs.length) return;
  while (th.msgs.length && lastOf(th.msgs).from === 'them') th.msgs.pop();
  save();
  applyPhoneCtx();
  updateThread();
  requestReply(phoneName, th.msgs.length ? 'reply' : 'initiate');
}

function mountNotify() {
  notify = document.createElement('div');
  notify.id = 'bc-notify';
  notify.dataset.theme = cfg.theme;
  notify.hidden = true;
  document.body.appendChild(notify);
  notify.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { hideNotify(); return; }
    const n = notifyName;
    const fn = notifyOpen;
    hideNotify();
    if (fn) fn();
    else if (n) openThread(n);
  });
  notify.addEventListener('error', (e) => {
    const img = e.target;
    if (!img?.classList?.contains('bc-rimg')) return;
    let list = [];
    try { list = JSON.parse(img.dataset.c || '[]'); } catch { }
    const next = Number(img.dataset.i || 0) + 1;
    if (next < list.length) { img.dataset.i = String(next); img.src = list[next]; }
    else img.remove();
  }, true);
}

function hideNotify() {
  clearTimeout(notifyTimer);
  notifyName = null;
  notifyOpen = null;
  notifyCount = 0;
  if (notify) notify.hidden = true;
}

function placeNotify() {
  if (!notify || !fab) return;
  const r = fab.getBoundingClientRect();
  const W = window.innerWidth;
  const H = window.innerHeight;
  const right = r.left + r.width / 2 > W / 2;
  const room = right ? r.left - 12 : W - r.right - 12;
  notify.style.top = `${Math.round(clampN(r.top + r.height / 2 - 31, 8, H - 80))}px`;
  notify.style.maxWidth = `${Math.round(Math.min(310, Math.max(180, room)))}px`;
  if (right) { notify.style.right = `${Math.round(W - r.left + 8)}px`; notify.style.left = 'auto'; }
  else { notify.style.left = `${Math.round(r.right + 8)}px`; notify.style.right = 'auto'; }
  notify.classList.toggle('right', right);
}

function showNotify(name, text, count = 1, opts = {}) {
  if (!notify || !fab || !cur) return;
  const same = notifyName && keyOf(notifyName) === keyOf(name);
  notifyCount = same ? notifyCount + count : count;
  notifyName = name;
  notifyOpen = opts.open || null;
  const msg = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  notify.innerHTML = `${opts.icon ? `<span class="bcp-av"><i class="fa-solid ${esc(opts.icon)}"></i></span>` : avatarCircle(name, relOf(name), 'here')}<div class="bcn-body"><b>${esc(opts.label || name)}</b><span>${esc(msg)}</span></div>${notifyCount > 1 ? `<em class="bcn-n">${notifyCount > 9 ? '9+' : notifyCount}</em>` : ''}<button class="bcn-x" data-x aria-label="ปิด"><i class="fa-solid fa-xmark"></i></button>`;
  placeNotify();
  notify.hidden = false;
  notify.classList.remove('pop');
  void notify.offsetWidth;
  notify.classList.add('pop');
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(hideNotify, 9000);
}

function autoCands() {
  const meta = getMeta();
  const chat = ctx().chat || [];
  const map = new Map();
  for (const [n, r] of Object.entries(cur.state.rel || {})) map.set(keyOf(n), { name: n, r });
  for (const [k, th] of Object.entries(meta.phone.threads)) if (!map.has(k) && th.msgs.length) map.set(k, { name: th.name, r: null });
  return [...map.values()].map(({ name, r }) => {
    const th = threadOf(meta.phone, name);
    const last = lastOf(th?.msgs);
    return {
      name,
      type: [r?.type, r?.stage].map((x) => String(x ?? '').trim()).filter(Boolean).join(' / '),
      bond: Number(r?.bond) || 0,
      max: Number(r?.max) || Number(cur.profile.bondMax) || 100,
      here: hereStatus(name).here,
      last: last ? { from: last.from, text: last.text, when: [last.sd, last.st].filter(Boolean).join(' ') } : null,
      waiting: last?.from === 'them',
      gap: last ? Math.max(0, chat.length - (last.at || 0)) : null,
    };
  });
}

const sameName = (cand, said) => {
  if (keyOf(cand) === keyOf(said)) return true;
  const a = aliasesFor(cand, findChar(cand)?.mentions);
  return aliasesFor(said).some((x) => a.includes(x));
};

function openTab(id) {
  hideNotify();
  if (!open) setOpen(true);
  tab = id;
  editing = null; missionForm = null; apptForm = null; giftFor = null; shopForm = null;
  render();
}

function openThread(name) {
  hideNotify();
  if (!open) setOpen(true);
  tab = 'phone';
  phoneName = name;
  phoneSel = null;
  phoneStick = true;
  const th = threadOf(getMeta().phone, name);
  if (th && th.unread) { th.unread = 0; save(); }
  updateBadges();
  render();
}

async function autoText(manual = false) {
  const meta = getMeta();
  if (!meta || !cur || autoBusy) return;
  if (mainBusy() || Object.values(phoneBusy).some(Boolean)) { if (manual) toast('warning', 'รอให้บอทตอบจบก่อน'); return; }
  const cands = autoCands();
  if (!cands.length) { if (manual) toast('info', 'ยังไม่มีตัวละครในรายชื่อ ให้บอทส่งแท็ก HI_Char หรือเพิ่มเอง'); return; }
  const md = ctx().chatMetadata;
  const ep = epoch;
  const user = userName();
  autoBusy = true;
  syncAutoUi();
  try {
    const prompt = buildAutoPrompt({ user, player: cur.state.player, cands });
    const raw = await withoutPhoneCtx(() => quiet(prompt));
    if (ctx().chatMetadata !== md || ep !== epoch) return;
    const d = parseAuto(raw);
    if (!d) { if (manual) toast('warning', 'โมเดลตอบกลับมาในรูปแบบที่อ่านไม่ได้ ลองอีกครั้ง'); return; }
    if (!d.send) { if (manual) toast('info', 'ตอนนี้ยังไม่มีใครอยากส่งข้อความมา'); return; }
    const hit = cands.find((c) => sameName(c.name, d.from));
    if (!hit) { if (manual) toast('warning', `โมเดลเลือกชื่อที่ไม่อยู่ในรายชื่อ: ${d.from}`); return; }
    const aliases = aliasesFor(hit.name, findChar(hit.name)?.mentions);
    const parts = cleanReply(d.messages.join('\n---\n'), { char: hit.name, user, aliases });
    if (!parts.length) return;
    const th = threadOf(meta.phone, hit.name, true);
    const ok = await deliver(meta, th, hit.name, parts, md, ep);
    if (!ok) return;
    const key = keyOf(hit.name);
    if (!open) {
      showNotify(hit.name, parts[parts.length - 1], parts.length);
    } else if (!phoneVisible(key)) {
      try {
        toastr.info(parts[0].replace(/\s+/g, ' ').slice(0, 90), `${hit.name} ส่งข้อความมา`, {
          timeOut: 9000, closeButton: true, onclick: () => { try { openThread(hit.name); } catch (e) { console.warn(e); } },
        });
      } catch { }
    }
  } catch (e) {
    console.warn('[Bot Console] auto text failed', e);
    if (ep === epoch && !e?.cancelled && manual) toast('error', `ตัดสินใจไม่สำเร็จ: ${e?.message || e}`);
  } finally {
    autoBusy = false;
    if (ep === epoch) { applyPhoneCtx(); saveNow(); syncAutoUi(); }
  }
}

function maybeAuto() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    try {
      if (!cur || autoBusy) return;
      const meta = getMeta();
      const a = ensureAuto(meta.phone, (ctx().chat || []).length);
      const chat = ctx().chat || [];
      if (a.lastLen > chat.length) { a.lastLen = chat.length; save(); return; }
      if (!a.on || isGenerating()) return;
      const last = chat[chat.length - 1];
      if (!last || last.is_user || last.is_system) return;
      const fresh = chat.slice(a.lastLen).filter((m) => m && !m.is_user && !m.is_system).length;
      if (fresh < a.every) return;
      a.lastLen = chat.length;
      save();
      autoText(false);
    } catch (e) {
      console.warn('[Bot Console] auto check failed', e);
    }
  }, 1500);
}

function syncAutoUi() {
  const b = panel?.querySelector('[data-act="autoNow"]');
  if (!b) return;
  b.disabled = autoBusy;
  b.querySelector('span').textContent = autoBusy ? 'กำลังคิด…' : 'ลองให้ตัดสินใจตอนนี้';
}

const shopCfg = () => cur?.profile?.shop || DEFAULT_SHOP;

function balanceOf() {
  const v = toMoney(cur?.state?.player?.money);
  return v === null ? toMoney(shopCfg().start) ?? 0 : v;
}

function setPlayer(meta, key, val) {
  meta.manual = meta.manual.filter((m) => !(m?.patch?.player && Object.keys(m.patch.player).length === 1 && key in m.patch.player));
  meta.manual.push({ at: ctx().chat.length, patch: { player: { [key]: String(val) } } });
}
const setMoney = (meta, n) => setPlayer(meta, 'money', n);

function setBond(meta, relKey, r, value) {
  if (r?.custom && meta.customRel?.[r.ckey]) { meta.customRel[r.ckey].bond = value; return; }
  meta.manual = meta.manual.filter((m) => {
    const x = m?.patch?.rel;
    return !(x && Object.keys(x).length === 1 && x[relKey] && Object.keys(x[relKey]).length === 1 && 'bond' in x[relKey]);
  });
  meta.manual.push({ at: ctx().chat.length, patch: { rel: { [relKey]: { bond: String(value) } } } });
}

function buyItem(id) {
  const meta = getMeta();
  if (!meta || !cur) return;
  const item = catalog(cur.profile, meta.shop).find((i) => i.id === id);
  if (!item) return;
  const r = tryBuy(balanceOf(), Number(item.price) || 0, 1);
  const cu = shopCfg().currency?.name || 'Coin';
  if (!r.ok) {
    toast('warning', r.reason === 'poor' ? `เงินไม่พอ ขาดอีก ${fmtMoney(r.need)} ${cu}` : 'ซื้อไม่ได้');
    return;
  }
  setMoney(meta, r.balance);
  meta.shop.inv[id] = (meta.shop.inv[id] || 0) + 1;
  meta.shop.log.push({ id, name: item.name, qty: 1, cost: r.cost, ...storyStamp(), ts: Date.now() });
  if (meta.shop.log.length > 40) meta.shop.log.splice(0, meta.shop.log.length - 40);
  rebuild();
  render();
  saveNow();
  toast('success', `ซื้อ ${item.name} แล้ว (-${fmtMoney(r.cost)} ${cu})`);
}

function itemById(id) {
  const meta = getMeta();
  return catalog(cur.profile, meta.shop).find((i) => i.id === id) || { id, name: meta.shop.log.find((l) => l.id === id)?.name || id, price: 0 };
}

function useItem(id) {
  const meta = getMeta();
  if (!meta || !cur || !(meta.shop.inv[id] > 0)) return;
  const item = itemById(id);
  const p = cur.state.player || {};
  const fx = [];
  for (const [key, label] of [['hp', 'HP'], ['corr', 'Corruption']]) {
    if (!item[key]) continue;
    const next = applyBar(p[key], item[key]);
    if (next) { setPlayer(meta, key, next); fx.push(`${label} ${item[key] > 0 ? '+' : ''}${item[key]}`); }
  }
  meta.shop.inv[id] -= 1;
  addEvent(`${userName()} used "${item.name}"${fx.length ? ` (${fx.join(', ')})` : ''}.`);
  rebuild();
  render();
  saveNow();
  toast('success', `ใช้ ${item.name} แล้ว${fx.length ? ` (${fx.join(', ')})` : ''}`);
}

function giveItem(id, who) {
  const meta = getMeta();
  if (!meta || !cur || !(meta.shop.inv[id] > 0) || !who) return;
  const item = itemById(id);
  const relKey = Object.keys(cur.state.rel || {}).find((k) => keyOf(k) === keyOf(who));
  if (!relKey) return;
  const r = cur.state.rel[relKey];
  const max = Number(r?.max) || Number(cur.profile.bondMax) || 100;
  const bond = Number(r?.bond) || 0;
  const next = Math.min(max, bond + giftBond(item));
  meta.shop.inv[id] -= 1;
  setBond(meta, relKey, r, next);
  const here = hereStatus(relKey).here;
  if (here) addEvent(`${userName()} gave "${item.name}" to ${relKey} (their bond with ${userName()} rose by ${next - bond}).`);
  giftFor = null;
  rebuild();
  render();
  saveNow();
  toast('success', `มอบ ${item.name} ให้ ${relKey} แล้ว (Bond +${next - bond})`);
  if (!here) requestReply(relKey, 'gift', item.name);
}

function viewShop() {
  const meta = getMeta();
  const sh = meta.shop;
  const conf = shopCfg();
  const cu = conf.currency?.name || 'Coin';
  const bal = balanceOf();
  const items = catalog(cur.profile, sh);
  const inv = sh.inv || {};

  const balBox =
    editing === 'money'
      ? `<div class="bc-wallet editing" data-form><span class="bc-k">ยอดเงิน</span>
          <input class="bc-input" type="number" inputmode="decimal" value="${esc(Math.round(bal))}">
          <button class="bc-ico" data-primary data-act="save" title="บันทึก"><i class="fa-solid fa-check"></i></button>
          <button class="bc-ico" data-act="cancel" title="ยกเลิก"><i class="fa-solid fa-xmark"></i></button></div>`
      : `<div class="bc-wallet"><span class="bc-hexi"><i class="fa-solid ${esc(conf.currency?.icon || 'fa-coins')}"></i></span>
          <div class="bc-wbody"><span class="bc-dim">ยอดเงินที่มี</span><b class="bc-num">${fmtMoney(bal)}<small>${esc(cu)}</small></b></div>
          <button class="bc-ico" data-act="edit" data-key="money" title="แก้ยอดเงิน"><i class="fa-solid fa-pen"></i></button></div>`;

  const form = (it) => `<div class="bc-card" data-form>
      <input class="bc-input" data-f="name" placeholder="ชื่อสินค้า" value="${esc(it?.name || '')}">
      <input class="bc-input" data-f="price" type="number" inputmode="numeric" min="0" placeholder="ราคา (${esc(cu)})" value="${it ? esc(it.price) : ''}">
      <input class="bc-input" data-f="desc" placeholder="รายละเอียด (ไม่ใส่ก็ได้)" value="${esc(it?.desc || '')}">
      <div class="bc-btns"><button class="bc-btn" data-primary data-act="saveItem" data-id="${it ? esc(it.id) : ''}">${it ? 'บันทึก' : 'เพิ่มสินค้า'}</button>
      <button class="bc-btn ghost" data-act="cancelForm">ยกเลิก</button></div></div>`;

  const row = (i) => {
    const n = inv[i.id] || 0;
    const can = bal >= (Number(i.price) || 0);
    const tools = i.own
      ? `<button class="bc-ico" data-act="itemEdit" data-id="${esc(i.id)}" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
         <button class="bc-ico" data-act="itemDel" data-id="${esc(i.id)}" title="ลบ"><i class="fa-solid fa-trash"></i></button>`
      : '';
    return `<div class="bc-skill bc-item"><span class="bc-hexi"><i class="fa-solid fa-box-open"></i></span>
      <div class="bc-sbody"><div class="bc-line"><b>${esc(i.name)}</b>${n ? `<span class="bc-chip here">มี ×${n}</span>` : ''}</div>
        ${i.desc ? `<div class="bc-dim">${esc(i.desc)}</div>` : ''}</div>${tools}
      <button class="bc-btn sm bc-buy${can ? '' : ' poor'}" data-act="buy" data-id="${esc(i.id)}" ${can ? '' : 'disabled'}>
        <i class="fa-solid ${esc(conf.currency?.icon || 'fa-coins')}"></i>${fmtMoney(Number(i.price) || 0)}</button></div>`;
  };

  const cats = [...new Set(items.map((i) => i.cat || 'อื่นๆ'))];
  const shelves = cats
    .map((c) => `<div class="bc-cat">${esc(c)}</div>${items.filter((i) => (i.cat || 'อื่นๆ') === c).map((i) => (shopForm === i.id ? form(i) : row(i))).join('')}`)
    .join('');

  const ownedIds = Object.keys(inv).filter((id) => inv[id] > 0);
  const nameOf = (id) => items.find((i) => i.id === id)?.name || sh.log.find((l) => l.id === id)?.name || id;
  const relNames = Object.keys(cur.state.rel || {});
  const bagRow = (id) => {
    const it = items.find((i) => i.id === id);
    const fx = [it?.hp ? `HP ${it.hp > 0 ? '+' : ''}${it.hp}` : '', it?.corr ? `Corruption ${it.corr > 0 ? '+' : ''}${it.corr}` : '']
      .filter(Boolean)
      .map((x) => `<span class="bc-chip">${x}</span>`)
      .join('');
    const gain = giftBond(it);
    const picker =
      giftFor === id
        ? `<div class="bc-gift" data-form><select class="bc-input bc-sel" data-f="who">${relNames.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>
            <button class="bc-btn sm" data-primary data-act="giftSend" data-id="${esc(id)}">มอบให้ (+${gain} Bond)</button>
            <button class="bc-btn sm ghost" data-act="cancelForm">ยกเลิก</button></div>`
        : '';
    return `<div class="bc-card bc-bagrow"><div class="bc-line"><b>${esc(nameOf(id))}</b><span class="bc-chip here">มี ×${inv[id]}</span></div>
      ${fx ? `<div class="bc-tags">${fx}</div>` : ''}
      <div class="bc-btns"><button class="bc-btn sm" data-act="useItem" data-id="${esc(id)}"><i class="fa-solid fa-hand-holding-medical"></i>ใช้</button>
      <button class="bc-btn sm ghost" data-act="giftOpen" data-id="${esc(id)}"><i class="fa-solid fa-gift"></i>มอบให้</button></div>${picker}</div>`;
  };
  const bag = ownedIds.length ? ownedIds.map(bagRow).join('') : empty('ยังไม่มีของ<br>ซื้อของจากร้านด้านบนได้เลย');
  const recent = sh.log.slice(-5).reverse();
  const history = recent.length
    ? `<div class="bc-sec"><span>ซื้อล่าสุด</span><i class="bc-fill"></i></div>${recent
        .map((l) => `<div class="bc-row"><div class="bc-v">${esc(l.name)}${l.qty > 1 ? ` ×${l.qty}` : ''}<div class="bc-dim">${esc([l.sd, l.st].filter(Boolean).join(' '))}</div></div><b class="bc-down">-${fmtMoney(l.cost)}</b></div>`)
        .join('')}`
    : '';

  return `${balBox}
    <div class="bc-sec"><span>สินค้า</span><em class="bc-count">${items.length}</em><i class="bc-fill"></i>
      <button class="bc-btn sm" data-act="itemNew"><i class="fa-solid fa-plus"></i>เพิ่ม</button></div>
    ${shopForm === '@new' ? form(null) : ''}${shelves}
    <div class="bc-sec"><span>ของที่มี</span><em class="bc-count">${ownedIds.length}</em><i class="bc-fill"></i></div>${bag}${history}`;
}

function apiCfg() {
  const all = ctx().extensionSettings;
  const slot = all[EXT_ID] || (all[EXT_ID] = {});
  if (!slot.api || typeof slot.api !== 'object') slot.api = {};
  const a = slot.api;
  if (!a.p || typeof a.p !== 'object') {
    a.p = { custom: { url: a.url || '', key: a.key || '', model: a.model || '', models: Array.isArray(a.models) ? a.models : [] } };
    delete a.url; delete a.key; delete a.model; delete a.models;
  }
  for (const [k, v] of Object.entries(API_DEFAULT)) {
    if (k === 'p') {
      for (const [pk, pv] of Object.entries(v)) {
        const cur = a.p[pk] || (a.p[pk] = {});
        for (const [f, fv] of Object.entries(pv)) if (cur[f] === undefined) cur[f] = Array.isArray(fv) ? [...fv] : fv;
      }
    } else if (a[k] === undefined) a[k] = v;
  }
  if (!PROVIDERS[a.provider]) a.provider = 'custom';
  return a;
}
const apiP = () => { const a = apiCfg(); return a.p[a.provider]; };
function apiNow() {
  const a = apiCfg();
  const p = apiP();
  return { provider: a.provider, url: p.url || '', key: p.key || '', model: p.model || '', temp: a.temp, maxTokens: a.maxTokens };
}
const apiOn = () => apiCfg().on && apiReady(apiNow());
const mainBusy = () => (apiOn() ? false : isGenerating());
const saveApi = () => { try { ctx().saveSettingsDebounced?.(); } catch { } };

function apiContext() {
  const c = ctx();
  const ch = c.characters?.[c.characterId];
  const d = ch?.data || ch || {};
  const card = [ch?.name && `Name: ${ch.name}`, d.description && `Description:\n${d.description}`, d.personality && `Personality: ${d.personality}`, d.scenario && `Scenario: ${d.scenario}`]
    .filter(Boolean)
    .join('\n');
  const persona = String(c.powerUserSettings?.persona_description || '');
  const p = cur?.state?.player || {};
  const rels = Object.entries(cur?.state?.rel || {}).map(([n, r]) => `${n} (${[r?.type, r?.stage].filter(Boolean).join(' / ') || 'relationship unknown'}, bond ${Number(r?.bond) || 0})`);
  const summary = [
    [p.date, p.time].filter(Boolean).join(' ') && `Story date/time: ${[p.date, p.time].filter(Boolean).join(' ')}`,
    p.location && `Location: ${p.location}`,
    p.weather && `Weather: ${p.weather}`,
    p.party && `Party: ${p.party}`,
    p.scene && `Scene: ${p.scene}`,
    rels.length && `Characters: ${rels.join('; ')}`,
  ].filter(Boolean).join('\n');
  const n = Math.max(0, Math.min(80, Number(apiCfg().history) || 20));
  const history = (c.chat || [])
    .filter((m) => m && !m.is_system)
    .slice(-n)
    .map((m) => ({ who: m.is_user ? userName() : m.name || ch?.name || 'Narrator', text: stripNoise(m.mes).replace(/\n{3,}/g, '\n\n').trim() }))
    .filter((m) => m.text)
    .map((m) => `${m.who}: ${m.text.length > 1800 ? `${m.text.slice(0, 1800)}…` : m.text}`);
  return { card, persona, user: userName(), summary, history };
}

async function apiQuiet(prompt) {
  const a = apiNow();
  const ac = new AbortController();
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => { ac.abort(); rej(new Error('โมเดลใช้เวลานานเกิน 2 นาที จึงหยุดรอ')); }, GEN_TIMEOUT);
    abortGen = () => { ac.abort(); rej(Object.assign(new Error('ยกเลิกแล้ว'), { cancelled: true })); };
  });
  const run = apiChat(a, buildMessages({ prompt, ...apiContext() }), ac.signal);
  run.catch(() => {});
  try {
    return await Promise.race([run, guard]);
  } finally {
    clearTimeout(timer);
    abortGen = null;
  }
}

function mountApiDrawer(tries = 0) {
  if (document.getElementById('bc-api-drawer')) return;
  const host = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
  if (!host) {
    if (tries < 40) setTimeout(() => mountApiDrawer(tries + 1), 1000);
    return;
  }
  const a = apiCfg();
  const wrap = document.createElement('div');
  wrap.id = 'bc-api-drawer';
  wrap.dataset.theme = cfg.theme;
  wrap.innerHTML = `<div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header"><b>Seito's bot Console</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
    <div class="inline-drawer-content">
      <label class="checkbox_label"><input type="checkbox" id="bcx-all"><span>แสดงปุ่มคอนโซลในทุกแชท (ไม่จำกัดเฉพาะบอทชื่อ ${REQUIRED_NAME})</span></label>
      <div id="bcx-vis" class="bcx-vis"></div>
      <label class="checkbox_label"><input type="checkbox" id="bcx-on"><span>ใช้ API แยกสำหรับส่วนเสริมนี้ (ข้อความอัตโนมัติ ความคิดในใจ กระดานภารกิจ แชทข้อความ)</span></label>
      <div class="bcx-grid">
        <label class="bcx-l">ผู้ให้บริการ<select class="text_pole" id="bcx-prov">${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
        <label class="bcx-l" id="bcx-urlrow">Base URL<input class="text_pole" id="bcx-url" placeholder="https://api.openai.com/v1" autocomplete="off"></label>
        <label class="bcx-l">API Key
          <span class="bcx-row"><input class="text_pole" id="bcx-key" type="password" autocomplete="off">
          <button class="menu_button bcx-ico" id="bcx-eye" title="แสดง/ซ่อนคีย์"><i class="fa-solid fa-eye"></i></button></span></label>
        <label class="bcx-l">โมเดล
          <span class="bcx-row"><input class="text_pole" id="bcx-model" autocomplete="off">
          <button class="menu_button" id="bcx-fetch"><i class="fa-solid fa-rotate"></i>ดึงรายชื่อ</button></span></label>
        <label class="bcx-l">รายชื่อโมเดล
          <input class="text_pole" id="bcx-find" placeholder="พิมพ์เพื่อค้นหาในรายชื่อ" autocomplete="off">
          <select class="text_pole" id="bcx-models"></select></label>
        <div class="bcx-row bcx-nums">
          <label class="bcx-l">Temperature<input class="text_pole" id="bcx-temp" type="number" step="0.1" min="0" max="2"></label>
          <label class="bcx-l">Max tokens<input class="text_pole" id="bcx-max" type="number" step="128" min="64"></label>
          <label class="bcx-l">ข้อความย้อนหลัง<input class="text_pole" id="bcx-hist" type="number" step="1" min="0" max="80"></label>
        </div>
        <div class="bcx-row"><button class="menu_button" id="bcx-test"><i class="fa-solid fa-plug"></i>ทดสอบการเชื่อมต่อ</button><span id="bcx-status"></span></div>
        <div class="bcx-note">คีย์เก็บในการตั้งค่าของ SillyTavern (ไม่ถูกบันทึกลงแชท) แยกตามผู้ให้บริการ · ปิดสวิตช์ด้านบนเมื่อไหร่ ส่วนเสริมจะกลับไปใช้การเชื่อมต่อหลักของ SillyTavern</div>
      </div>
    </div></div>`;
  host.appendChild(wrap);
  showVisibilityStatus();

  const $d = (id) => wrap.querySelector(`#${id}`);
  const status = (msg, kind = '') => {
    const el = $d('bcx-status');
    el.textContent = msg;
    el.className = kind;
  };
  const fillModels = () => {
    const sel = $d('bcx-models');
    const p = apiP();
    const q = $d('bcx-find').value.trim().toLowerCase();
    const list = p.models.filter((m) => !q || m.toLowerCase().includes(q));
    sel.innerHTML = p.models.length
      ? `<option value="">— เลือกโมเดล (${list.length}/${p.models.length}) —</option>${list.map((m) => `<option value="${esc(m)}"${m === p.model ? ' selected' : ''}>${esc(m)}</option>`).join('')}`
      : '<option value="">ยังไม่มีรายชื่อ กด “ดึงรายชื่อ”</option>';
  };
  const sync = () => {
    const p = apiP();
    const info = PROVIDERS[a.provider];
    $d('bcx-on').checked = !!a.on;
    $d('bcx-all').checked = extSlot().showAll === true;
    $d('bcx-prov').value = a.provider;
    $d('bcx-urlrow').style.display = a.provider === 'custom' ? '' : 'none';
    $d('bcx-url').value = p.url || '';
    $d('bcx-key').value = p.key || '';
    $d('bcx-key').placeholder = info.keyHint;
    $d('bcx-model').value = p.model || '';
    $d('bcx-model').placeholder = info.modelHint;
    $d('bcx-temp').value = a.temp;
    $d('bcx-max').value = a.maxTokens;
    $d('bcx-hist').value = a.history;
    $d('bcx-find').value = '';
    fillModels();
    status('');
  };
  sync();

  const setters = {
    'bcx-on': (el) => { a.on = el.checked; },
    'bcx-all': (el) => { extSlot().showAll = el.checked; refresh(); },
    'bcx-url': (el) => { apiP().url = el.value.trim(); },
    'bcx-key': (el) => { apiP().key = el.value.trim(); },
    'bcx-model': (el) => { apiP().model = el.value.trim(); },
    'bcx-temp': (el) => { a.temp = el.value === '' ? '' : Number(el.value); },
    'bcx-max': (el) => { a.maxTokens = el.value === '' ? '' : Number(el.value); },
    'bcx-hist': (el) => { a.history = el.value === '' ? 20 : Number(el.value); },
  };
  wrap.addEventListener('input', (e) => {
    if (e.target.id === 'bcx-find') { fillModels(); return; }
    const f = setters[e.target.id];
    if (!f) return;
    f(e.target);
    saveApi();
  });
  wrap.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'bcx-prov') { a.provider = PROVIDERS[e.target.value] ? e.target.value : 'custom'; saveApi(); sync(); return; }
    if (id === 'bcx-models') {
      if (!e.target.value) return;
      apiP().model = e.target.value;
      $d('bcx-model').value = apiP().model;
      saveApi();
      return;
    }
    setters[id]?.(e.target);
    saveApi();
  });
  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'bcx-eye') {
      const k = $d('bcx-key');
      k.type = k.type === 'password' ? 'text' : 'password';
    } else if (b.id === 'bcx-fetch') {
      b.disabled = true;
      status('กำลังดึงรายชื่อโมเดล…');
      try {
        const p = apiP();
        p.models = await fetchModels(apiNow());
        if (!p.model && p.models.length) { p.model = p.models[0]; $d('bcx-model').value = p.model; }
        saveApi();
        fillModels();
        status(`ได้ ${p.models.length} โมเดล`, 'ok');
      } catch (err) {
        status(String(err?.message || err), 'bad');
      } finally {
        b.disabled = false;
      }
    } else if (b.id === 'bcx-test') {
      const n = apiNow();
      if (!apiReady(n)) { status(a.provider === 'custom' ? 'ใส่ Base URL และชื่อโมเดลก่อน' : 'ใส่ API Key และชื่อโมเดลก่อน', 'bad'); return; }
      b.disabled = true;
      status('กำลังทดสอบ…');
      const t0 = Date.now();
      try {
        const out = await apiChat(n, [{ role: 'user', content: 'Reply with the single word: OK' }]);
        status(`เชื่อมต่อได้ (${((Date.now() - t0) / 1000).toFixed(1)} วินาที) · ตอบว่า “${out.replace(/\s+/g, ' ').trim().slice(0, 40)}”`, 'ok');
      } catch (err) {
        status(String(err?.message || err), 'bad');
      } finally {
        b.disabled = false;
      }
    }
  });
}

function barHtml(raw) {
  const b = parseBar(raw);
  return b ? `<div class="bc-bar"><i style="width:${b.pct}%"></i></div>` : '';
}

function empty(msg) {
  return `<div class="bc-empty">${msg}</div>`;
}

function pickFile() {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => res(inp.files?.[0] || null);
    inp.oncancel = () => res(null);
    inp.click();
  });
}

async function toDataUrl(file, w = 288, h = 360) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#0b1424';
    g.fillRect(0, 0, w, h);
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    g.drawImage(img, (w - dw) / 2, 0, dw, dh);
    return cv.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function doUpload(key) {
  const picked = pickFile();
  (async () => {
    const file = await picked;
    if (!file) return;
    try {
      setImage(key, await toDataUrl(file));
    } catch (e) {
      console.error('[Bot Console] image failed', e);
      toast('error', 'อ่านรูปนี้ไม่ได้');
    }
  })();
}

function setImage(key, value) {
  const meta = getMeta();
  if (!meta) return;
  if (key === 'me') {
    if (value) meta.me.avatar = value;
    else delete meta.me.avatar;
  } else if (key.startsWith('rel:')) {
    const n = key.slice(4).trim().toLowerCase();
    for (const k of Object.keys(meta.relImg)) if (k.trim().toLowerCase() === n) delete meta.relImg[k];
    if (value) meta.relImg[key.slice(4)] = value;
  }
  imgMenu = null;
  urlFor = null;
  rebuild();
  render();
  saveNow();
  toast('success', value ? 'บันทึกรูปแล้ว' : 'ลบรูปแล้ว');
}

function relImgFor(name) {
  const m = getMeta()?.relImg || {};
  if (m[name]) return m[name];
  const ln = String(name).trim().toLowerCase();
  const k = Object.keys(m).find((x) => x.trim().toLowerCase() === ln);
  return k ? m[k] : '';
}

const firstChar = (name) => {
  const t = String(name || '').trim();
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const g = [...seg.segment(t)][0]?.segment || '';
    return /^[\u0E40-\u0E44]/.test(g) ? t.slice(0, 2) : g;
  } catch { return t.slice(0, 1); }
};

function portrait(cands, letter, key, cls) {
  const list = (cands || []).filter(Boolean);
  const img = list.length
    ? `<img class="bc-rimg" src="${esc(list[0])}" ${list.length > 1 ? `data-c="${esc(JSON.stringify(list))}" ` : ''}data-i="0" alt="">`
    : '';
  return `<div class="bc-port ${cls}" data-act="imgMenu" data-key="${esc(key)}" title="เปลี่ยนรูป"><div class="bc-port-in">${letter}${img}</div><span class="bc-cam"><i class="fa-solid fa-camera"></i></span></div>`;
}

function imgMenuHtml(key, extra = '') {
  if (imgMenu !== key) return '';
  const k = esc(key);
  const link =
    urlFor === key
      ? `<div class="bc-urlrow" data-form><input class="bc-input" placeholder="วางลิงก์รูป (https://…)" inputmode="url"><button class="bc-btn" data-primary data-act="saveUrl" data-key="${k}">ใช้รูปนี้</button></div>`
      : '';
  return `<div class="bc-imgmenu"><div class="bc-btns">
    <button class="bc-btn" data-act="upload" data-key="${k}"><i class="fa-solid fa-upload"></i>อัปโหลด</button>
    <button class="bc-btn ghost" data-act="urlMode" data-key="${k}"><i class="fa-solid fa-link"></i>ลิงก์</button>
    <button class="bc-btn ghost" data-act="clearImg" data-key="${k}"><i class="fa-solid fa-trash"></i>ลบรูป</button></div>${link}${extra}</div>`;
}

const ELEMENTS = [
  [/light|thunder|สายฟ้า|ฟ้าผ่า|ไฟฟ้า|อสนี/i, '#b98cff'],
  [/fire|ไฟ|เพลิง|flame/i, '#ff7a4d'],
  [/ice|น้ำแข็ง|เยือกแข็ง|frost/i, '#6fe3ff'],
  [/phys|กายภาพ/i, '#ffd05a'],
  [/quant|ควอนตัม/i, '#8f86ff'],
  [/imag|จินตภาพ|จินตนาการ/i, '#ffe36e'],
  [/wind|ลม/i, '#7dffb4'],
];
const elColor = (v) => ELEMENTS.find(([re]) => re.test(String(v || '')))?.[1] || '';

function skillList() {
  const meta = getMeta();
  const out = (meta?.me?.skills || []).map((s, i) => ({ n: s.n, d: s.d || '', own: true, i }));
  const raw = cur?.state?.player?.skills;
  const bot = (Array.isArray(raw) ? raw : String(raw ?? '').split(/[|\n;]+/)).map((x) => String(x).trim()).filter(Boolean);
  const seen = new Set(out.map((s) => String(s.n).trim().toLowerCase()));
  for (const n of bot) {
    const k = n.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push({ n, d: '', own: false }); }
  }
  return out;
}

function skillFormHtml() {
  const meta = getMeta();
  const s = typeof skillForm === 'number' ? meta.me.skills?.[skillForm] : null;
  return `<div class="bc-card" data-form>
    <input class="bc-input" data-f="n" placeholder="ชื่อสกิล" value="${esc(s?.n || '')}">
    <input class="bc-input" data-f="d" placeholder="รายละเอียด / ประเภท (ไม่ใส่ก็ได้)" value="${esc(s?.d || '')}">
    <div class="bc-btns"><button class="bc-btn" data-primary data-act="saveSkill">${s ? 'บันทึก' : 'เพิ่มสกิล'}</button>
    <button class="bc-btn ghost" data-act="cancelForm">${s ? 'ยกเลิก' : 'เสร็จ'}</button></div></div>`;
}

function viewPlayer() {
  const { state, profile } = cur;
  const meta = getMeta();
  const p = state.player || {};
  const name = meta.me.name || p.name || ctx().name1 || 'Player';
  const pic = meta.me.avatar || getPersonaAvatarUrl();
  const letter = esc(firstChar(name).toUpperCase());

  const nameBlock =
    editing === '@name'
      ? `<div class="bc-nameedit" data-form><input class="bc-input" value="${esc(name)}" placeholder="ชื่อของคุณ">
          <button class="bc-ico" data-primary data-act="save" title="บันทึก"><i class="fa-solid fa-check"></i></button>
          <button class="bc-ico" data-act="cancel" title="ยกเลิก"><i class="fa-solid fa-xmark"></i></button></div>`
      : `<div class="bc-name"><span>${esc(name)}</span><button class="bc-ico" data-act="edit" data-key="@name" title="เปลี่ยนชื่อ"><i class="fa-solid fa-pen"></i></button></div>`;

  const hero = `<div class="bc-hero">${portrait([pic], letter, 'me', '')}
    <div class="bc-hbody">${nameBlock}<div class="bc-slash"></div><div class="bc-dim">แตะรูปเพื่อเปลี่ยนรูปประจำตัว</div></div></div>${imgMenuHtml('me')}`;

  const tiles = profile.playerFields
    .map((f) => {
      const raw = p[f.key] ?? '';
      const col = f.key === 'element' ? elColor(raw) : '';
      const sty = col ? ` style="--el:${col}"` : '';
      if (editing === f.key) {
        return `<div class="bc-tile editing"${sty} data-form><span class="bc-k">${esc(f.label)}</span>
          <input class="bc-input" value="${esc(raw)}">
          <button class="bc-ico" data-primary data-act="save" title="บันทึก"><i class="fa-solid fa-check"></i></button>
          <button class="bc-ico" data-act="cancel" title="ยกเลิก"><i class="fa-solid fa-xmark"></i></button></div>`;
      }
      return `<div class="bc-tile"${sty}><span class="bc-k">${esc(f.label)}</span>
        <span class="bc-v">${raw === '' ? '<i class="bc-dim">—</i>' : esc(raw)}</span>
        <button class="bc-ico" data-act="edit" data-key="${f.key}" title="แก้ไข"><i class="fa-solid fa-pen"></i></button></div>`;
    })
    .join('');

  const skills = skillList();
  const items = skills
    .map(
      (s) => `<div class="bc-skill"><span class="bc-hexi"><i class="fa-solid fa-bolt"></i></span>
      <div class="bc-sbody"><b>${esc(s.n)}</b>${s.d ? `<div class="bc-dim">${esc(s.d)}</div>` : ''}</div>
      ${
        s.own
          ? `<button class="bc-ico" data-act="skillEdit" data-i="${s.i}" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
             <button class="bc-ico" data-act="skillDel" data-i="${s.i}" title="ลบ"><i class="fa-solid fa-trash"></i></button>`
          : '<span class="bc-chip">จากบอท</span>'
      }</div>`,
    )
    .join('');
  const skillBody =
    (skillForm !== null ? skillFormHtml() : '') +
    (items || (skillForm === null ? empty('ยังไม่มีสกิล<br>กด “เพิ่ม” เพื่อใส่สกิลที่ครอบครอง') : ''));

  return `${hero}${tiles}
    <div class="bc-sec"><span>สกิลที่ครอบครอง</span><em class="bc-count">${skills.length}</em><i class="bc-fill"></i>
      <button class="bc-btn sm" data-act="skillNew"><i class="fa-solid fa-plus"></i>เพิ่ม</button></div>${skillBody}`;
}

function viewRel() {
  const { state, profile } = cur;
  const list = Object.entries(state.rel || {});
  const defMax = Number(profile.bondMax) || 100;
  const head = `<div class="bc-sec"><span>ตัวละครที่ผูกพัน</span><em class="bc-count">${list.length}</em><i class="bc-fill"></i>
    <button class="bc-btn sm" data-act="relNew"><i class="fa-solid fa-user-plus"></i>เพิ่ม</button></div>`;
  const newForm =
    relForm === '@new'
      ? `<div class="bc-card" data-form>
          <input class="bc-input" data-f="name" placeholder="ชื่อตัวละคร">
          <input class="bc-input" data-f="type" placeholder="ความสัมพันธ์ (ไม่ใส่ก็ได้) เช่น เพื่อนสนิท">
          <div class="bc-btns"><button class="bc-btn" data-primary data-act="relCreate">เพิ่มตัวละคร</button>
          <button class="bc-btn ghost" data-act="cancelForm">ยกเลิก</button></div></div>`
      : '';
  if (!list.length) return head + newForm + empty('ยังไม่มีตัวละคร<br>กด “เพิ่ม” หรือให้บอทส่งแท็ก <code>HI_Char</code>');

  const hint = '<div class="bc-dim bc-hint">แตะที่การ์ดตัวละครเพื่อดูความคิดในใจ (ต้องอยู่ในฉากปัจจุบัน)</div>';
  const cards = list
    .map(([name, r]) => {
      const max = Number(r?.max) || defMax;
      const bond = Number(r?.bond) || 0;
      const pct = Math.max(0, Math.min(100, (bond / max) * 100));
      const delta = Number(r?.delta) || 0;
      const dTxt = delta ? `<b class="${delta > 0 ? 'bc-up' : 'bc-down'}">${delta > 0 ? '+' : ''}${delta}</b>` : '';
      const mine = relImgFor(name);
      const fs = formFor(name, r);
      const cands = mine ? [mine] : fs ? [fileUrl(fs.form.file), ...avatarCandidates(name, '')] : avatarCandidates(name, r?.avatar);
      const letter = esc(firstChar(name).toUpperCase());
      const chips = [...new Set([r?.type, r?.stage, r?.tag].map((x) => String(x ?? '').trim()).filter(Boolean))]
        .map((x) => `<span class="bc-chip">${esc(x)}</span>`)
        .join('');
      const key = `rel:${name}`;
      const here = hereStatus(name).here;
      const sceneChip = `<span class="bc-chip ${here ? 'here' : 'away'}">${here ? 'อยู่ในฉาก' : 'ไม่อยู่ในฉาก'}</span>`;
      const multi = fs && fs.c.forms.length > 1;
      const strip = multi
        ? `<div class="bc-forms">${fs.c.forms
            .map(
              (f) => `<button class="bc-form${!mine && f.file === fs.form.file ? ' on' : ''}" data-act="setForm" data-name="${esc(name)}" data-char="${esc(fs.c.id)}" data-file="${esc(f.file)}" title="${esc(f.label)}">
                <img class="bc-rimg" src="${esc(fileUrl(f.file))}" data-i="0" alt=""><span>${esc(f.label)}</span></button>`,
            )
            .join('')}<button class="bc-form auto" data-act="setForm" data-name="${esc(name)}" data-char="${esc(fs.c.id)}" data-file=""><span>อัตโนมัติ</span></button></div>`
        : '';
      const tools = r?.custom
        ? `<span class="bc-tools"><button class="bc-ico" data-act="relEdit" data-name="${esc(r.ckey)}" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
           <button class="bc-ico" data-act="relDel" data-name="${esc(r.ckey)}" title="ลบ"><i class="fa-solid fa-trash"></i></button></span>`
        : '';
      const edit =
        r?.custom && relForm === r.ckey
          ? `<div class="bc-relform" data-form>
              <input class="bc-input" data-f="type" placeholder="ความสัมพันธ์" value="${esc(r.type || '')}">
              <input class="bc-input" data-f="stage" placeholder="ขั้น (ไม่ใส่ก็ได้)" value="${esc(r.stage || '')}">
              <input class="bc-input" data-f="bond" type="number" inputmode="numeric" placeholder="Bond" value="${bond}">
              <div class="bc-btns"><button class="bc-btn" data-primary data-act="saveRel" data-name="${esc(r.ckey)}">บันทึก</button>
              <button class="bc-btn ghost" data-act="cancelForm">ยกเลิก</button></div></div>`
          : '';
      return `<div class="bc-card bc-rel" data-rel="${esc(name)}"><div class="bc-rcard">${portrait(cands, letter, key, 'sm')}
        <div class="bc-rbody"><div class="bc-line"><b class="bc-rname">${esc(name)}</b>${tools}</div>
        <div class="bc-tags">${sceneChip}${chips}</div>
        <div class="bc-bondline"><i class="fa-solid fa-heart"></i><span class="bc-num">${bond}<small>/${max}</small></span>${dTxt}</div>
        <div class="bc-bar seg"><i style="width:${pct}%"></i></div></div></div>${edit}${imgMenuHtml(key, strip)}${thoughtOpen === name ? thoughtHtml(name) : ''}</div>`;
    })
    .join('');
  return head + hint + newForm + cards;
}

const stOf = (m) => {
  const v = String(m?.status ?? '').toLowerCase();
  return v === 'done' ? 'done' : v === 'failed' ? 'failed' : 'active';
};

function missionFormHtml(id) {
  const c = id === '@new' ? null : getMeta().mCustom[id];
  return `<div class="bc-card" data-form>
    <input class="bc-input" data-f="title" placeholder="ชื่อภารกิจ" value="${esc(c?.title || '')}">
    <input class="bc-input" data-f="rank" placeholder="ระดับ (ไม่ใส่ก็ได้) เช่น S, B, เควสหลัก" value="${esc(c?.rank || '')}">
    <input class="bc-input" data-f="objective" placeholder="เป้าหมาย / รายละเอียด" value="${esc(c?.objective || '')}">
    <input class="bc-input" data-f="max" type="number" inputmode="numeric" min="0" placeholder="ต้องทำกี่ครั้ง (ไม่ใส่ = ไม่มีแถบความคืบหน้า)" value="${c?.max ? esc(c.max) : ''}">
    <input class="bc-input" data-f="reward" placeholder="รางวัล เช่น 300 Coin" value="${esc(c?.reward || '')}">
    <div class="bc-btns"><button class="bc-btn" data-primary data-act="mSave" data-id="${c ? esc(id) : ''}">${c ? 'บันทึก' : 'เพิ่มภารกิจ'}</button>
    <button class="bc-btn ghost" data-act="cancelForm">ยกเลิก</button></div></div>`;
}

function missionCard(id, m) {
  const meta = getMeta();
  const st = stOf(m);
  const conf = shopCfg();
  const cu = conf.currency?.name || 'Coin';
  const b = parseBar(m.progress);
  const amount = rewardAmount(m.reward, cu);
  const claimed = !!meta.mClaimed[id];
  const stChip = st === 'done' ? '<span class="bc-chip here">สำเร็จ</span>' : st === 'failed' ? '<span class="bc-chip bad">ล้มเหลว</span>' : '';
  const prog = b
    ? `<div class="bc-line"><span class="bc-dim">ความคืบหน้า</span><span class="bc-num sm">${esc(b.cur)}<small>/${esc(b.max)}</small></span></div>${barHtml(m.progress)}`
    : m.progress
      ? `<div class="bc-line"><span class="bc-dim">ความคืบหน้า</span><span>${esc(m.progress)}</span></div>`
      : '';
  const reward = m.reward
    ? `<div class="bc-reward"><i class="fa-solid ${esc(conf.currency?.icon || 'fa-coins')}"></i><span>${esc(m.reward)}</span></div>`
    : '';
  const btn = (act, label, ico, cls = '') => `<button class="bc-btn sm ${cls}" data-act="${act}" data-id="${esc(id)}"><i class="fa-solid ${ico}"></i>${label}</button>`;
  const acts = [];
  if (st === 'active') {
    if (m.custom && b && b.cur < b.max) acts.push(btn('mPlus', '+1', 'fa-plus', 'ghost'));
    acts.push(btn('mDone', 'สำเร็จ', 'fa-check'), btn('mFail', 'ล้มเหลว', 'fa-xmark', 'ghost'));
  } else {
    if (st === 'done' && amount && !claimed) acts.push(btn('mClaim', `รับรางวัล +${fmtMoney(amount)}`, 'fa-gift'));
    if (st === 'done' && amount && claimed) acts.push('<span class="bc-chip">รับรางวัลแล้ว</span>');
    acts.push(btn('mReopen', 'เปิดใหม่', 'fa-rotate-left', 'ghost'));
  }
  const tools = m.custom
    ? `<span class="bc-tools"><button class="bc-ico" data-act="mEdit" data-id="${esc(id)}" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
       <button class="bc-ico" data-act="mDel" data-id="${esc(id)}" title="ลบ"><i class="fa-solid fa-trash"></i></button></span>`
    : '';
  return `<div class="bc-card bc-mission ${st}"><div class="bc-line"><b class="bc-mt">${esc(m.title || id)}</b>${tools}</div>
    <div class="bc-tags">${m.rank ? `<span class="bc-chip">${esc(m.rank)}</span>` : ''}${stChip}${m.giver ? `<span class="bc-chip">จาก ${esc(m.giver)}</span>` : ''}${m.custom ? '<span class="bc-chip">ของฉัน</span>' : ''}</div>
    ${m.objective ? `<div class="bc-mobj">${esc(m.objective)}</div>` : ''}${prog}${reward}
    ${m.log ? `<div class="bc-dim bc-mlog">${esc(m.log)}</div>` : ''}
    <div class="bc-btns bc-macts">${acts.join('')}</div></div>`;
}

async function genBoard() {
  const meta = getMeta();
  if (!meta || !cur || boardBusy) return;
  if (mainBusy()) { toast('warning', 'รอให้บอทตอบจบก่อน'); return; }
  const md = ctx().chatMetadata;
  const ep = epoch;
  const ms = Object.values(cur.state.mission || {});
  const titles = (f) => ms.filter(f).map((m) => m.title).filter(Boolean);
  boardBusy = true;
  boardErr = null;
  if (open && tab === 'mission' && !formOpen()) render();
  try {
    const prompt = buildBoardPrompt({
      user: userName(), player: cur.state.player, rels: Object.keys(cur.state.rel || {}),
      active: titles((m) => stOf(m) === 'active'),
      avoid: [...titles((m) => stOf(m) !== 'active'), ...meta.board.declined, ...meta.board.offers.map((o) => o.title)],
      currency: shopCfg().currency?.name || 'Coin',
    });
    const raw = await withoutPhoneCtx(() => quiet(prompt));
    if (ctx().chatMetadata !== md || ep !== epoch) return;
    const offers = parseBoard(raw);
    if (!offers.length) throw new Error('โมเดลตอบกลับมาในรูปแบบที่อ่านไม่ได้ ลองอีกครั้ง');
    meta.board.offers = offers.map((o) => ({ ...o, id: newItemId() }));
    saveNow();
  } catch (e) {
    console.warn('[Bot Console] board failed', e);
    if (ep === epoch && !e?.cancelled) boardErr = String(e?.message || e);
  } finally {
    if (ep === epoch) {
      boardBusy = false;
      if (open && tab === 'mission' && !formOpen()) render();
    }
  }
}

function offerCard(o) {
  const cu = shopCfg().currency?.name || 'Coin';
  return `<div class="bc-card bc-offer"><div class="bc-line"><b class="bc-mt">${esc(o.title)}</b></div>
    <div class="bc-tags">${o.rank ? `<span class="bc-chip">${esc(o.rank)}</span>` : ''}${o.giver ? `<span class="bc-chip">จาก ${esc(o.giver)}</span>` : ''}${o.steps ? `<span class="bc-chip">${o.steps} ขั้น</span>` : ''}</div>
    ${o.objective ? `<div class="bc-mobj">${esc(o.objective)}</div>` : ''}
    ${o.reward ? `<div class="bc-reward"><i class="fa-solid ${esc(shopCfg().currency?.icon || 'fa-coins')}"></i><span>${fmtMoney(o.reward)} ${esc(cu)}</span></div>` : ''}
    <div class="bc-btns bc-macts"><button class="bc-btn sm" data-act="bAccept" data-id="${esc(o.id)}"><i class="fa-solid fa-check"></i>รับภารกิจ</button>
    <button class="bc-btn sm ghost" data-act="bDecline" data-id="${esc(o.id)}"><i class="fa-solid fa-xmark"></i>ปฏิเสธ</button></div></div>`;
}

function boardHtml() {
  const offers = getMeta().board.offers;
  const btn = `<button class="bc-btn sm" data-act="bGen" ${boardBusy ? 'disabled' : ''}><i class="fa-solid fa-wand-magic-sparkles"></i>${offers.length ? 'สร้างใหม่' : 'ดูภารกิจใหม่'}</button>`;
  const busy = boardBusy
    ? '<div class="bc-card"><b>กำลังคิดภารกิจจากสถานการณ์ตอนนี้…</b><div class="bc-btns" style="margin-top:8px"><button class="bc-btn ghost sm" data-act="genCancel">ยกเลิก</button></div></div>'
    : '';
  const err = boardErr && !boardBusy ? `<div class="bc-card"><b>สร้างภารกิจไม่สำเร็จ</b><div class="bc-dim">${esc(boardErr)}</div></div>` : '';
  return `<div class="bc-sec"><span>กระดานภารกิจ</span><em class="bc-count">${offers.length}</em><i class="bc-fill"></i>${btn}</div>${busy}${err}${offers.map(offerCard).join('')}`;
}

function viewMission() {
  const all = Object.entries(cur.state.mission || {});
  const group = (st) => all.filter(([, m]) => stOf(m) === st);
  const act = group('active');
  const done = group('done');
  const fail = group('failed');
  const head = (label, n, extra = '') => `<div class="bc-sec"><span>${label}</span><em class="bc-count">${n}</em><i class="bc-fill"></i>${extra}</div>`;
  const add = '<button class="bc-btn sm" data-act="mNew"><i class="fa-solid fa-plus"></i>เพิ่ม</button>';
  const cards = (list) => list.map(([id, m]) => (missionForm === id ? missionFormHtml(id) : missionCard(id, m))).join('');
  return `${boardHtml()}${head('กำลังทำ', act.length, add)}${missionForm === '@new' ? missionFormHtml('@new') : ''}${cards(act) || (missionForm === '@new' ? '' : empty('ยังไม่มีภารกิจที่กำลังทำ'))}
    ${done.length ? head('สำเร็จแล้ว', done.length) + cards(done) : ''}${fail.length ? head('ล้มเหลว', fail.length) + cards(fail) : ''}`;
}

function collectAppts() {
  const meta = getMeta();
  const out = [];
  const seen = new Set();
  for (const m of ctx().chat || []) {
    if (!m || m.is_user || m.is_system) continue;
    for (const a of parseAppts(m.mes)) {
      const key = apptKey(a);
      if (seen.has(key)) continue;
      seen.add(key);
      const st = meta.apptState[key] || {};
      out.push({ ...a, key, src: 'bot', status: st.status || 'upcoming', notified: !!st.notified });
    }
  }
  for (const a of meta.appts) out.push({ ...a, key: a.id, src: 'me', status: a.status || 'upcoming', notified: !!a.notified });
  return out;
}

const refOfAppt = (a) => {
  const m = getMeta();
  if (a.src === 'me') return m.appts.find((x) => x.id === a.key);
  return m.apptState[a.key] || (m.apptState[a.key] = {});
};

const apptWhen = (a) => whenState(a, cur?.state?.player);

function checkAppts() {
  const user = userName();
  let hit = 0;
  for (const a of cur.appts) {
    if (a.status !== 'upcoming' || a.notified || apptWhen(a) !== 'due') continue;
    const ref = refOfAppt(a);
    if (!ref) continue;
    ref.notified = true;
    a.notified = true;
    hit++;
    const when = [a.date, a.time].filter(Boolean).join(' ');
    addEvent(`Reminder: ${user} has an appointment${a.who ? ` with ${a.who}` : ''}${a.place ? ` at ${a.place}` : ''}: ${a.title}${when ? ` (${when})` : ''}. It is time now; bring it up naturally if it fits the scene.`);
    const label = `${a.title}${a.who ? ` · ${a.who}` : ''}`;
    if (open) toast('info', `ถึงเวลานัดแล้ว: ${label}`);
    else showNotify('นัดหมาย', `ถึงเวลานัดแล้ว: ${label}`, 1, { icon: 'fa-calendar-check', open: () => openTab('appt') });
  }
  if (hit) save();
}

function apptFormHtml(id) {
  const a = id === '@new' ? null : getMeta().appts.find((x) => x.id === id);
  const p = cur.state.player || {};
  const names = Object.keys(cur.state.rel || {});
  return `<div class="bc-card" data-form>
    <input class="bc-input" data-f="title" placeholder="เรื่องที่นัด เช่น ดื่มชาด้วยกัน" value="${esc(a?.title || '')}">
    <input class="bc-input" data-f="who" list="bc-names" placeholder="นัดกับใคร (ไม่ใส่ก็ได้)" value="${esc(a?.who || '')}">
    <datalist id="bc-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <input class="bc-input" data-f="date" placeholder="วันที่ในเรื่อง${p.date ? ` (ตอนนี้: ${esc(p.date)})` : ''}" value="${esc(a?.date || '')}">
    <input class="bc-input" data-f="time" placeholder="เวลา${p.time ? ` (ตอนนี้: ${esc(p.time)})` : ' เช่น 14:30'}" value="${esc(a?.time || '')}">
    <input class="bc-input" data-f="place" placeholder="สถานที่ (ไม่ใส่ก็ได้)" value="${esc(a?.place || '')}">
    <div class="bc-btns"><button class="bc-btn" data-primary data-act="aSave" data-id="${a ? esc(id) : ''}">${a ? 'บันทึก' : 'เพิ่มนัดหมาย'}</button>
    <button class="bc-btn ghost" data-act="cancelForm">ยกเลิก</button></div></div>`;
}

function apptCard(a) {
  const st = apptWhen(a);
  const when = [a.date, a.time].filter(Boolean).join(' ');
  const upcoming = a.status === 'upcoming';
  const chip = !upcoming
    ? `<span class="bc-chip ${a.status === 'done' ? 'here' : 'bad'}">${a.status === 'done' ? 'เสร็จแล้ว' : 'ยกเลิก'}</span>`
    : st === 'due' ? '<span class="bc-chip here">ถึงเวลาแล้ว</span>' : st === 'late' ? '<span class="bc-chip bad">เลยกำหนด</span>' : '';
  const btn = (act, label, ico, cls = '') => `<button class="bc-btn sm ${cls}" data-act="${act}" data-key="${esc(a.key)}"><i class="fa-solid ${ico}"></i>${label}</button>`;
  const acts = upcoming ? btn('aDone', 'เสร็จแล้ว', 'fa-check') + btn('aCancel', 'ยกเลิก', 'fa-xmark', 'ghost') : btn('aReopen', 'เปิดใหม่', 'fa-rotate-left', 'ghost');
  const tools = a.src === 'me'
    ? `<span class="bc-tools"><button class="bc-ico" data-act="aEdit" data-key="${esc(a.key)}" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
       <button class="bc-ico" data-act="aDel" data-key="${esc(a.key)}" title="ลบ"><i class="fa-solid fa-trash"></i></button></span>`
    : '';
  return `<div class="bc-card bc-appt ${upcoming ? st : 'past'}"><div class="bc-line"><b class="bc-mt">${esc(a.title || '(ไม่มีชื่อ)')}</b>${tools}</div>
    <div class="bc-tags">${when ? `<span class="bc-chip">${esc(when)}</span>` : ''}${chip}${a.who ? `<span class="bc-chip">${esc(a.who)}</span>` : ''}<span class="bc-chip">${a.src === 'bot' ? 'จากบอท' : 'ของฉัน'}</span></div>
    ${a.place ? `<div class="bc-place"><i class="fa-solid fa-location-dot"></i>${esc(a.place)}</div>` : ''}
    <div class="bc-btns bc-macts">${acts}</div></div>`;
}

function viewAppt() {
  const list = cur.appts || [];
  const order = { due: 0, soon: 1, unknown: 2, late: 3 };
  const up = list.filter((a) => a.status === 'upcoming').sort((x, y) => order[apptWhen(x)] - order[apptWhen(y)]);
  const past = list.filter((a) => a.status !== 'upcoming');
  const head = (label, n, extra = '') => `<div class="bc-sec"><span>${label}</span><em class="bc-count">${n}</em><i class="bc-fill"></i>${extra}</div>`;
  const add = '<button class="bc-btn sm" data-act="aNew"><i class="fa-solid fa-plus"></i>เพิ่ม</button>';
  const cards = (arr) => arr.map((a) => (apptForm === a.key && a.src === 'me' ? apptFormHtml(a.key) : apptCard(a))).join('');
  return `${head('นัดหมาย', up.length, add)}${apptForm === '@new' ? apptFormHtml('@new') : ''}${cards(up) || (apptForm === '@new' ? '' : empty('ยังไม่มีนัดหมาย'))}
    ${past.length ? head('ผ่านไปแล้ว', past.length) + cards(past) : ''}`;
}

function msgsHtml(th, key) {
  const msgs = th?.msgs || [];
  if (!msgs.length && !phoneBusy[key]) {
    return `<div class="bcp-empty">ยังไม่มีข้อความ<br>พิมพ์ทักได้เลย หรือให้เขาทักมาก่อน
      <div class="bc-btns"><button class="bc-btn sm" data-act="phoneInitiate"><i class="fa-solid fa-comment-dots"></i>ให้เขาทักมา</button></div></div>`;
  }
  let lastDay = null;
  const out = msgs.map((m) => {
    const day = m.sd && m.sd !== lastDay ? `<div class="bcp-day"><span>${esc(m.sd)}</span></div>` : '';
    if (m.sd) lastDay = m.sd;
    const sel = phoneSel === m.id;
    const tools = sel
      ? `<div class="bcp-mtools"><button class="bc-ico" data-act="msgEdit" data-id="${m.id}" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
         <button class="bc-ico" data-act="msgDel" data-id="${m.id}" title="ลบ"><i class="fa-solid fa-trash"></i></button></div>`
      : '';
    return `${day}<div class="bcp-m ${m.from === 'me' ? 'me' : 'them'}${sel ? ' sel' : ''}" data-act="msgSel" data-id="${m.id}">
      <div class="bcp-b">${esc(m.text).replace(/\n/g, '<br>')}</div><span class="bcp-t">${esc(m.st || clock(m.ts))}</span>${tools}</div>`;
  });
  if (phoneBusy[key]) out.push('<div class="bcp-m them"><div class="bcp-b typing"><i></i><i></i><i></i></div><button class="bcp-cancel" data-act="genCancel">ยกเลิก</button></div>');
  return out.join('');
}

function phoneStatusBar() {
  const p = cur.state.player || {};
  const time = p.time ? esc(p.time) : esc(clock(Date.now()));
  const place = [p.location, p.weather].filter(Boolean).join(' · ');
  return `<div class="bcp-status"><span class="bcp-clock">${time}</span><span class="bcp-place">${esc(place)}</span>
    <span class="bcp-sig"><i class="fa-solid fa-signal"></i><i class="fa-solid fa-wifi"></i></span></div>`;
}

function viewPhoneList() {
  const meta = getMeta();
  const map = new Map();
  for (const [n, r] of Object.entries(cur.state.rel || {})) map.set(keyOf(n), { name: n, r });
  for (const [k, th] of Object.entries(meta.phone.threads)) if (!map.has(k) && th.msgs.length) map.set(k, { name: th.name, r: null });
  const rows = [...map.entries()].map(([k, e]) => ({ ...e, th: meta.phone.threads[k] }));
  const chats = rows.filter((x) => x.th?.msgs.length).sort((a, b) => b.th.updated - a.th.updated);
  const rest = rows.filter((x) => !x.th?.msgs.length);

  const row = (x) => {
    const last = lastOf(x.th?.msgs);
    const typing = phoneBusy[keyOf(x.name)];
    const prev = typing ? 'กำลังพิมพ์…' : last ? `${last.from === 'me' ? 'คุณ: ' : ''}${last.text.replace(/\s+/g, ' ')}` : x.r?.type || 'ยังไม่เคยคุยกัน';
    const here = hereStatus(x.name).here;
    return `<button class="bcp-row" data-act="phoneOpen" data-name="${esc(x.name)}">${avatarCircle(x.name, x.r, here ? 'here' : '')}
      <span class="bcp-mid"><b>${esc(x.name)}</b><span class="bcp-prev${typing ? ' typing' : ''}">${esc(prev)}</span></span>
      <span class="bcp-end">${last ? `<small>${esc(last.st || clock(last.ts))}</small>` : ''}${x.th?.unread ? `<em class="bcp-unread">${x.th.unread}</em>` : ''}</span></button>`;
  };
  const head = (label, n, extra = '') => `<div class="bc-sec"><span>${label}</span><em class="bc-count">${n}</em><i class="bc-fill"></i>${extra}</div>`;
  const addBtn = '<button class="bc-btn sm" data-act="phoneNew"><i class="fa-solid fa-user-plus"></i>เพิ่ม</button>';
  const form = phoneForm
    ? `<div class="bc-card" data-form><input class="bc-input" data-f="name" placeholder="ชื่อตัวละครที่จะเพิ่มในรายชื่อ">
        <div class="bc-btns"><button class="bc-btn" data-primary data-act="phoneContactCreate">เพิ่มรายชื่อ</button>
        <button class="bc-btn ghost" data-act="cancelForm">ยกเลิก</button></div></div>`
    : '';
  const none = !rows.length ? empty('ยังไม่มีรายชื่อ<br>กด “เพิ่ม” หรือให้บอทส่งแท็ก <code>HI_Char</code>') : '';
  return `<div class="bcp-screen">${form}${chats.length ? head('การสนทนา', chats.length) + chats.map(row).join('') : ''}
    ${head('รายชื่อ', rest.length, addBtn)}${rest.map(row).join('')}${none}</div>`;
}

function viewPhoneThread() {
  const meta = getMeta();
  const key = keyOf(phoneName);
  const th = threadOf(meta.phone, phoneName);
  if (th) th.unread = 0;
  const name = th?.name || phoneName;
  const here = hereStatus(name).here;
  const busy = !!phoneBusy[key];
  const draft = phoneDraft[key] || '';
  return `<div class="bcp-thread">
    <div class="bcp-bar"><button class="bc-ico" data-act="phoneBack" title="กลับ"><i class="fa-solid fa-chevron-left"></i></button>
      ${avatarCircle(name, relOf(name), here ? 'here' : '')}
      <div class="bcp-who"><b>${esc(name)}</b><span class="bcp-sub${here ? ' here' : ''}"><i class="fa-solid fa-circle"></i>${here ? 'อยู่ในฉากเดียวกัน' : 'ไม่อยู่ในฉาก'}</span></div>
      <button class="bc-ico" data-act="phoneInitiate" title="ให้เขาทักมา"><i class="fa-solid fa-comment-dots"></i></button>
      <button class="bc-ico" data-act="phoneRegen" title="ให้ตอบใหม่"><i class="fa-solid fa-rotate-right"></i></button>
      <button class="bc-ico" data-act="phoneClear" title="ล้างแชทนี้"><i class="fa-solid fa-trash"></i></button></div>
    <div class="bcp-msgs">${msgsHtml(th, key)}</div>
    <div class="bcp-comp"><textarea class="bcp-ta" rows="1" data-key="${esc(key)}" placeholder="ข้อความถึง ${esc(name)}">${esc(draft)}</textarea>
      <button class="bcp-send${busy ? ' busy' : ''}" data-act="phoneSend" title="ส่ง" ${busy ? 'disabled' : ''}><i class="fa-solid fa-paper-plane"></i></button></div></div>`;
}

function viewPhone() {
  return `<div class="bcp">${phoneStatusBar()}${phoneName ? viewPhoneThread() : viewPhoneList()}</div>`;
}

const isDisplayOnly = (s) => !!s.markdownOnly && !s.promptOnly;

const HIDE_FROM_LIST = [/^reg[ae]x\s*hide$/i, /^omega console/i, /^personnel create$/i, /^dossier$/i];

function listRegex() {
  const c = ctx();
  const out = [];
  const g = c.extensionSettings?.regex;
  if (Array.isArray(g)) g.forEach((s, i) => out.push({ scope: 'global', key: s.id || `#${i}`, s }));
  const cid = c.characterId;
  const sc = cid !== undefined ? c.characters?.[cid]?.data?.extensions?.regex_scripts : null;
  if (Array.isArray(sc)) sc.forEach((s, i) => out.push({ scope: 'char', key: s.id || `#${i}`, s }));
  return out;
}

function findRegex(scope, key) {
  return listRegex().find((r) => r.scope === scope && String(r.key) === String(key));
}

function isGenerating() {
  const el = document.querySelector('#mes_stop');
  return !!el && getComputedStyle(el).display !== 'none';
}

const HELPER_PREFIX = 'BC off · ';
const isHelper = (s) => !!s.bcHelperFor || String(s.scriptName || '').startsWith(HELPER_PREFIX);

const PLAIN_HTML = new Set(('div span p br b i u s em strong style script img a details summary table thead tbody tr td th ul ol li ' +
  'h1 h2 h3 h4 h5 h6 center font svg path g defs rect circle line html body head section article header footer code pre ' +
  'blockquote hr button input label small sup sub marquee video audio source canvas').split(' '));

function tagsOf(script) {
  const src = String(script.findRegex || '').replace(/\\/g, '');
  const names = [...src.matchAll(/<\s*\/?\s*([A-Za-z][\w-]*)/g)].map((m) => m[1]);
  return [...new Set(names)].filter((n) => !PLAIN_HTML.has(n.toLowerCase()));
}

function regexArray(scope) {
  const c = ctx();
  return scope === 'global' ? c.extensionSettings?.regex : c.characters?.[c.characterId]?.data?.extensions?.regex_scripts;
}

async function persistRegex(scope) {
  const c = ctx();
  if (scope === 'global') (c.saveSettingsDebounced || (() => {}))();
  else await c.writeExtensionField(c.characterId, 'regex_scripts', regexArray('char'));
}

async function setRegexEnabled(scope, key, enabled) {
  if (regexBusy) return false;
  const r = findRegex(scope, key);
  if (!r || !isDisplayOnly(r.s)) return false;
  if (isGenerating()) {
    try { toastr.warning('รอให้บอทตอบจบก่อนค่อยสลับ UI'); } catch { }
    return false;
  }
  const arr = regexArray(scope);
  if (!Array.isArray(arr)) return false;
  regexBusy = true;
  const snapshot = JSON.stringify(arr);
  const name = r.s.scriptName;
  try {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i].bcHelperFor === name) arr.splice(i, 1);
    if (enabled) {
      r.s.disabled = false;
    } else {
      r.s.disabled = true;
      const twin = JSON.parse(JSON.stringify(r.s));
      Object.assign(twin, {
        id: globalThis.crypto?.randomUUID?.() || `bc-${Date.now()}`,
        scriptName: HELPER_PREFIX + name,
        bcHelperFor: name,
        replaceString: '',
        disabled: false,
      });
      arr.push(twin);
    }
    await persistRegex(scope);
    await ctx().reloadCurrentChat?.();
  } catch (e) {
    console.error('[Bot Console] regex toggle failed', e);
    arr.splice(0, arr.length, ...JSON.parse(snapshot));
    try { toastr.error('สลับ UI ไม่สำเร็จ'); } catch { }
    return false;
  } finally {
    regexBusy = false;
  }
  return true;
}

function toggleList() {
  return listRegex().filter((r) => !isHelper(r.s) && !HIDE_FROM_LIST.some((re) => re.test(String(r.s.scriptName || '').trim())));
}

function applyBlock() {
  const c = ctx();
  if (typeof c.setExtensionPrompt !== 'function') return;
  let text = '';
  if (cur) {
    const tags = new Set();
    for (const r of toggleList()) if (r.s.disabled && isDisplayOnly(r.s)) tagsOf(r.s).forEach((t) => tags.add(t));
    if (tags.size) {
      text = `[System note: the user turned these output blocks off. Do not write them in your reply at all, and do not copy them from earlier messages: ${[...tags].map((t) => `<${t}>…</${t}>`).join(', ')}. Everything else in the reply stays the same.]`;
    }
  }
  try {
    const types = c.extension_prompt_types || {};
    const roles = c.extension_prompt_roles || {};
    c.setExtensionPrompt(`${EXT_ID}_block`, text, types.IN_CHAT ?? 1, 1, false, roles.SYSTEM ?? 0);
  } catch (e) {
    console.warn('[Bot Console] block prompt failed', e);
  }
}

const MENU = [
  ['honkai track', 'Tracker'],
  ['char banner', 'Banner'],
  ['hi3 status', 'Status'],
  ['hi3 stage', 'Bond'],
  ['skill', 'Skill'],
  ['mission ui', 'Mission'],
];
const menuIndex = (r) => {
  const i = MENU.findIndex(([k]) => k === String(r.s.scriptName || '').trim().toLowerCase());
  return i < 0 ? MENU.length : i;
};

function viewUi() {
  const all = toggleList().sort((x, y) => menuIndex(x) - menuIndex(y));
  if (!all.length) return empty('ยังไม่มีสคริปต์ Regex');
  return all
    .map((r) => {
      const ok = isDisplayOnly(r.s);
      const i = menuIndex(r);
      const label = i < MENU.length ? MENU[i][1] : r.s.scriptName || '(ไม่มีชื่อ)';
      return `<div class="bc-row"><div class="bc-v">${esc(label)}</div>
        <label class="bc-sw"><input type="checkbox" data-act="regexToggle" data-scope="${r.scope}" data-key="${esc(r.key)}" ${r.s.disabled ? '' : 'checked'} ${ok && !regexBusy ? '' : 'disabled'}><span></span></label></div>`;
    })
    .join('');
}

const autoCfg = () => ensureAuto(getMeta().phone, (ctx().chat || []).length);

let licMsg = null;
let licBusy = false;

const LIC_MSG = {
  clock: 'นาฬิกาของเครื่องนี้ไม่ตรงกับเวลาจริง (ช้ากว่าเวลาที่ออกรหัสเกิน 5 นาที) ตั้งเวลาเป็นอัตโนมัติแล้วลองใหม่',
  expired: 'รหัสนี้หมดอายุแล้ว',
  signature: 'รหัสไม่ถูกต้อง (ลายเซ็นไม่ตรง) ลองคัดลอกใหม่ให้ครบทั้งบรรทัด',
  format: 'รูปแบบรหัสไม่ถูกต้อง ต้องขึ้นต้นด้วย BC1. และคัดลอกมาให้ครบ',
};

function licenseCardHtml() {
  if (premium()) return '';
  return `<div class="bc-card"><div class="bc-line"><div class="bc-h">รหัสปลดล็อค Premium</div><span class="bc-ed free">Free</span></div>
      <div class="bc-dim">ใส่ Premium license ที่ได้รับ เพื่อเปิดสกินตัวละคร วอลเปเปอร์ และความจำสถานะ (รหัสขึ้นต้นด้วย BC1.)</div>
      <div class="bc-licrow"><input id="bc-lic" class="bc-input" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="1024" placeholder="BC1.…">
        <button class="bc-segb" data-act="licApply" disabled><i class="fa-solid fa-unlock"></i>ปลดล็อค</button></div>
      <div id="bc-licmsg" class="bc-licmsg${licMsg ? (licMsg.ok ? ' ok' : ' bad') : ''}">${licMsg ? esc(licMsg.t) : ''}</div></div>`;
}

async function applyLicense() {
  if (licBusy) return;
  const inp = $('#bc-lic');
  const raw = inp?.value || '';
  if (!String(raw).trim()) {
    licMsg = { ok: false, t: 'ใส่ Premium license ก่อน' };
    const el = $('#bc-licmsg');
    if (el) { el.textContent = licMsg.t; el.className = 'bc-licmsg bad'; }
    return;
  }
  licBusy = true;
  const button = panel?.querySelector('[data-act="licApply"]');
  if (button) button.disabled = true;
  try {
    if (!await setLicense(raw)) {
      licMsg = { ok: false, t: LIC_MSG[licenseReason()] || LIC_MSG.format };
      const el = $('#bc-licmsg');
      if (el) { el.textContent = licMsg.t; el.className = 'bc-licmsg bad'; }
      return;
    }
    extSlot().license = licenseKey();
    saveApi();
    licMsg = null;
    applyCfg();
    await initMemory();
    render();
    toast('success', 'ปลดล็อค Premium แล้ว');
  } catch (e) {
    console.warn('[Bot Console] license verification failed', e);
    licMsg = { ok: false, t: 'ตรวจสอบรหัสไม่สำเร็จ กรุณาใช้เบราว์เซอร์เวอร์ชันล่าสุด' };
    const el = $('#bc-licmsg');
    if (el) { el.textContent = licMsg.t; el.className = 'bc-licmsg bad'; }
  } finally {
    licBusy = false;
    const currentButton = panel?.querySelector('[data-act="licApply"]');
    if (currentButton) currentButton.disabled = !String(panel?.querySelector('#bc-lic')?.value || '').trim();
  }
}

// The license lives in SillyTavern's per-user settings on the server. SillyTavern pages keep their own
// in-memory copy and write it all back on every save, so a page that was open before the key was
// entered elsewhere would later erase it for everybody. Reading the server copy again when the page
// comes back to the foreground adopts a newer key, and puts ours back if another page wiped it.
let licSyncAt = 0;
async function syncLicense() {
  if (Date.now() - licSyncAt < 60000) return;
  licSyncAt = Date.now();
  try {
    const c = ctx();
    const headers = c.getRequestHeaders?.();
    if (!headers) return;
    const res = await fetch('/api/settings/get', { method: 'POST', headers, body: '{}', cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json();
    const saved = typeof data?.settings === 'string' ? JSON.parse(data.settings) : data?.settings;
    const remote = saved?.extension_settings?.[EXT_ID]?.license;
    if (premium()) {
      if (!remote) { extSlot().license = licenseKey(); saveApi(); }
      return;
    }
    if (typeof remote !== 'string' || !remote || !await setLicense(remote)) return;
    extSlot().license = licenseKey();
    applyCfg();
    await initMemory();
    render();
    toast('success', 'พบรหัส Premium ที่บันทึกไว้ในเซิร์ฟเวอร์ ปลดล็อคให้แล้ว');
  } catch (e) {
    console.warn('[Bot Console] license sync failed', e);
  }
}

function skinCardHtml() {
  const tile = (id, title, who, img, on, lock) => `<button class="bc-skin${on ? ' on' : ''}${lock ? ' lock' : ''}" ${lock ? 'disabled' : `data-act="setSkin" data-v="${id}"`}>
      <span class="bc-skth">${img ? `<img src="${esc(THEMES_URL + img)}" alt="" loading="lazy" decoding="async">` : ''}</span>${lock ? '<i class="fa-solid fa-lock bc-lk"></i>' : ''}
      <span class="bc-skn"><b>${esc(title)}</b><em>${esc(who)}</em>${lock ? '<u>สำหรับ Premium Version</u>' : ''}</span></button>`;
  const active = premium() ? cfg.skin : 'default';
  const tiles = [tile('default', 'ปกติ', 'Console', '', active === 'default', false)]
    .concat(SKINS.map((k) => tile(k.id, k.title, k.who, k.card, premium() && active === k.id, !premium())));
  return `<div class="bc-card"><div class="bc-line"><div class="bc-h">สกินตัวละคร</div><span class="bc-ed${premium() ? '' : ' free'}">${premium() ? 'Premium' : 'Free'}</span></div>
      <div class="bc-skins">${tiles.join('')}</div></div>
    <div class="bc-card"><div class="bc-h">วอลเปเปอร์</div>
      <div class="bc-wallprev">${wallCustom() || (premium() && cfg.skin !== 'default') ? '' : 'ยังไม่มีวอลเปเปอร์'}</div>
      <div class="bc-seg"><button class="bc-segb${premium() ? '' : ' lock'}" data-act="wallPick"${premium() ? '' : ' disabled'}><i class="fa-solid fa-image"></i>เลือกรูป</button>
        <button class="bc-segb${premium() ? '' : ' lock'}" data-act="wallClear"${premium() ? '' : ' disabled'}><i class="fa-solid fa-rotate-left"></i>ใช้ของสกิน</button></div>
      ${premium() ? '' : '<div class="bc-locknote"><i class="fa-solid fa-lock"></i>สำหรับ Premium Version</div>'}</div>
    <div class="bc-card"><div class="bc-h">ความจำสถานะ</div>
      <div class="bc-opt"><div><div class="bc-ot">ตัดแท็กเก่าออกจากสิ่งที่ส่งให้โมเดล</div>
        <div class="bc-dim">เก็บเฉพาะค่าล่าสุดของความสัมพันธ์และเควสต์ ข้อความในแชทไม่ถูกแก้</div></div>
        <label class="bc-sw"><input type="checkbox" data-act="memOn" ${premium() && extSlot().mem !== false ? 'checked' : ''}${premium() ? '' : ' disabled'}><span></span></label></div>
      ${premium() ? (memReady ? '' : `<div class="bc-locknote"><i class="fa-solid fa-circle-info"></i>${memMissing ? 'ไม่พบไฟล์ memory.js ของ Premium ในโฟลเดอร์ส่วนเสริม' : 'SillyTavern เวอร์ชันนี้ไม่รองรับ (ใช้ได้กับ Chat Completion)'}</div>`) : '<div class="bc-locknote"><i class="fa-solid fa-lock"></i>สำหรับ Premium Version</div>'}</div>`;
}

function viewSettings() {
  return `${skinCardHtml()}
    ${licenseCardHtml()}
    <div class="bc-card"><div class="bc-h">ปุ่ม Console</div>
      <div class="bc-opt"><div><div class="bc-ot">ล็อคปุ่มไว้ข้างจอ</div></div>
        <label class="bc-sw"><input type="checkbox" data-act="cfgLock" ${cfg.lock ? 'checked' : ''}><span></span></label></div>
      <div class="bc-rng"><div class="bc-line"><span>ขนาด</span><b id="bc-v-size">${cfg.size}px</b></div>
        <input type="range" min="36" max="88" step="2" value="${cfg.size}" data-cfg="size"></div>
      <div class="bc-rng"><div class="bc-line"><span>ความโปร่งใส</span><b id="bc-v-transparent">${cfg.transparent}%</b></div>
        <input type="range" min="0" max="70" step="5" value="${cfg.transparent}" data-cfg="transparent"></div>
      <button class="bc-segb" data-act="fabReset"><i class="fa-solid fa-arrows-to-dot"></i>รีเซ็ตตำแหน่งและขนาดปุ่ม</button></div>
    <div class="bc-card"><div class="bc-h">ซิงค์ข้อมูล</div>
      <button class="bc-segb" data-act="syncNow"><i class="fa-solid fa-rotate"></i>โหลดข้อมูลล่าสุดจากแชท</button></div>
    <div class="bc-card"><div class="bc-h">ข้อความ</div>
      <div class="bc-opt"><div><div class="bc-ot">ให้เนื้อเรื่องรู้ข้อความที่คุยกัน</div></div>
        <label class="bc-sw"><input type="checkbox" data-act="phoneShare" ${getMeta()?.phone?.share === false ? '' : 'checked'}><span></span></label></div>
      <div class="bc-opt"><div><div class="bc-ot">ให้ตัวละครส่งข้อความมาเอง</div></div>
        <label class="bc-sw"><input type="checkbox" data-act="autoOn" ${autoCfg().on ? 'checked' : ''}><span></span></label></div>
      <div class="bc-opt"><div><div class="bc-ot">ตรวจทุกๆ</div></div>
        <select class="bc-input bc-sel" data-act="autoEvery">${[1, 2, 3, 5, 8, 12].map((n) => `<option value="${n}"${autoCfg().every === n ? ' selected' : ''}>${n} ข้อความ</option>`).join('')}</select></div>
      <button class="bc-segb" data-act="autoNow"${autoBusy ? ' disabled' : ''}><i class="fa-solid fa-wand-magic-sparkles"></i><span>${autoBusy ? 'กำลังคิด…' : 'ลองให้ตัดสินใจตอนนี้'}</span></button></div>
    <div class="bc-card"><div class="bc-h">ความคิดในใจ</div>
      <div class="bc-opt"><div><div class="bc-ot">ให้บอทเขียนความคิดมาพร้อมข้อความ</div></div>
        <label class="bc-sw"><input type="checkbox" data-act="thoughtsOn" ${getMeta()?.thoughtsOn === false ? '' : 'checked'}><span></span></label></div></div>
    <div class="bc-card"><div class="bc-h">นัดหมาย</div>
      <div class="bc-opt"><div><div class="bc-ot">ให้บอทจดนัดหมายให้</div></div>
        <label class="bc-sw"><input type="checkbox" data-act="appointOn" ${getMeta()?.appointOn === false ? '' : 'checked'}><span></span></label></div></div>`;
}

function viewHome() {
  const p = cur?.state?.player || {};
  const now = new Date();
  const clock = String(p.time || '').trim() || now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = String(p.date || '').trim() || now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
  const where = [p.location, p.weather].map((x) => String(x || '').trim()).filter(Boolean).join(' · ');
  const apps = TABS.map((t) => `<button class="bc-app" data-tab="${t.id}">${t.id === 'phone' ? '<b class="bc-badge" hidden></b>' : ''}<span class="bc-ai"><i class="fa-solid ${t.icon}"></i></span><span class="bc-al">${esc(t.label)}</span></button>`).join('');
  return `<div class="bc-home">
    <div class="bc-status"><span>${esc(clock)}</span><span class="bc-sti"><i class="fa-solid fa-signal"></i><i class="fa-solid fa-wifi"></i><i class="fa-solid fa-battery-three-quarters"></i></span></div>
    <div class="bc-widget"><div class="bc-clock">${esc(clock)}</div><div class="bc-wd"><b>${esc(date)}</b>${where ? `<span>${esc(where)}</span>` : ''}</div></div>
    <div class="bc-apps">${apps}</div></div>`;
}

function render() {
  if (!panel) return;
  const body = $('#bc-body');
  panel.classList.toggle('at-home', tab === 'home');
  if (!cur) {
    $('#bc-title').textContent = "Seito's bot Console";
    body.classList.remove('phone');
    body.innerHTML = empty('เปิดแชทกับตัวละครก่อน แล้วแผงนี้จะแสดงข้อมูลของแชทนั้น');
    body._bcHtml = null;
    updateBadges();
    return;
  }
  const app = TABS.find((t) => t.id === tab);
  $('#bc-title').textContent = app ? app.label : cur.profile.label;
  const ta0 = $('.bcp-ta');
  const box0 = $('.bcp-msgs');
  let hadFocus = false;
  let selS = 0;
  let selE = 0;
  if (ta0) {
    phoneDraft[ta0.dataset.key] = ta0.value;
    hadFocus = document.activeElement === ta0;
    selS = ta0.selectionStart;
    selE = ta0.selectionEnd;
  }
  const stick = phoneStick || !box0 || box0.scrollHeight - box0.scrollTop - box0.clientHeight < 90;
  const top0 = box0 ? box0.scrollTop : 0;
  body.classList.toggle('phone', tab === 'phone');
  const views = { home: viewHome, player: viewPlayer, rel: viewRel, phone: viewPhone, shop: viewShop, mission: viewMission, appt: viewAppt, ui: viewUi, settings: viewSettings };
  let html;
  try {
    html = views[tab]();
  } catch (e) {
    console.error('[Bot Console] render failed', e);
    html = empty(`แสดงผลไม่สำเร็จ<br><code>${esc(e?.message || e)}</code>`);
  }
  if (body._bcTab === tab && body._bcHtml === html) {
    updateBadges();
    return;
  }
  const tabChanged = body._bcTab !== tab;
  body._bcTab = tab;
  body._bcHtml = html;
  body.innerHTML = html;
  if (tabChanged) {
    body.scrollTop = 0;
    body.classList.remove('enter');
    void body.offsetWidth;
    body.classList.add('enter');
  }
  body.querySelectorAll('img').forEach((i) => { i.decoding = 'async'; });
  const box = $('.bcp-msgs');
  if (box) {
    box.scrollTop = stick ? box.scrollHeight : top0;
    phoneStick = false;
  }
  const ta = $('.bcp-ta');
  if (ta) {
    sizeTa(ta);
    if (hadFocus) {
      ta.focus();
      try { ta.setSelectionRange(selS, selE); } catch { }
    }
  }
  if (formOpen()) {
    const inp = $('[data-form] .bc-input');
    inp?.focus();
    try { inp?.setSelectionRange?.(inp.value.length, inp.value.length); } catch { }
  }
  updateBadges();
}

function commitEdit() {
  const inp = $('[data-form] .bc-input');
  const meta = getMeta();
  if (!inp || !editing || !meta) return;
  const v = inp.value.trim();
  if (editing === '@name') {
    if (v) meta.me.name = v;
    else delete meta.me.name;
  } else if (editing === 'money') {
    const n = toMoney(v);
    if (n === null || n < 0) { toast('warning', 'ใส่ยอดเงินเป็นตัวเลข'); return; }
    setMoney(meta, Math.round(n));
  } else {
    meta.manual = meta.manual.filter((m) => !(m?.patch?.player && Object.keys(m.patch.player).length === 1 && editing in m.patch.player));
    meta.manual.push({ at: ctx().chat.length, patch: { player: { [editing]: v } } });
  }
  editing = null;
  rebuild();
  render();
  saveNow();
}

let layoutRaf = 0;
let safeProbe = null;
let fabDragging = false;

function safeInsets() {
  if (!safeProbe) {
    safeProbe = document.createElement('div');
    safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(safeProbe);
  }
  const cs = getComputedStyle(safeProbe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}

function applyLayout() {
  if (!panel) return;
  const vv = window.visualViewport;
  const vw = Math.round(vv?.width || window.innerWidth);
  const vh = Math.round(vv?.height || window.innerHeight);
  let w = 410;
  let ri = 12;
  let mt = 64;
  let mb = 88;
  if (vw <= 560) { w = vw - 16; ri = 8; mt = 56; mb = 72; }
  else if (vw <= 1100) { w = 460; mt = 56; mb = 72; }
  if (vh < 520) { mt = 8; mb = 8; }
  const st = panel.style;
  st.setProperty('--bc-vh', `${vh}px`);
  st.setProperty('--bc-w', `${w}px`);
  st.setProperty('--bc-ri', `${ri}px`);
  st.setProperty('--bc-mt', `${mt}px`);
  st.setProperty('--bc-mb', `${mb}px`);
}

function layoutPanel() {
  if (layoutRaf) return;
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = 0;
    escapeBodyContext();
    applyLayout();
    if (!fabDragging) fitFab();
    updateCovered();
  });
}

function escapeBodyContext() {
  if (!panel || !fab || fab.parentNode === document.documentElement) return;
  const cs = getComputedStyle(document.body);
  const odd = (v) => v && v !== 'none' && v !== 'auto' && v !== 'normal';
  if (odd(cs.transform) || odd(cs.filter) || odd(cs.perspective) || /paint|layout|strict|content/.test(cs.contain || '') || odd(cs.backdropFilter)) {
    document.documentElement.append(panel, fab, notify);
  }
}

function updateCovered() {
  if (!fab || !panel) return;
  let cov = false;
  if (open) {
    const a = fab.getBoundingClientRect();
    const b = panel.getBoundingClientRect();
    const m = 30;
    cov = a.right > b.left - m && a.left < b.right + m && a.bottom > b.top - m && a.top < b.bottom + m;
  }
  fab.classList.toggle('covered', cov);
}

function setOpen(v) {
  open = v;
  applyLayout();
  panel.classList.toggle('open', v);
  fab.classList.toggle('active', v);
  updateCovered();
  setTimeout(updateCovered, 260);
  if (v) {
    tab = 'home';
    editing = null; imgMenu = null; urlFor = null; skillForm = null; relForm = null;
    phoneForm = false; phoneSel = null; thoughtOpen = null; shopForm = null; missionForm = null; apptForm = null; giftFor = null;
    hideNotify();
    try { rebuild(); } catch (e) { console.error('[Bot Console] rebuild failed', e); }
    render();
  }
}

const CFG_DEFAULT = { theme: 'dark', lock: true, size: 52, transparent: 0, skin: 'default' };
let cfg = { ...CFG_DEFAULT };
let fabPos = { x: 1, y: 0.4 };

const clampN = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function loadCfg() {
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    cfg = { ...CFG_DEFAULT, ...raw };
  } catch { cfg = { ...CFG_DEFAULT }; }
  cfg.theme = cfg.theme === 'light' ? 'light' : 'dark';
  cfg.lock = cfg.lock !== false;
  cfg.size = clampN(Number(cfg.size) || CFG_DEFAULT.size, 36, 88);
  cfg.transparent = clampN(Number(cfg.transparent) || 0, 0, 70);
  if (!skinById(cfg.skin)) cfg.skin = 'default';
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) fabPos = { x: clampN(p.x, 0, 1), y: clampN(p.y, 0, 1) };
    else {
      const oldTop = parseFloat(localStorage.getItem(TOP_KEY));
      if (Number.isFinite(oldTop)) fabPos = { x: 1, y: clampN(oldTop, 0, 1) };
    }
  } catch { }
}

function saveCfg() {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { }
}
function savePos() {
  try { localStorage.setItem(POS_KEY, JSON.stringify(fabPos)); } catch { }
}

const FAB_M = 6;
const FAB_TOP = 8;

function fabBox() {
  const sf = safeInsets();
  const s = cfg.size;
  const xmin = FAB_M + sf.l;
  const xmax = Math.max(xmin, window.innerWidth - s - FAB_M - sf.r);
  const ymin = FAB_TOP + sf.t;
  const ymax = Math.max(ymin, window.innerHeight - s - FAB_TOP - sf.b);
  return { xmin, xmax, ymin, ymax, xr: xmax - xmin, yr: ymax - ymin };
}

function placeFab(animate = false) {
  if (!fab) return;
  if (cfg.lock) fabPos.x = fabPos.x < 0.5 ? 0 : 1;
  const b = fabBox();
  if (animate) {
    fab.classList.add('snap');
    setTimeout(() => fab.classList.remove('snap'), 260);
  }
  fab.style.transform = '';
  fab.style.left = `${Math.round(b.xmin + fabPos.x * b.xr)}px`;
  fab.style.top = `${Math.round(b.ymin + fabPos.y * b.yr)}px`;
}

function fitFab() {
  if (!fab || getComputedStyle(fab).display === 'none') return;
  const b = fabBox();
  const rect = fab.getBoundingClientRect();
  const x = cfg.lock
    ? (fabPos.x < 0.5 ? b.xmin : b.xmax)
    : clampN(rect.left, b.xmin, b.xmax);
  const y = clampN(rect.top, b.ymin, b.ymax);
  fab.style.transform = '';
  fab.style.left = `${Math.round(x)}px`;
  fab.style.top = `${Math.round(y)}px`;
  fabPos = {
    x: b.xr ? clampN((x - b.xmin) / b.xr, 0, 1) : (x <= b.xmin ? 0 : 1),
    y: b.yr ? clampN((y - b.ymin) / b.yr, 0, 1) : 0,
  };
  savePos();
}

const extSlot = () => {
  const all = ctx().extensionSettings;
  return all[EXT_ID] || (all[EXT_ID] = {});
};
const wallCustom = () => (premium() && typeof extSlot().wall === 'string' ? extSlot().wall : '');

function loadSkinAssets(id) {
  if (!document.getElementById('bc-skins-css')) {
    const l = document.createElement('link');
    l.id = 'bc-skins-css';
    l.rel = 'stylesheet';
    l.href = SKINS_CSS;
    document.head.appendChild(l);
  }
  const href = fontHref(id);
  if (href && !document.getElementById(`bc-font-${id}`)) {
    const l = document.createElement('link');
    l.id = `bc-font-${id}`;
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }
}

function applyChatSkin() {
  const id = premium() && skinById(cfg.skin) ? cfg.skin : 'default';
  const p = uiPalette(id);
  const de = document.documentElement;
  if (p) {
    de.dataset.bcSkin = id;
    const set = { ac: p.ac, ac2: p.ac2, t1: p.t1, ink: p.ink, deep: p.deep, mu: p.mu, rgb: p.rgb };
    for (const [k, v] of Object.entries(set)) de.style.setProperty(`--bcu-${k}`, v);
  } else {
    delete de.dataset.bcSkin;
  }
  try { applyChatUi(p, id); } catch (e) { console.warn('[Bot Console] chat card recolor failed', e); }
}

function applySkin() {
  const id = premium() && skinById(cfg.skin) ? cfg.skin : 'default';
  const meta = skinById(id);
  if (meta) loadSkinAssets(id);
  for (const el of [panel, notify, document.getElementById('bc-api-drawer')]) if (el) el.dataset.skin = id;
  if (fab) delete fab.dataset.skin;
  applyChatSkin();
  const custom = wallCustom();
  const wall = custom ? `url("${custom}")` : meta?.wall ? `url("${THEMES_URL}${meta.wall}")` : '';
  if (!panel) return;
  if (wall) panel.style.setProperty('--bc-wall', wall);
  else panel.style.removeProperty('--bc-wall');
  panel.classList.toggle('has-wall', !!wall);
}

async function packWallpaper(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const LIMIT = 280 * 1024;
    let max = 1280;
    let q = 0.82;
    let out = '';
    for (let step = 0; step < 9; step++) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d');
      g.fillStyle = '#101018';
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      out = cv.toDataURL('image/jpeg', q);
      if (out.length * 0.75 <= LIMIT) return out;
      if (q > 0.55) q -= 0.09;
      else max = Math.round(max * 0.8);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function applyCfg() {
  if (panel) panel.dataset.theme = cfg.theme;
  if (notify) notify.dataset.theme = cfg.theme;
  const drawer = document.getElementById('bc-api-drawer');
  if (drawer) drawer.dataset.theme = cfg.theme;
  if (fab) {
    fab.dataset.theme = cfg.theme;
    fab.style.setProperty('--bc-fab-size', `${cfg.size}px`);
    fab.style.opacity = String(1 - cfg.transparent / 100);
  }
  applySkin();
  placeFab();
}

function mountUi() {
  fab = document.createElement('div');
  fab.id = 'bc-fab';
  fab.title = "Seito's bot Console";
  fab.innerHTML = `<span class="bc-hex"><i class="fa-solid fa-terminal"></i><img src="${esc(ICON_URL)}" alt="" draggable="false"></span>`;
  fab.querySelector('img').addEventListener('error', (e) => e.target.remove());
  loadCfg();
  fab.style.display = 'none';
  document.body.appendChild(fab);

  panel = document.createElement('div');
  panel.id = 'bc-panel';
  panel.innerHTML = `
    <div class="bc-head"><button class="bc-ico bc-back" id="bc-back" data-act="home" title="กลับหน้าหลัก"><i class="fa-solid fa-chevron-left"></i></button><span class="bc-dot"></span><b id="bc-title">Seito's bot Console</b>
      <button class="bc-ico" data-act="close" title="ปิด"><i class="fa-solid fa-xmark"></i></button></div>
    <div id="bc-body"></div><button class="bc-homebar" data-act="home" title="หน้าหลัก"><i></i></button><div class="bc-scan"></div>`;
  document.body.appendChild(panel);
  mountNotify();
  escapeBodyContext();
  window.addEventListener('resize', layoutPanel);
  window.addEventListener('orientationchange', layoutPanel);
  window.visualViewport?.addEventListener('resize', layoutPanel);
  window.addEventListener('pageshow', layoutPanel);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    layoutPanel();
    syncLicense();
  });
  applyLayout();
  applyCfg();

  let drag = null;
  let dragRaf = 0;
  fab.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    fabDragging = true;
    drag = { px: e.clientX, py: e.clientY, left: fab.offsetLeft, top: fab.offsetTop, nx: fab.offsetLeft, ny: fab.offsetTop, moved: false, threshold: e.pointerType === 'touch' ? 12 : 6, box: fabBox() };
    try { fab.setPointerCapture(e.pointerId); } catch { }
  });
  fab.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.px;
    const dy = e.clientY - drag.py;
    if (!drag.moved && Math.hypot(dx, dy) > drag.threshold) { drag.moved = true; fab.classList.add('dragging'); }
    if (!drag.moved) return;
    drag.nx = clampN(drag.left + dx, drag.box.xmin, drag.box.xmax);
    drag.ny = clampN(drag.top + dy, drag.box.ymin, drag.box.ymax);
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(() => {
      dragRaf = 0;
      if (drag) fab.style.transform = `translate3d(${drag.nx - drag.left}px, ${drag.ny - drag.top}px, 0)`;
    });
  });
  const endDrag = (cancelled) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    fabDragging = false;
    cancelAnimationFrame(dragRaf);
    dragRaf = 0;
    fab.classList.remove('dragging');
    if (d.moved) {
      const b = fabBox();
      fab.style.left = `${d.nx}px`;
      fab.style.top = `${d.ny}px`;
      fab.style.transform = '';
      fabPos = {
        x: b.xr ? clampN((d.nx - b.xmin) / b.xr, 0, 1) : 1,
        y: b.yr ? clampN((d.ny - b.ymin) / b.yr, 0, 1) : 0,
      };
      placeFab(true);
      savePos();
      updateCovered();
    } else if (!cancelled) {
      setOpen(!open);
    }
  };
  fab.addEventListener('pointerup', (e) => { e.stopPropagation(); endDrag(false); });
  fab.addEventListener('pointercancel', (e) => { e.stopPropagation(); endDrag(true); });
  fab.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  window.addEventListener('resize', () => { if (notify && !notify.hidden) placeNotify(); });

  panel.addEventListener('input', (e) => {
    if (e.target?.id === 'bc-lic') {
      const button = panel.querySelector('[data-act="licApply"]');
      if (button && !licBusy) button.disabled = !String(e.target.value || '').trim();
      return;
    }
    if (e.target?.classList?.contains('bcp-ta')) {
      phoneDraft[e.target.dataset.key] = e.target.value;
      sizeTa(e.target);
      return;
    }
    const k = e.target?.dataset?.cfg;
    if (!k) return;
    cfg[k] = Number(e.target.value);
    saveCfg();
    applyCfg();
    const lab = $(`#bc-v-${k}`);
    if (lab) lab.textContent = k === 'size' ? `${cfg.size}px` : `${cfg.transparent}%`;
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target?.id === 'bc-lic') { e.preventDefault(); applyLicense(); }
  });
  panel.addEventListener('change', (e) => {
    const act = e.target?.dataset?.act;
    if (act === 'memOn') {
      if (!premium()) return;
      extSlot().mem = e.target.checked;
      saveApi();
      memSig = '';
      applyPhoneCtx();
      return;
    }
    if (act !== 'cfgLock') return;
    cfg.lock = e.target.checked;
    saveCfg();
    placeFab(true);
    savePos();
  });

  panel.addEventListener('click', (e) => {
    const relCard = e.target.closest('.bc-rel[data-rel]');
    if (relCard && !e.target.closest('[data-act],[data-tab],[data-form],input,textarea,button,.bc-imgmenu,.bc-thought')) {
      toggleThought(relCard.dataset.rel);
      return;
    }
    const t = e.target.closest('[data-act],[data-tab]');
    if (!t) return;
    if (t.dataset.tab) {
      tab = t.dataset.tab; editing = null; imgMenu = null; urlFor = null; skillForm = null; relForm = null; phoneForm = false; phoneSel = null; shopForm = null; missionForm = null; apptForm = null; giftFor = null;
      if (tab === 'phone' && phoneName) phoneStick = true;
      render();
      return;
    }
    const meta = getMeta();
    switch (t.dataset.act) {
      case 'close': setOpen(false); break;
      case 'home':
        editing = null; imgMenu = null; urlFor = null; skillForm = null; relForm = null; phoneForm = false; phoneSel = null; shopForm = null; missionForm = null; apptForm = null; giftFor = null;
        tab = 'home';
        render();
        break;
      case 'licApply': applyLicense(); break;
      case 'fabReset':
        fabPos = { x: 1, y: 0.4 };
        cfg.size = CFG_DEFAULT.size;
        cfg.transparent = 0;
        saveCfg();
        savePos();
        applyCfg();
        placeFab(true);
        updateCovered();
        render();
        toast('success', 'รีเซ็ตตำแหน่งและขนาดปุ่มแล้ว');
        break;
      case 'setSkin':
        if (!premium()) break;
        cfg.skin = skinById(t.dataset.v) ? t.dataset.v : 'default';
        saveCfg();
        applyCfg();
        render();
        break;
      case 'wallPick': {
        if (!premium()) break;
        const picked = pickFile();
        (async () => {
          const f = await picked;
          if (!f) return;
          try {
            extSlot().wall = await packWallpaper(f);
            saveApi();
            applySkin();
            render();
            toast('success', 'เปลี่ยนวอลเปเปอร์แล้ว');
          } catch (err) {
            console.error('[Bot Console] wallpaper failed', err);
            toast('error', 'อ่านรูปนี้ไม่ได้');
          }
        })();
        break;
      }
      case 'wallClear':
        if (!premium()) break;
        delete extSlot().wall;
        saveApi();
        applySkin();
        render();
        break;
      case 'imgMenu': { const k = t.dataset.key; imgMenu = imgMenu === k ? null : k; urlFor = null; render(); break; }
      case 'upload': doUpload(t.dataset.key); break;
      case 'urlMode': urlFor = t.dataset.key; render(); break;
      case 'saveUrl': {
        const v = t.closest('[data-form]')?.querySelector('.bc-input')?.value.trim() || '';
        if (!/^(https?:\/\/|data:image)/i.test(v)) { toast('warning', 'ลิงก์ต้องขึ้นต้นด้วย https://'); break; }
        setImage(t.dataset.key, v);
        break;
      }
      case 'clearImg': setImage(t.dataset.key, ''); break;
      case 'setForm':
        if (meta) {
          if (t.dataset.file) meta.forms[t.dataset.char] = t.dataset.file;
          else delete meta.forms[t.dataset.char];
          const n = String(t.dataset.name || '').trim().toLowerCase();
          for (const k of Object.keys(meta.relImg)) if (k.trim().toLowerCase() === n) delete meta.relImg[k];
          imgMenu = null;
          rebuild();
          render();
          saveNow();
        }
        break;
      case 'skillNew': skillForm = 'new'; render(); break;
      case 'skillEdit': skillForm = Number(t.dataset.i); render(); break;
      case 'skillDel':
        if (meta && confirm('ลบสกิลนี้?')) {
          meta.me.skills.splice(Number(t.dataset.i), 1);
          skillForm = null;
          render();
          saveNow();
        }
        break;
      case 'saveSkill': {
        if (!meta) break;
        const box = t.closest('[data-form]');
        const n = box.querySelector('[data-f="n"]').value.trim();
        const d = box.querySelector('[data-f="d"]').value.trim();
        if (!n) { toast('warning', 'ใส่ชื่อสกิลก่อน'); break; }
        if (!Array.isArray(meta.me.skills)) meta.me.skills = [];
        if (typeof skillForm === 'number') { meta.me.skills[skillForm] = { n, d }; skillForm = null; }
        else { meta.me.skills.push({ n, d }); skillForm = 'new'; }
        render();
        saveNow();
        break;
      }
      case 'cancelForm': editing = null; skillForm = null; relForm = null; urlFor = null; phoneForm = false; shopForm = null; missionForm = null; apptForm = null; giftFor = null; render(); break;
      case 'thoughtRegen': thoughtOpen = t.dataset.name; genThought(t.dataset.name); break;
      case 'thoughtForce':
        sceneForce.set(keyOf(t.dataset.name), chatSig(ctx().chat));
        thoughtOpen = t.dataset.name;
        render();
        break;
      case 'phoneOpen': {
        phoneName = t.dataset.name;
        phoneSel = null;
        phoneStick = true;
        const th = meta && threadOf(meta.phone, phoneName);
        if (th && th.unread) { th.unread = 0; save(); }
        render();
        break;
      }
      case 'phoneBack': phoneName = null; phoneSel = null; render(); break;
      case 'phoneNew': phoneForm = true; render(); break;
      case 'phoneContactCreate': {
        if (!meta) break;
        const name = t.closest('[data-form]').querySelector('[data-f="name"]').value.trim();
        if (!name) { toast('warning', 'ใส่ชื่อตัวละครก่อน'); break; }
        if (Object.keys(cur.state.rel || {}).some((n) => keyOf(n) === keyOf(name))) { toast('warning', 'มีรายชื่อนี้อยู่แล้ว'); break; }
        meta.customRel[name] = { type: '', bond: 0 };
        phoneForm = false;
        phoneName = name;
        phoneStick = true;
        rebuild();
        render();
        saveNow();
        break;
      }
      case 'genCancel': cancelGen(); break;
      case 'phoneSend': phoneSend(); break;
      case 'phoneInitiate':
        if (phoneName) requestReply(phoneName, 'initiate');
        break;
      case 'phoneRegen': phoneRegen(); break;
      case 'phoneClear':
        if (meta && phoneName && confirm(`ล้างข้อความทั้งหมดกับ ${phoneName}?`)) {
          const th = threadOf(meta.phone, phoneName);
          if (th) { th.msgs = []; th.unread = 0; th.updated = 0; }
          phoneSel = null;
          applyPhoneCtx();
          updateBadges();
          updateThread();
          saveNow();
        }
        break;
      case 'msgSel': phoneSel = phoneSel === t.dataset.id ? null : t.dataset.id; updateThread(false); break;
      case 'msgEdit': {
        const m = meta && phoneName && threadOf(meta.phone, phoneName)?.msgs.find((x) => x.id === t.dataset.id);
        if (!m) break;
        const v = prompt('แก้ข้อความ', m.text);
        if (v !== null && v.trim()) { m.text = v.trim(); save(); applyPhoneCtx(); }
        phoneSel = null;
        updateThread(false);
        break;
      }
      case 'msgDel': {
        const th = meta && phoneName && threadOf(meta.phone, phoneName);
        if (!th) break;
        th.msgs = th.msgs.filter((x) => x.id !== t.dataset.id);
        phoneSel = null;
        save();
        applyPhoneCtx();
        updateThread(false);
        break;
      }
      case 'aNew': apptForm = '@new'; render(); break;
      case 'aEdit': apptForm = t.dataset.key; render(); break;
      case 'aDel':
        if (meta && confirm('ลบนัดหมายนี้?')) {
          meta.appts = meta.appts.filter((x) => x.id !== t.dataset.key);
          apptForm = null;
          rebuild();
          render();
          saveNow();
        }
        break;
      case 'aSave': {
        if (!meta) break;
        const box = t.closest('[data-form]');
        const get = (f) => box.querySelector(`[data-f="${f}"]`).value.trim();
        const title = get('title');
        if (!title) { toast('warning', 'ใส่เรื่องที่นัดก่อน'); break; }
        const f = { title, who: get('who'), date: get('date'), time: get('time'), place: get('place') };
        const old = t.dataset.id && meta.appts.find((x) => x.id === t.dataset.id);
        if (old) {
          if (old.date !== f.date || old.time !== f.time) old.notified = false;
          Object.assign(old, f);
        } else meta.appts.push({ id: `m-${newItemId().slice(2)}`, ...f, status: 'upcoming', notified: false });
        apptForm = null;
        rebuild();
        render();
        saveNow();
        break;
      }
      case 'aDone': case 'aCancel': case 'aReopen': {
        const a = (cur.appts || []).find((x) => x.key === t.dataset.key);
        const ref = a && refOfAppt(a);
        if (!ref) break;
        ref.status = { aDone: 'done', aCancel: 'cancelled', aReopen: 'upcoming' }[t.dataset.act];
        rebuild();
        render();
        saveNow();
        break;
      }
      case 'bGen': genBoard(); break;
      case 'bDecline': {
        if (!meta) break;
        const o = meta.board.offers.find((x) => x.id === t.dataset.id);
        if (o) { meta.board.declined.push(o.title); if (meta.board.declined.length > 30) meta.board.declined.shift(); }
        meta.board.offers = meta.board.offers.filter((x) => x.id !== t.dataset.id);
        render();
        saveNow();
        break;
      }
      case 'bAccept': {
        if (!meta) break;
        const o = meta.board.offers.find((x) => x.id === t.dataset.id);
        if (!o) break;
        const cu = shopCfg().currency?.name || 'Coin';
        meta.mCustom[`u-${newItemId().slice(2)}`] = {
          title: o.title, rank: o.rank, objective: o.objective, giver: o.giver, status: '', cur: 0, max: o.steps || 0,
          reward: o.reward ? `${o.reward} ${cu}` : '',
        };
        meta.board.offers = meta.board.offers.filter((x) => x.id !== o.id);
        addEvent(`${userName()} accepted a new mission: "${o.title}"${o.objective ? ` - ${o.objective}` : ''}${o.giver ? ` (asked by ${o.giver})` : ''}.`);
        rebuild();
        render();
        saveNow();
        toast('success', `รับภารกิจ “${o.title}” แล้ว`);
        break;
      }
      case 'mNew': missionForm = '@new'; render(); break;
      case 'mEdit': missionForm = t.dataset.id; render(); break;
      case 'mDel':
        if (meta && confirm('ลบภารกิจนี้?')) {
          delete meta.mCustom[t.dataset.id];
          missionForm = null; apptForm = null; giftFor = null;
          rebuild();
          render();
          saveNow();
        }
        break;
      case 'mSave': {
        if (!meta) break;
        const box = t.closest('[data-form]');
        const get = (f) => box.querySelector(`[data-f="${f}"]`).value.trim();
        const title = get('title');
        if (!title) { toast('warning', 'ใส่ชื่อภารกิจก่อน'); break; }
        const max = Math.max(0, Math.round(Number(get('max')) || 0));
        const id = t.dataset.id;
        const old = id && meta.mCustom[id];
        const base = old || { cur: 0, status: '' };
        const nid = old ? id : `u-${newItemId().slice(2)}`;
        meta.mCustom[nid] = { ...base, title, rank: get('rank'), objective: get('objective'), reward: get('reward'), max, cur: Math.min(Number(base.cur) || 0, max || Infinity) };
        missionForm = null; apptForm = null; giftFor = null;
        rebuild();
        render();
        saveNow();
        break;
      }
      case 'mPlus': case 'mDone': case 'mFail': case 'mReopen': {
        if (!meta) break;
        const id = t.dataset.id;
        const c = meta.mCustom[id];
        const v = { mDone: 'done', mFail: 'failed', mReopen: '' }[t.dataset.act];
        if (t.dataset.act === 'mPlus') {
          if (c) c.cur = Math.min(Number(c.max) || Infinity, (Number(c.cur) || 0) + 1);
        } else if (c) {
          c.status = v;
          if (v === 'done' && Number(c.max)) c.cur = Number(c.max);
        } else {
          meta.manual = meta.manual.filter((m) => {
            const ms = m?.patch?.mission;
            return !(ms && Object.keys(ms).length === 1 && ms[id] && Object.keys(ms[id]).length === 1 && 'status' in ms[id]);
          });
          meta.manual.push({ at: ctx().chat.length, patch: { mission: { [id]: { status: v } } } });
        }
        rebuild();
        render();
        saveNow();
        break;
      }
      case 'mClaim': {
        if (!meta) break;
        const id = t.dataset.id;
        const m = cur.state.mission?.[id];
        const amount = rewardAmount(m?.reward, shopCfg().currency?.name);
        if (!m || !amount || meta.mClaimed[id]) break;
        meta.mClaimed[id] = true;
        setMoney(meta, balanceOf() + amount);
        rebuild();
        render();
        saveNow();
        toast('success', `ได้รับ ${fmtMoney(amount)} ${shopCfg().currency?.name || 'Coin'}`);
        break;
      }
      case 'autoNow': {
        const a = meta && ensureAuto(meta.phone, 0);
        if (a) { a.lastLen = (ctx().chat || []).length; save(); }
        autoText(true);
        break;
      }
      case 'buy': buyItem(t.dataset.id); break;
      case 'useItem': useItem(t.dataset.id); break;
      case 'giftOpen':
        if (!Object.keys(cur.state.rel || {}).length) { toast('warning', 'ยังไม่มีตัวละครในรายชื่อให้มอบ'); break; }
        giftFor = giftFor === t.dataset.id ? null : t.dataset.id;
        render();
        break;
      case 'giftSend': giveItem(t.dataset.id, t.closest('[data-form]')?.querySelector('[data-f="who"]')?.value); break;
      case 'itemNew': shopForm = '@new'; render(); break;
      case 'itemEdit': shopForm = t.dataset.id; render(); break;
      case 'itemDel':
        if (meta && confirm('ลบสินค้านี้ออกจากร้าน? (ของที่ซื้อไปแล้วยังอยู่ในรายการของที่มี)')) {
          meta.shop.custom = meta.shop.custom.filter((x) => x.id !== t.dataset.id);
          shopForm = null;
          render();
          saveNow();
        }
        break;
      case 'saveItem': {
        if (!meta) break;
        const box = t.closest('[data-form]');
        const get = (f) => box.querySelector(`[data-f="${f}"]`).value.trim();
        const name = get('name');
        const price = Math.round(Number(get('price')));
        if (!name) { toast('warning', 'ใส่ชื่อสินค้าก่อน'); break; }
        if (!Number.isFinite(price) || price < 0) { toast('warning', 'ใส่ราคาเป็นตัวเลข'); break; }
        const id = t.dataset.id;
        const hit = id && meta.shop.custom.find((x) => x.id === id);
        if (hit) { hit.name = name; hit.price = price; hit.desc = get('desc'); shopForm = null; }
        else { meta.shop.custom.push({ id: newItemId(), name, price, desc: get('desc') }); shopForm = '@new'; }
        applyPhoneCtx();
        render();
        saveNow();
        break;
      }
      case 'relNew': relForm = '@new'; render(); break;
      case 'relCreate': {
        if (!meta) break;
        const box = t.closest('[data-form]');
        const name = box.querySelector('[data-f="name"]').value.trim();
        const type = box.querySelector('[data-f="type"]').value.trim();
        if (!name) { toast('warning', 'ใส่ชื่อตัวละครก่อน'); break; }
        const exists = (n) => String(n).trim().toLowerCase() === name.toLowerCase();
        if (Object.keys(cur.state.rel || {}).some(exists)) { toast('warning', 'มีตัวละครนี้อยู่แล้ว'); break; }
        meta.customRel[name] = { type, bond: 0 };
        relForm = null;
        imgMenu = `rel:${name}`;
        rebuild();
        render();
        saveNow();
        break;
      }
      case 'relEdit': relForm = t.dataset.name; render(); break;
      case 'saveRel': {
        const c = meta?.customRel?.[t.dataset.name];
        if (!c) break;
        const box = t.closest('[data-form]');
        const get = (f) => box.querySelector(`[data-f="${f}"]`).value.trim();
        c.type = get('type');
        c.stage = get('stage');
        c.bond = Math.max(0, Number(get('bond')) || 0);
        relForm = null;
        rebuild();
        render();
        saveNow();
        break;
      }
      case 'relDel':
        if (meta && confirm('ลบตัวละครที่เพิ่มไว้นี้?')) {
          delete meta.customRel[t.dataset.name];
          relForm = null;
          imgMenu = null;
          rebuild();
          render();
          saveNow();
        }
        break;
      case 'syncNow':
        (async () => {
          try { await ctx().reloadCurrentChat?.(); toast('success', 'โหลดข้อมูลล่าสุดแล้ว'); }
          catch (err) { console.warn('[Bot Console] reload failed', err); toast('error', 'โหลดแชทไม่สำเร็จ'); }
        })();
        break;
      case 'edit': editing = t.dataset.key; render(); break;
      case 'cancel': editing = null; render(); break;
      case 'save': commitEdit(); break;
      default: break;
    }
  });

  panel.addEventListener('error', (e) => {
    const img = e.target;
    if (!img?.classList?.contains('bc-rimg')) return;
    let list = [];
    try { list = JSON.parse(img.dataset.c || '[]'); } catch { }
    const next = Number(img.dataset.i || 0) + 1;
    if (next < list.length) { img.dataset.i = String(next); img.src = list[next]; }
    else img.remove();
  }, true);

  panel.addEventListener('keydown', (e) => {
    if (e.target.classList?.contains('bcp-ta')) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isTouch()) { e.preventDefault(); phoneSend(); }
      return;
    }
    if (e.target.tagName !== 'INPUT' || !e.target.classList?.contains('bc-input') || e.isComposing) return;
    if (e.key === 'Enter') e.target.closest('[data-form]')?.querySelector('[data-primary]')?.click();
    if (e.key === 'Escape') { editing = null; skillForm = null; relForm = null; urlFor = null; phoneForm = false; shopForm = null; missionForm = null; apptForm = null; giftFor = null; render(); }
  });

  panel.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset?.act === 'regexToggle') {
      const done = await setRegexEnabled(t.dataset.scope, t.dataset.key, t.checked);
      if (!done) t.checked = !t.checked;
      try { rebuild(); } catch { }
      render();
      return;
    }
    const meta = getMeta();
    if (!meta) return;
    if (t.dataset?.act === 'appointOn') {
      meta.appointOn = t.checked;
      save();
      applyApptPrompt();
      return;
    }
    if (t.dataset?.act === 'thoughtsOn') {
      meta.thoughtsOn = t.checked;
      save();
      applyThoughtPrompt();
      return;
    }
    if (t.dataset?.act === 'autoOn') {
      ensureAuto(meta.phone, 0).on = t.checked;
      if (t.checked) meta.phone.auto.lastLen = (ctx().chat || []).length;
      save();
      return;
    }
    if (t.dataset?.act === 'autoEvery') {
      ensureAuto(meta.phone, 0).every = Number(t.value) || 3;
      save();
      return;
    }
    if (t.dataset?.act === 'phoneShare') {
      meta.phone.share = t.checked;
      save();
      applyPhoneCtx();
      return;
    }
    if (t.dataset?.act === 'toggle') {
      meta.hidden[t.dataset.key] = !t.checked;
      save();
      applyUi();
    }
  });
}

function bindEvents() {
  const c = ctx();
  const et = c.eventTypes || c.event_types || {};
  ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'GENERATION_ENDED', 'CHARACTER_EDITED']
    .forEach((n) => { if (et[n]) c.eventSource.on(et[n], refresh); });
  ['MESSAGE_RECEIVED', 'GENERATION_ENDED'].forEach((n) => { if (et[n]) c.eventSource.on(et[n], maybeAuto); });
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('#user_avatar_block .avatar-container')) setTimeout(refresh, 400);
  });
}

jQuery(() => {
  if (!window.SillyTavern?.getContext) {
    console.error('[Bot Console] SillyTavern.getContext() not found - SillyTavern is too old.');
    return;
  }
  mountUi();
  bindEvents();
  refresh();
  mountApiDrawer();
  applySkin();
  watchChat(applyChatSkin);
  initMemory();
  void setLicense(extSlot().license).then(async (valid) => {
    if (!valid) return;
    applyCfg();
    await initMemory();
    render();
  }).catch((e) => console.warn('[Bot Console] saved license verification failed', e));
});
