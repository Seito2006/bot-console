const t = (s) => String(s ?? '').trim();
const keyOf = (n) => t(n).toLowerCase();

export function eventsBlock(events, user) {
  const list = (events || []).map((e) => `- ${e.text}`);
  if (!list.length) return '';
  return `[Just happened in ${user}'s console (real actions by ${user}, not yet shown in the story). Let the next reply acknowledge them naturally, in character, without repeating them afterwards:\n${list.join('\n')}]`;
}

export function applyBar(raw, delta) {
  const m = String(raw ?? '').match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const max = Number(m[2]);
  if (!max) return null;
  const v = Math.max(0, Math.min(max, Number(m[1]) + Number(delta)));
  return `${Math.round(v)}/${max}`;
}

export const giftBond = (item) => (Number.isFinite(Number(item?.bond)) ? Number(item.bond) : 2);

const BCA_RE = /<!--\s*BCA\b([\s\S]*?)-->/gi;

export function appointPrompt(user) {
  return `[Appointments: whenever a character and ${user} newly agree on a specific plan to meet or do something at a future time, add one hidden block at the very end of the reply (after any other hidden block):
<!--BCA
Name | date | time | place | short title
-->
Rules: one line per NEW plan, written only in the reply where it is agreed, never repeated later. "Name" = the character who is part of the plan (as named in the story). Write date and time in exactly the format the story's HUD uses, leave a field empty if unknown (keep the | separators). The title is a few words in the story's language. Never write "-->" inside a line. Do not mention this block inside the story.]`;
}

export function parseAppts(text) {
  const out = [];
  for (const b of String(text ?? '').matchAll(BCA_RE)) {
    for (const line of b[1].split(/\r?\n/)) {
      const p = line.split('|').map(t);
      if (p.length < 2 || !p.some(Boolean)) continue;
      const [who, date, time, place, ...rest] = p;
      const title = rest.join(' | ');
      if (!title && !place && !date) continue;
      out.push({ who, date, time, place, title: title || place || '' });
    }
  }
  return out;
}

export const apptKey = (a) => ['a', keyOf(a.who), keyOf(a.date), keyOf(a.time), keyOf(a.title)].join('|');

const nums = (s) => (String(s ?? '').match(/\d+/g) || []).map(Number);
const minutes = (s) => {
  const m = String(s ?? '').match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function dateCmp(a, b) {
  const x = t(a);
  const y = t(b);
  if (!x || !y) return null;
  if (keyOf(x) === keyOf(y)) return 0;
  const p = nums(x);
  const q = nums(y);
  if (!p.length || p.length !== q.length) return null;
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] < q[i] ? -1 : 1;
  return 0;
}

export function whenState(a, now) {
  const d = dateCmp(a.date, now?.date);
  if (d === null) return 'unknown';
  if (d < 0) return 'late';
  if (d > 0) return 'soon';
  const at = minutes(a.time);
  if (at === null) return 'due';
  const cur = minutes(now?.time);
  if (cur === null) return 'unknown';
  return cur >= at ? 'due' : 'soon';
}

export function buildBoardPrompt({ user, player, rels = [], active = [], avoid = [], currency = 'Coin' }) {
  const when = [player?.date, player?.time].filter(Boolean).join(' ');
  const info = [
    when && `Story date/time: ${when}`,
    player?.location && `${user}'s location: ${player.location}`,
    player?.party && `Party: ${player.party}`,
    rels.length && `Known characters: ${rels.join(', ')}`,
    active.length && `Missions ${user} already has (do not repeat): ${active.join('; ')}`,
    avoid.length && `Missions already finished or turned down (do not repeat): ${avoid.slice(-12).join('; ')}`,
  ]
    .filter(Boolean)
    .join('\n');
  return `[MISSION BOARD - side task, not part of the narrated scene]
Offer ${user} 3 NEW missions they could take right now, drawn from the current situation in the story (character sheets, lore, events, places, characters and unresolved threads). Each must fit the world and the moment, be different from the others in kind (for example combat, investigation, escort/delivery, a personal request from a character), and be doable inside the story.
${info}

For each mission give: a short title, a rank (D, C, B, A or S - harder = higher), one sentence objective, how many steps/targets it takes (a whole number 1-6), a reward in ${currency} (a whole number, roughly 60 per rank step above D, plus a little extra for hard ones; D about 60-150, S about 500-900), and optionally the character who asks for it ("giver", from the known characters, or empty).
Language: the story's language (Thai unless the story uses another).

Reply with JSON only, nothing else:
[{"title":"...","rank":"C","objective":"...","steps":3,"reward":250,"giver":"Name or empty"}, ...]`;
}

export function parseBoard(raw) {
  const s = String(raw ?? '').replace(/<(think(?:ing)?|thought|reasoning|analysis)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const a = s.indexOf('[');
  const b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  let j;
  try {
    j = JSON.parse(s.slice(a, b + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(j)) return [];
  return j
    .map((o) => ({
      title: t(o?.title),
      rank: t(o?.rank).toUpperCase().slice(0, 12),
      objective: t(o?.objective),
      steps: Math.max(0, Math.min(10, Math.round(Number(o?.steps)) || 0)),
      reward: Math.max(0, Math.round(Number(o?.reward)) || 0),
      giver: t(o?.giver),
    }))
    .filter((o) => o.title)
    .slice(0, 4);
}
