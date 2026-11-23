const TAG_RE = /<(HI3_HUD|HI3_Status|HI3_BOND|HI3_QLOG|HI3_MISSION|HI_Char)>([\s\S]*?)<\/\1>/gi;

const t = (s) => String(s ?? '').trim();

function normStatus(s) {
  const v = t(s).toLowerCase();
  if (!v) return '';
  if (/^(?:complet(?:e|ed)|done|clear(?:ed)?|finish(?:ed)?|success|สำเร็จ(?:แล้ว)?|เสร็จสิ้น)$/.test(v)) return 'done';
  if (/^(?:fail(?:ed|ure)?|ล้มเหลว)$/.test(v)) return 'failed';
  return v;
}

function status(body) {
  const m = body.match(
    /ID:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*VIT:\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*STAT:\s*(.*?)\s*NOW:\s*([\s\S]*)$/i,
  );
  if (!m) return null;
  const [, name, title, element, weapon, hp, hpMax, corr, corrMax, stat, now] = m;
  return {
    player: {
      name: t(name),
      title: t(title),
      element: t(element),
      weapon: t(weapon),
      hp: `${hp}/${hpMax}`,
      corr: `${corr}/${corrMax}`,
      stat: t(stat),
      now: t(now),
    },
  };
}

function hud(body) {
  const p = body.split('::').map(t);
  if (p.length < 4) return null;
  const [date, time, weather, location, , , , party, scene] = p;
  const player = {};
  if (date) player.date = date;
  if (time) player.time = time;
  if (weather) player.weather = weather;
  if (location) player.location = location;
  if (party) player.party = party;
  if (scene) player.scene = scene;
  return { player };
}

function bond(body) {
  const [name, stage, cur, max, delta, ...note] = body.split('|').map(t);
  if (!name) return null;
  return { rel: { [name]: { stage, bond: cur, max, delta, note: note.join('|') } } };
}

function char(body) {
  const parts = [...body.matchAll(/\[([^\]]*)\]/g)].map((m) => t(m[1]));
  if (parts.length < 4) return null;
  const [avatar, name, type, tag] = parts;
  if (!name) return null;
  return { rel: { [name]: { avatar, type, tag } } };
}

function qlog(body) {
  const [title, rank, st, progress, ...objective] = body.split('|').map(t);
  if (!title) return null;
  const status = normStatus(st);
  return { mission: { [title]: { title, rank, status, progress, objective: objective.join('|'), ...(status === 'done' ? { completed: true, completionRank: rank, completionProgress: progress } : {}) } } };
}

function mission(body) {
  const [kind, title, rank, objective, cur, max, reward, ...log] = body.split('::').map(t);
  if (!title) return null;
  const m = { title, rank, objective, progress: `${cur}/${max}`, reward, log: log.join('::') };
  const k = normStatus(kind);
  if (k === 'done' || k === 'failed') m.status = k;
  if (k === 'done') {
    m.completed = true;
    m.completionRank = rank;
    m.completionProgress = m.progress;
  }
  return { mission: { [title]: m } };
}

const HANDLERS = {
  HI3_STATUS: status,
  HI3_HUD: hud,
  HI3_BOND: bond,
  HI_CHAR: char,
  HI3_QLOG: qlog,
  HI3_MISSION: mission,
};

export function hi3Parser(text) {
  const out = [];
  for (const m of String(text || '').matchAll(TAG_RE)) {
    const handler = HANDLERS[m[1].toUpperCase()];
    const patch = handler?.(m[2]);
    if (patch) out.push(patch);
  }
  return out;
}
