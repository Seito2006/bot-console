export const PROVIDERS = {
  custom: { label: 'Custom (OpenAI-compatible)', keyHint: 'sk-...', modelHint: 'ชื่อโมเดลของเซิร์ฟเวอร์' },
  google: { label: 'Google AI Studio', keyHint: 'AIza...', modelHint: 'เช่น gemini-2.5-flash' },
  openrouter: { label: 'OpenRouter', keyHint: 'sk-or-...', modelHint: 'เช่น openai/gpt-4o-mini' },
};
export const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export const API_DEFAULT = {
  on: false,
  provider: 'custom',
  p: {
    custom: { url: '', key: '', model: '', models: [] },
    google: { key: '', model: '', models: [] },
    openrouter: { key: '', model: '', models: [] },
  },
  temp: 0.8,
  maxTokens: 2048,
  history: 20,
};

export function normBase(u) {
  return String(u || '').trim().replace(/\/+$/, '').replace(/\/(chat\/completions|models)$/i, '').replace(/\/+$/, '');
}

export function apiReady(a) {
  if (!String(a?.model || '').trim()) return false;
  return a.provider === 'custom' ? !!normBase(a.url) : !!String(a.key || '').trim();
}

const baseOf = (a) => (a.provider === 'google' ? GOOGLE_BASE : a.provider === 'openrouter' ? OPENROUTER_BASE : normBase(a.url));

function headers(a) {
  if (a.provider === 'google') return { 'Content-Type': 'application/json', ...(a.key ? { 'x-goog-api-key': a.key } : {}) };
  const h = { 'Content-Type': 'application/json', ...(a.key ? { Authorization: `Bearer ${a.key}` } : {}) };
  if (a.provider === 'openrouter') { h['HTTP-Referer'] = globalThis.location?.origin || 'http://localhost'; h['X-Title'] = 'Bot Console'; }
  return h;
}

async function http(url, opt) {
  try {
    return await fetch(url, opt);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new Error('เชื่อมต่อ API ไม่ได้ (ตรวจ Base URL เครือข่าย หรือ CORS ของเซิร์ฟเวอร์ปลายทาง)');
  }
}

async function errorOf(res) {
  let raw = '';
  try { raw = await res.text(); } catch { }
  let msg = raw;
  try { const j = JSON.parse(raw); msg = j?.error?.message || j?.message || raw; } catch { }
  const hint = res.status >= 500 ? ' — ปัญหาอยู่ที่เซิร์ฟเวอร์ปลายทางหรือพร็อกซี (เช็กว่าเชื่อมต่อโมเดลนี้ได้ หรือลองเปลี่ยนโมเดล)' : '';
  const e = new Error(`API ตอบ ${res.status}${msg ? `: ${String(msg).replace(/\s+/g, ' ').slice(0, 220)}` : ''}${hint}`);
  e.raw = String(raw);
  e.status = res.status;
  return e;
}

