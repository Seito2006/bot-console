export const MAX_MSGS = 400;
export const PROMPT_MSGS = 40;
export const SHARE_MSGS = 16;

export const keyOf = (n) => String(n ?? '').trim().toLowerCase();
const t = (s) => String(s ?? '').trim();
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function ensurePhone(meta) {
  if (!meta.phone || typeof meta.phone !== 'object') meta.phone = {};
  const p = meta.phone;
  if (!p.threads || typeof p.threads !== 'object') p.threads = {};
  if (p.share === undefined) p.share = true;
  return p;
}

export function threadOf(phone, name, create = false) {
  const k = keyOf(name);
  if (!k) return null;
  let th = phone.threads[k];
  if (!th && create) th = phone.threads[k] = { name: t(name), msgs: [], unread: 0, updated: 0 };
  return th || null;
}

export function pushMsg(phone, name, { from, text, sd = '', st = '', at = 0 }) {
  const th = threadOf(phone, name, true);
  const m = { id: uid(), from: from === 'me' ? 'me' : 'them', text: t(text), ts: Date.now(), sd: t(sd), st: t(st), at };
  th.msgs.push(m);
  if (th.msgs.length > MAX_MSGS) th.msgs.splice(0, th.msgs.length - MAX_MSGS);
  th.updated = m.ts;
  return m;
}

export function totalUnread(phone) {
  return Object.values(phone?.threads || {}).reduce((n, th) => n + (Number(th.unread) || 0), 0);
}

export function clock(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const stamp = (m) => [m.sd, m.st].filter(Boolean).join(' ') || clock(m.ts);
const lineOf = (m, user, char) => `[${stamp(m)}] ${m.from === 'me' ? user : char}: ${m.text}`;

const NOISE = '(?:HI3_[A-Za-z]+|HI_Char|BC|think(?:ing)?|thought|reasoning|analysis|status|hud)';

export function stripNoise(text) {
  let s = String(text ?? '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(new RegExp(`<(${NOISE})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi'), ' ');
  s = s.replace(new RegExp(`<${NOISE}\\b[^>]*>[\\s\\S]*$`, 'i'), ' ');
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/<\/?[A-Za-z][^>]*>/g, ' ');
  return s;
}

function dropSpeaker(line, names) {
  let s = line.replace(/^\s*\[[^\]\n]{0,40}\]\s*/, '');
  for (const n of names) {
    if (!n) continue;
    s = s.replace(new RegExp(`^\\s*(?:\\[${reEsc(n)}\\]|\\*{0,2}${reEsc(n)}\\*{0,2})\\s*[:：]\\s*`, 'i'), '');
  }
  return s;
}

const unwrap = (s) => {
  const x = s.trim();
  const pairs = [['"', '"'], ['“', '”'], ['「', '」'], ['『', '』'], ['‘', '’']];
  for (const [a, b] of pairs) if (x.length > 2 && x.startsWith(a) && x.endsWith(b) && !x.slice(1, -1).includes(a)) return x.slice(1, -1).trim();
  return x;
};

export function cleanReply(raw, { char = '', user = '', aliases = [] } = {}) {
  const s = stripNoise(raw).replace(/\r/g, '').trim();
  if (!s) return [];
  let parts = s.split(/^\s*(?:-{3,}|\|{3})\s*$/m);
  if (parts.length === 1) parts = s.split(/\n\s*\n/);
  const out = [];
  for (let p of parts) {
    p = dropSpeaker(p.trim(), [char, user, ...aliases]);
    p = unwrap(p).replace(/\n{3,}/g, '\n\n').trim();
    if (!p) continue;
    if (/^\*[^*]+\*$/.test(p)) continue;
    out.push(p);
  }
  return out.slice(0, 6);
}

