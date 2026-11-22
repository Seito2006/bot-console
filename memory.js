const BOND = /<HI3_BOND>([\s\S]*?)<\/HI3_BOND>/gi;
const QLOG = /<HI3_QLOG>([\s\S]*?)<\/HI3_QLOG>/gi;
const MISSION = /<HI3_MISSION>([\s\S]*?)<\/HI3_MISSION>/gi;
const TRACKER = /[ \t]*<(HI3_BOND|HI3_QLOG)>[\s\S]*?<\/\1>[ \t]*\r?\n?/gi;

export function stripTracker(text) {
  const s = String(text ?? '');
  if (!/<HI3_(BOND|QLOG)>/i.test(s)) return s;
  const out = s.replace(TRACKER, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  return out.trim() ? out : s;
}

export function stripPrompt(messages) {
  if (!Array.isArray(messages)) return 0;
  let last = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') { last = i; break; }
  }
  let n = 0;
  messages.forEach((m, i) => {
    if (!m || m.role !== 'assistant' || i === last) return;
    if (typeof m.content === 'string') {
      const s = stripTracker(m.content);
      if (s !== m.content) { m.content = s; n++; }
    } else if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p && typeof p.text === 'string') {
          const s = stripTracker(p.text);
          if (s !== p.text) { p.text = s; n++; }
        }
      }
    }
  });
  return n;
}

const nameOf = (body) => String(body).split('|')[0].trim().toLowerCase();

export function collectTracker(texts) {
  const bonds = new Map();
  for (const t of texts) {
    for (const m of String(t).matchAll(BOND)) {
      const k = nameOf(m[1]);
      if (k) { bonds.delete(k); bonds.set(k, m[1].trim()); }
    }
  }
  let qi = -1;
  for (let i = texts.length - 1; i >= 0; i--) {
    if (new RegExp(QLOG.source, 'i').test(String(texts[i]))) { qi = i; break; }
  }
  let qlogs = [];
  if (qi >= 0) {
    qlogs = [...String(texts[qi]).matchAll(QLOG)].map((m) => m[1].trim());
    const closed = new Set();
    for (let j = qi; j < texts.length; j++) {
      for (const m of String(texts[j]).matchAll(MISSION)) {
        const p = m[1].split('::').map((x) => x.trim());
        const st = (p[0] || '').toUpperCase();
        if (st === 'COMPLETE' || st === 'FAILED') closed.add((p[1] || '').toLowerCase());
      }
    }
    qlogs = qlogs.filter((l) => !closed.has(nameOf(l)));
  }
  return { bonds: [...bonds.values()], qlogs };
}

export function memoryBlock({ bonds, qlogs }) {
  if (!bonds.length && !qlogs.length) return '';
  const lines = [
    '[Tracker memory. These are the latest tracker values; the older tracker lines were removed from the chat history to save space.',
    'Continue from exactly these values, and keep writing your own tracker lines at the end of every in-world reply as the rules say. Never mention this note.]',
    ...bonds.map((b) => `<HI3_BOND>${b}</HI3_BOND>`),
    ...qlogs.map((q) => `<HI3_QLOG>${q}</HI3_QLOG>`),
  ];
  return lines.join('\n');
}
