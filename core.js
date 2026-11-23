const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function setPath(obj, path, val) {
  const keys = String(path).split('.').map((k) => k.trim()).filter(Boolean);
  if (!keys.length || keys.some((k) => BAD.has(k))) return;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!isObj(cur[keys[i]])) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = val;
}

export function deepMerge(target, src) {
  for (const k of Object.keys(src || {})) {
    if (BAD.has(k)) continue;
    if (isObj(src[k])) {
      if (!isObj(target[k])) target[k] = {};
      deepMerge(target[k], src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}

export function parsePatchText(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      return isObj(j) ? j : null;
    } catch {
      return null;
    }
  }
  const patch = {};
  let any = false;
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^\s*([^:=\n]+?)\s*[:=]\s*(.*?)\s*$/);
    if (!m) continue;
    setPath(patch, m[1], m[2]);
    any = true;
  }
  return any ? patch : null;
}

const BC_PATTERNS = [/<!--\s*BC\b([\s\S]*?)-->/gi, /<BC>([\s\S]*?)<\/BC>/gi];

export function genericParser(text) {
  const found = [];
  for (const re of BC_PATTERNS) {
    for (const m of String(text || '').matchAll(re)) {
      const patch = parsePatchText(m[1]);
      if (patch) found.push({ i: m.index, patch });
    }
  }
  return found.sort((a, b) => a.i - b.i).map((f) => f.patch);
}

const PARSE_MEMO = new WeakMap();
const PARSE_LIMIT = 600;

function parseCached(parse, text) {
  let memo = PARSE_MEMO.get(parse);
  if (!memo) { memo = new Map(); PARSE_MEMO.set(parse, memo); }
  if (text.length < 40) return parse(text);
  let hit = memo.get(text);
  if (!hit) {
    hit = parse(text);
    if (memo.size >= PARSE_LIMIT) memo.delete(memo.keys().next().value);
    memo.set(text, hit);
  }
  return hit;
}

export function computeState(profile, chat, manual, onReply) {
  const state = structuredClone(profile.defaults || {});
  const edits = [...(manual || [])].sort((a, b) => a.at - b.at);
  let mi = 0;
  for (let i = 0; i < chat.length; i++) {
    while (mi < edits.length && edits[mi].at <= i) deepMerge(state, edits[mi++].patch);
    const m = chat[i];
    if (!m || m.is_user || m.is_system) continue;
    for (const parse of profile.parsers) {
      for (const patch of parseCached(parse, m.mes || '')) deepMerge(state, patch);
    }
    onReply?.(m, state);
  }
  while (mi < edits.length) deepMerge(state, edits[mi++].patch);
  return state;
}

export function parseBar(raw) {
  const m = String(raw ?? '').match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const cur = Number(m[1]);
  const max = Number(m[2]);
  if (!max) return null;
  return { cur, max, pct: Math.max(0, Math.min(100, (cur / max) * 100)) };
}