export function cleanThought(raw, { char = '', user = '', aliases = [] } = {}) {
  let s = stripNoise(raw).replace(/\r/g, '').trim();
  if (!s) return '';
  s = s
    .split(/\n/)
    .map((l) => dropSpeaker(l, [char, user, ...aliases]))
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  s = unwrap(s);
  if (/^\*[^*]+\*$/.test(s)) s = s.slice(1, -1).trim();
  return s;
}

function matcher(aliases) {
  const latin = [];
  const other = [];
  for (const a of aliases) (/^[\x20-\x7e]+$/.test(a) ? latin : other).push(a);
  const res = latin.map((a) => new RegExp(`(^|[^a-z0-9])${reEsc(a)}(?![a-z0-9])`));
  return (text) => !!text && (res.some((r) => r.test(text)) || other.some((a) => text.includes(a)));
}

export function aliasesFor(name, extra = []) {
  const set = new Set();
  const n = keyOf(name);
  if (n) set.add(n);
  for (const w of n.split(/[\s()[\],/·]+/)) {
    const latin = /^[\x20-\x7e]+$/.test(w);
    if (w && (latin ? w.length >= 3 : w.length >= 2)) set.add(w);
  }
  for (const e of extra || []) if (keyOf(e)) set.add(keyOf(e));
  return [...set];
}

export function sceneChecker(player, chat, depth = 2) {
  const hud = [player?.party, player?.scene].map((x) => String(x ?? '')).join(' ').toLowerCase().trim();
  const recent = (chat || [])
    .slice(-depth)
    .map((m) => stripNoise(m?.mes).toLowerCase())
    .join('\n');
  return (aliases) => {
    const test = matcher(aliases);
    if (hud && test(hud)) return { here: true, via: 'hud' };
    if (test(recent)) return { here: true, via: 'chat' };
    return { here: false, via: hud ? 'hud' : recent.trim() ? 'chat' : 'none' };
  };
}

export function chatSig(chat) {
  const list = chat || [];
  const last = String(list[list.length - 1]?.mes ?? '');
  let h = 0;
  for (let i = 0; i < last.length; i++) h = (h * 31 + last.charCodeAt(i)) | 0;
  return `${list.length}:${h}`;
}