export async function fetchModels(a, signal) {
  if (a.provider === 'custom' && !baseOf(a)) throw new Error('ใส่ Base URL ก่อน');
  if (a.provider !== 'custom' && !String(a.key || '').trim()) throw new Error('ใส่ API Key ก่อน');
  const url = a.provider === 'google' ? `${GOOGLE_BASE}/models?pageSize=1000` : `${baseOf(a)}/models`;
  const res = await http(url, { headers: headers(a), signal });
  if (!res.ok) throw await errorOf(res);
  const j = await res.json();
  let arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
  if (a.provider === 'google') arr = arr.filter((m) => !m?.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'));
  const ids = arr
    .map((x) => (typeof x === 'string' ? x : x?.id || x?.name || x?.model))
    .filter(Boolean)
    .map((s) => String(s).replace(/^models\//, ''));
  return [...new Set(ids)].sort((x, y) => x.localeCompare(y));
}

const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

async function chatGoogle(a, messages, signal) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
  const gen = {};
  if (num(a.temp) !== null) gen.temperature = num(a.temp);
  if (num(a.maxTokens) !== null) gen.maxOutputTokens = num(a.maxTokens);
  const body = {
    contents,
    generationConfig: gen,
    safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
      .map((category) => ({ category, threshold: 'BLOCK_NONE' })),
  };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  const model = encodeURIComponent(String(a.model).replace(/^models\//, ''));
  const res = await http(`${GOOGLE_BASE}/models/${model}:generateContent`, { method: 'POST', headers: headers(a), body: JSON.stringify(body), signal });
  if (!res.ok) throw await errorOf(res);
  const j = await res.json();
  const cand = j?.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => !p?.thought).map((p) => p?.text || '').join('');
  if (text.trim()) return text;
  if (j?.promptFeedback?.blockReason) throw new Error(`Google บล็อกคำขอนี้: ${j.promptFeedback.blockReason}`);
  if (cand?.finishReason === 'MAX_TOKENS') throw new Error('โมเดลคิดจนเต็มขีด Max tokens ก่อนจะตอบ ลองเพิ่ม Max tokens');
  if (cand?.finishReason && cand.finishReason !== 'STOP') throw new Error(`Google หยุดตอบ: ${cand.finishReason}`);
  throw new Error('โมเดลส่งข้อความว่างกลับมา');
}

const textOf = (c) => (Array.isArray(c) ? c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('') : typeof c === 'string' ? c : '');

function textFromJson(j) {
  const ch = j?.choices?.[0];
  return textOf(ch?.message?.content) || (typeof ch?.text === 'string' ? ch.text : '');
}

function readSse(raw, acc) {
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const d = t.slice(5).trim();
    if (!d || d === '[DONE]') continue;
    let j;
    try { j = JSON.parse(d); } catch { continue; }
    if (j?.error) throw new Error(`API: ${String(j.error.message || j.error).replace(/\s+/g, ' ').slice(0, 220)}`);
    const ch = j?.choices?.[0];
    acc.text += textOf(ch?.delta?.content) || (typeof ch?.text === 'string' ? ch.text : '') || textOf(ch?.message?.content);
    acc.thought += textOf(ch?.delta?.reasoning_content) || textOf(ch?.delta?.reasoning);
    if (ch?.finish_reason) acc.finish = ch.finish_reason;
  }
  return acc;
}

async function readStream(res) {
  const acc = { text: '', finish: '', thought: '' };
  if (!res.body?.getReader) return readSse(await res.text(), acc);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const cut = buf.lastIndexOf('\n');
    if (cut >= 0) {
      readSse(buf.slice(0, cut + 1), acc);
      buf = buf.slice(cut + 1);
    }
  }
  return readSse(`${buf}\n`, acc);
}

const ST_URL = '/api/backends/chat-completions/generate';

function stHeaders() {
  try {
    const c = globalThis.SillyTavern?.getContext?.();
    const h = c?.getRequestHeaders?.();
    return h ? { ...h, 'Content-Type': 'application/json' } : null;
  } catch { return null; }
}

function stBody(a, body) {
  const out = { ...body, chat_completion_source: 'custom', custom_url: baseOf(a) };
  if (String(a.key || '').trim()) out.custom_include_headers = `Authorization: "Bearer ${String(a.key).trim().replace(/["\\\r\n]/g, '')}"`;
  return out;
}

function tooShortErr(finish) {
  const e = new Error(finish === 'length' ? 'โมเดลคิดจนเต็มขีด Max tokens ก่อนจะตอบ' : 'โมเดลส่งข้อความว่างกลับมา');
  e.empty = true;
  e.finish = finish || '';
  return e;
}

async function oneRequest(a, messages, signal, plan, opts) {
  const body = { model: a.model, messages, stream: plan.mode === 'stream' };
  if (opts.temperature !== null) body.temperature = opts.temperature;
  if (opts.tokens !== null) body[opts.tokenKey] = opts.tokens;
  let res;
  if (plan.route === 'st') {
    res = await http(ST_URL, { method: 'POST', headers: stHeaders(), body: JSON.stringify(stBody(a, body)), signal });
  } else {
    res = await http(`${baseOf(a)}/chat/completions`, { method: 'POST', headers: headers(a), body: JSON.stringify(body), signal });
  }
  if (!res.ok) throw await errorOf(res);
  const type = res.headers.get('content-type') || '';
  if (plan.mode === 'stream' && !/application\/json/i.test(type)) {
    const acc = await readStream(res);
    if (!acc.text.trim()) throw tooShortErr(acc.finish || (acc.thought ? 'length' : ''));
    return acc.text;
  }
  const j = await res.json();
  const out = textFromJson(j);
  if (!String(out).trim()) throw tooShortErr(j?.choices?.[0]?.finish_reason);
  return String(out);
}

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener?.('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
});

export async function chat(a, messages, signal) {
  if (a.provider === 'google') return chatGoogle(a, messages, signal);
  const opts = { temperature: num(a.temp), tokens: num(a.maxTokens), tokenKey: 'max_tokens' };
  const routes = a.provider === 'custom' && stHeaders() ? ['st', 'direct'] : ['direct'];
  const plans = [];
  for (const mode of ['stream', 'json']) for (const route of routes) plans.push({ route, mode });
  const errors = [];
  for (const plan of plans) {
    let boosts = 0;
    let retried5xx = false;
    for (let step = 0; step < 8; step++) {
      try {
        return await oneRequest(a, messages, signal, plan, opts);
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        const raw = e.raw || '';
        if (e.status === 400 && opts.tokenKey === 'max_tokens' && /max_completion_tokens/i.test(raw)) { opts.tokenKey = 'max_completion_tokens'; continue; }
        if (e.status === 400 && opts.temperature !== null && /temperature/i.test(raw)) { opts.temperature = null; continue; }
        if (e.empty && boosts < 2 && (opts.tokens ?? 0) < 16000) { boosts++; opts.tokens = Math.min(16384, Math.max(4096, (opts.tokens || 1024) * 2)); continue; }
        if (e.status >= 500 && !retried5xx) { retried5xx = true; await sleep(1200, signal); continue; }
        errors.push(e);
        break;
      }
    }
  }
  const first = errors[0];
  const last = errors[errors.length - 1];
  if (!first) throw new Error('API ไม่รับพารามิเตอร์ที่ส่งไป');
  const err = new Error(first === last || first.message === last.message ? first.message : `${first.message} · (ลองทางสำรองแล้ว: ${last.message.slice(0, 160)})`);
  err.status = first.status;
  err.raw = first.raw;
  throw err;
}

const cap = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));

export function buildMessages({ prompt, card = '', persona = '', user = '', summary = '', history = [] }) {
  const sys = `You are the engine behind a roleplay chat's helper features (phone texts, inner thoughts, mission board and similar). Everything in the story context below is true and must stay consistent. Do the side task you are given and follow its output format exactly. Never continue the roleplay on your own.

[Character card]
${cap(card, 8000)}

[Player: ${user}]
${cap(persona, 2000)}

[Console state]
${cap(summary, 3000)}

[Recent story, oldest first]
${history.join('\n\n')}`;
  return [{ role: 'system', content: sys }, { role: 'user', content: prompt }];
}