function sceneLines(player, user, char, here) {
  const p = player || {};
  const when = [p.date, p.time].filter(Boolean).join(' ');
  return [
    when && `Story date/time: ${when}`,
    p.location && `Current location: ${p.location}`,
    p.weather && `Weather: ${p.weather}`,
    here === true && `${char} is in the same scene as ${user} right now.`,
    here === false && `${char} is NOT in the current scene (they are somewhere else).`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPhonePrompt({ user, char, player, here, msgs = [], mode = 'reply', note = '' }) {
  const recent = msgs.slice(-PROMPT_MSGS);
  const log = recent.length ? recent.map((m) => lineOf(m, user, char)).join('\n') : '(no messages yet)';
  const task =
    mode === 'initiate'
      ? `${char} decides to text ${user} first, on their own initiative, about something that fits this moment of the story. Write that opening message.`
      : mode === 'gift'
        ? `${user} just gave ${char} a gift: "${note}". ${char} is not with ${user} right now, so they react by text, exactly as they would (surprise, thanks, teasing, shyness... whatever fits their personality and bond with ${user}). Write that message.`
        : `Reply to ${user}'s latest message(s).`;
  return `[PHONE MESSAGES - side task, not part of the narrated scene]
${user} is chatting with ${char} in a smartphone messaging app. Everything established in the story so far (character sheets, lore, events, relationships, who knows what) stays true and must stay consistent.
${sceneLines(player, user, char, here)}

Write ONLY ${char}'s next text message(s) to ${user}.
- Text exactly the way ${char} would: voice, personality, speech habits, the current relationship with ${user}, the mood of the story right now.
- Language: the same as the existing messages and the story (Thai unless the story uses another language).
- Real chat style: short and natural, usually 1-3 messages. Emoji or stickers only if they suit ${char}.
- Separate each message with a line containing only ---
- Never write ${user}'s words, actions or decisions. No narration, no *actions*, no quotation marks, no OOC notes, no status/HUD blocks, tags, HTML or code. Do not continue the roleplay scene itself.
- If ${user} asks for real-world facts, answer using whatever knowledge/search ability your instructions give you, in ${char}'s voice.

Phone conversation so far (oldest first):
${log}

Task: ${task}`;
}

export function buildThoughtPrompt({ user, char, player, here, msgs = [] }) {
  const recent = msgs.slice(-10);
  const phone = recent.length
    ? `\nRecent phone messages between them (context only):\n${recent.map((m) => lineOf(m, user, char)).join('\n')}\n`
    : '';
  return `[INNER THOUGHTS - side task, not part of the narrated scene]
Reveal what ${char} is secretly thinking and feeling right now, at this exact moment of the story (look at the latest messages), about what is happening and about ${user}.
${sceneLines(player, user, char, here)}
${phone}
Rules:
- First person, in ${char}'s own voice and personality. Language: Thai unless the story uses another language.
- 2-5 sentences. Honest and private: nobody in the story can hear it, so it may contradict what ${char} says out loud.
- Consistent with the story, with ${char}'s own knowledge (never let them know what they could not know) and with their current relationship to ${user}.
- No narration, no *actions*, no quotation marks, no status/HUD blocks, tags or HTML. Do not advance the story and do not speak or think for ${user}.`;
}

export function phoneContextBlock(phone, user) {
  const all = [];
  for (const th of Object.values(phone?.threads || {})) {
    for (const m of th.msgs || []) all.push({ m, name: th.name });
  }
  if (!all.length) return '';
  all.sort((a, b) => a.m.ts - b.m.ts);
  const lines = all.slice(-SHARE_MSGS).map(({ m, name }) => {
    const text = m.text.length > 220 ? `${m.text.slice(0, 220)}…` : m.text.replace(/\n+/g, ' ');
    const who = m.from === 'me' ? `${user} -> ${name}` : `${name} -> ${user}`;
    return `[${stamp(m)}] ${who}: ${text}`;
  });
  return `[Smartphone message log: texts ${user} exchanged on their phone, outside the narrated scene (oldest first). They really happened: the characters involved remember them, others only know what they were told.\n${lines.join('\n')}]`;
}

const BCT_RE = /<!--\s*BCT\b([\s\S]*?)-->/gi;

export function parseThoughts(text) {
  const blocks = [...String(text ?? '').matchAll(BCT_RE)];
  if (!blocks.length) return null;
  const out = {};
  for (const line of blocks[blocks.length - 1][1].split(/\r?\n/)) {
    const m = line.match(/^\s*[-*•]?\s*([^:：\n]{1,60}?)\s*[:：]\s*(\S[\s\S]*?)\s*$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

export function latestThoughts(chat) {
  const list = chat || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || m.is_user || m.is_system) continue;
    const map = parseThoughts(m.mes);
    return map ? { at: i, map } : null;
  }
  return null;
}

export function thoughtFor(map, name, extra = []) {
  if (!map) return '';
  const want = aliasesFor(name, extra);
  for (const [k, v] of Object.entries(map)) {
    if (keyOf(k) === keyOf(name) || aliasesFor(k).some((a) => want.includes(a))) return v;
  }
  return '';
}

export function thoughtsPrompt(user) {
  return `[Inner thoughts: at the very end of every reply, after everything else, add one hidden block in exactly this form:
<!--BCT
Name: first-person inner thought, 1-2 sentences, in that character's own voice and the story's language
Name: ...
-->
Rules: write one line for every character (never ${user}) who is physically present in the scene right now, and NO line for anyone who is away or off-scene. Use each character's name exactly as in the story. Each thought stays on a single line, is honest and private (it may contradict what they say out loud), and never uses "-->". Never write ${user}'s thoughts. Do not mention this block inside the story.]`;
}

export const AUTO_EVERY_DEFAULT = 3;
export const AUTO_MAX_BUBBLES = 4;

export function ensureAuto(phone, chatLen = 0) {
  if (!phone.auto || typeof phone.auto !== 'object') phone.auto = {};
  const a = phone.auto;
  if (a.on === undefined) a.on = true;
  const ev = Math.round(Number(a.every));
  a.every = ev >= 1 && ev <= 20 ? ev : AUTO_EVERY_DEFAULT;
  if (!Number.isFinite(a.lastLen)) a.lastLen = chatLen;
  return a;
}

const bondTxt = (c) => (c.max ? `${c.bond}/${c.max}` : String(c.bond));

export function buildAutoPrompt({ user, player, cands }) {
  const when = [player?.date, player?.time].filter(Boolean).join(' ');
  const scene = [
    when && `Story date/time: ${when}`,
    player?.location && `${user}'s location: ${player.location}`,
    player?.weather && `Weather: ${player.weather}`,
  ]
    .filter(Boolean)
    .join('\n');
  const list = cands
    .map((c) => {
      const last = c.last
        ? `last text: ${c.last.from === 'me' ? `${user} wrote` : 'they wrote'} "${String(c.last.text).replace(/\s+/g, ' ').slice(0, 80)}"${c.last.when ? ` (${c.last.when})` : ''}${c.waiting ? ' - ' + user + ' has NOT replied yet' : ''}${Number.isFinite(c.gap) ? `, ${c.gap} chat messages ago` : ''}`
        : 'never texted yet';
      return `- ${c.name} | ${c.type || 'relationship unknown'} | bond ${bondTxt(c)} | ${c.here ? 'in the same scene as ' + user : 'away from the scene'} | ${last}`;
    })
    .join('\n');
  return `[AUTO TEXT CHECK - side task, not part of the narrated scene]
${user} has a smartphone messaging app. Decide whether any character would REALLY text ${user} right now, on their own initiative, given everything in the story so far (character sheets, lore, events, relationships, who knows what).
${scene}

Characters who could text:
${list}

How to decide:
- The default answer is NO. Most moments need no text. Send only when there is a concrete reason in the story right now: something that just happened that they would react to, a plan/promise/appointment, worry after danger, news or information, thanks or an apology, an invitation, or a habit that truly fits their personality and bond. Longer silence plus a strong bond can also be a reason.
- Someone in the same scene normally speaks face to face; only pick them if they have a private reason to text instead (embarrassment, a secret, someone else is listening).
- Someone ${user} has not met, or whose bond is very low, does not text without a story reason. Respect time of day, where each character is and what they are doing.
- Do not pile up: if their last text is still unanswered, stay silent unless a lot of story time has passed or something important changed. Do not repeat the topic of a text that was already sent.
- Choose at most ONE character, the one with the strongest reason.

If someone texts: write ONLY their message(s) to ${user}, exactly as that character would text (voice, habits, current relationship, the mood of the story). 1-3 short bubbles, in the language of the story (Thai unless the story uses another language). Emoji only if they suit the character. Never write ${user}'s words, actions or decisions. No narration, no *actions*, no OOC, no status/HUD blocks, tags or HTML.

Reply with JSON only, nothing else:
{"send":false}
or
{"send":true,"from":"<name exactly as listed above>","messages":["first bubble","second bubble"]}`;
}

export function parseAuto(raw) {
  let s = String(raw ?? '').replace(/<(think(?:ing)?|thought|reasoning|analysis)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return /\bno\b|ไม่/i.test(s) && !s.trim().includes('{') ? { send: false, from: '', messages: [] } : null;
  let j;
  try {
    j = JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const msgs = (Array.isArray(j.messages) ? j.messages : typeof j.message === 'string' ? [j.message] : [])
    .map((x) => t(x))
    .filter(Boolean);
  const from = t(j.from);
  const send = j.send === true && !!from && msgs.length > 0;
  return { send, from, messages: msgs.slice(0, AUTO_MAX_BUBBLES) };
}
