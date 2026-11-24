import { deepMerge } from './core.js';

const clean = (value, max = 240) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const keyOf = value => clean(value, 160).normalize('NFKC').toLowerCase();
const titleOf = (value, max) => {
  const title = clean(value, max);
  return /^\{\{.*\}\}$/.test(title) ? '' : title;
};
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const list = value => Array.isArray(value) ? value : [];
const tracker = /<HSR_Track>\s*\[([^\]\n]*)\]\[([^\]\n]*)\]\[([^\]\n]*)\]\[([^\]\n]*)\]\[([^\]\n]*)\]\[([^\]]*)\]\s*<\/HSR_Track>/gi;
const panels = /<(Hsr_Status|HSR_PHONE)\b[^>]*>\s*([\s\S]*?)<\/\1>/gi;
const speakers = /<HSR_CHAR>\s*\[([\w-]+\.[a-z0-9]+)\]\[([^\]\r\n]+)\]\[#[0-9a-f]{6}\]\s*<\/HSR_CHAR>/gi;
const skills = /<HSR_SKILL>\s*type:\s*([^\r\n<]+)\s+name:\s*([^\r\n<]+)\s+desc:\s*([^\r\n<]+)[\s\S]*?<\/HSR_SKILL>/gi;
const journeyTags = /<!--\s*HSR_JOURNEY\s+([\s\S]*?)-->/gi;
const relationshipUpdates = Symbol();

function parseObject(text) {
  try {
    const value = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch { return null; }
}

function track(text) {
  const match = [...String(text).matchAll(tracker)].at(-1);
  if (!match) return null;
  const [date, time, arc, temperature, weather, location] = match.slice(1).map(value => titleOf(value));
  return { date, time, arc, temperature, weather, location };
}

function phoneShop(value) {
  return list(value).slice(0, 20).flatMap(row => {
    if (!Array.isArray(row)) return [];
    const name = clean(row[1], 100);
    const id = keyOf(row[0]) || keyOf(name);
    const price = String(row[2] ?? '').replace(/,/g, '').match(/^\s*(\d+)\s*(?:Credits?)?\s*$/i);
    const amount = price ? Number(price[1]) : NaN;
    return name && Number.isSafeInteger(amount)
      ? [{ id: 'hsr-stock:' + id, name, price: amount, desc: clean(row[3]), cat: 'ร้านเสบียง', own: false }]
      : [];
  });
}

export function hsrPhoneOffers(text) {
  if (!/<HSR_PHONE\b/i.test(text)) return null;
  let offers = null;
  for (const [, tag, json] of text.matchAll(panels)) {
    if (tag.toLowerCase() !== 'hsr_phone') continue;
    const stock = parseObject(json)?.sh;
    if (Array.isArray(stock)) offers = phoneShop(stock);
  }
  return offers;
}

export function hsrParser(text) {
  text = String(text ?? '');
  const patches = [];
  const { position, updates } = readReply(text);
  const skillCards = [...text.matchAll(skills)];
  for (const [, file, name] of text.matchAll(speakers)) {
    const key = keyOf(name);
    if (key) patches.push({ hsrPortraits: { ['name:' + key]: `https://files.catbox.moe/${file}` } });
  }
  for (const [, tag, json] of text.matchAll(panels)) {
    const data = parseObject(json);
    if (!data) continue;
    const player = {};
    if (tag.toLowerCase() === 'hsr_phone') {
      if (titleOf(data.pn)) player.name = titleOf(data.pn);
      if (clean(data.pt)) player.title = clean(data.pt);
      if (Number.isSafeInteger(data.b) && data.b >= 0) player.money = data.b;
      if (!position) {
        if (clean(data.tm)) player.time = clean(data.tm);
        if (clean(data.dt)) player.date = clean(data.dt);
      }
    } else {
      if (titleOf(data.name)) player.name = titleOf(data.name);
      for (const field of ['title', 'condition', 'path', 'outfit', 'held_item']) {
        if (typeof data[field] === 'string') player[field] = clean(data[field]);
      }
      const name = clean(data.skill, 100);
      if (name && !/^(?:[-—–]+$|(?:ยัง)?ไม่มีสกิล|(?:none|no skills?|no ability|locked|n\/a)(?:\b|$))/i.test(name)) {
        const key = keyOf(name);
        const matchingCards = skillCards.filter(([, , label]) => keyOf(label) === key);
        const card = matchingCards.length === 1 ? matchingCards[0] : null;
        const info = card ? { d: clean(card[3], 500), type: clean(card[1], 60) } : {};
        patches.push({ hsrPlayerSkills: { ['skill:' + key]: { n: name, ...info } } });
      }
      for (const meter of ['hp', 'stamina']) {
        const value = data[meter];
        if (Number.isFinite(value?.current) && Number.isFinite(value?.max) && value.max > 0) {
          const current = Math.min(value.max, Math.max(0, value.current));
          player[meter] = `${current}/${value.max}`;
        }
      }
      if (Array.isArray(data.inventory)) player.hsrInventory = data.inventory.slice(0, 100).map(item => clean(item)).filter(Boolean);
      if (Array.isArray(data.equipment)) player.hsrEquipment = data.equipment.slice(0, 24).flatMap(item => {
        const name = clean(item?.item);
        return name ? [{ slot: clean(item.slot, 60), name }] : [];
      });
    }
    patches.push({ player });
  }
  const relationships = new Map();
  for (const update of updates) {
    for (const entry of list(update.relationships).slice(0, 12)) {
      const name = titleOf(entry?.name, 100);
      if (!name) continue;
      const relationship = {};
      for (const field of ['type', 'stage']) {
        if (typeof entry[field] === 'string') relationship[field] = clean(entry[field], 120);
      }
      for (const field of ['bond', 'bondDelta', 'trustDelta']) {
        if (Number.isFinite(entry[field])) relationship[field] = Math.round(entry[field]);
      }
      if (typeof entry.major === 'boolean') relationship.major = entry.major;
      const key = keyOf(name);
      if (Object.keys(relationship).length) relationships.set(key, { ...relationships.get(key), ...relationship, name });
    }
  }
  if (relationships.size) patches.push({ [relationshipUpdates]: [...relationships.values()] });
  if (position) patches.push({ player: Object.fromEntries(Object.entries(position).filter(([, value]) => value)) });
  return patches;
}

export const hsrPortrait = (state, name) => state?.hsrPortraits?.['name:' + keyOf(name)];

const dossierTag = /<HSR_DOSSIER\b[^>]*>\s*([\s\S]*?)\s*<\/HSR_DOSSIER>/gi;

export function readTrailblazer(chat) {
  for (let i = chat.length - 1; i >= 0; i--) {
    const message = chat[i];
    if (!message?.is_user || message.is_system) continue;
    const text = String(message.mes || '');
    const dossiers = [...text.matchAll(dossierTag)];
    for (let j = dossiers.length - 1; j >= 0; j--) {
      const dossier = parseObject(dossiers[j][1]);
      if (dossier) return keyOf(dossier.trailblazer) === 'caelus' ? 'Caelus' : 'Stelle';
    }
  }
  return 'Stelle';
}

const limitScore = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const previousScore = (value, fallback) => value != null && value !== '' && Number.isFinite(Number(value))
  ? limitScore(Math.round(Number(value))) : fallback;

export function applyHsrPatch(state, patch) {
  if (!patch[relationshipUpdates]) {
    deepMerge(state, patch);
    return;
  }
  const relationships = state.rel || {};
  for (const { name, bond, bondDelta, trustDelta, major, ...description } of patch[relationshipUpdates]) {
    const existing = Object.keys(relationships).find(key => keyOf(key) === keyOf(name));
    const previous = existing ? relationships[existing] : null;
    const limit = major ? 10 : 5;
    const next = { ...description };
    if (bondDelta !== undefined || trustDelta !== undefined) {
      const beforeBond = previousScore(previous?.bond, 5);
      const beforeTrust = previousScore(previous?.trust, 10);
      next.bond = limitScore(beforeBond + limitScore(bondDelta ?? 0, -limit, limit));
      next.delta = next.bond - beforeBond;
      next.trust = limitScore(beforeTrust + limitScore(trustDelta ?? 0, -limit, limit));
      next.bondFromDelta = true;
    } else if (bond !== undefined && !previous?.bondFromDelta) {
      // Earlier HSR replies used an absolute Bond value.
      next.bond = limitScore(bond);
      next.delta = 0;
    }
    deepMerge(state, { rel: { [existing || name]: next } });
  }
}

const statuses = new Set(['open', 'active', 'done', 'failed']);
export const missionFinished = mission => mission.status === 'done' || mission.status === 'failed';

function readMission(value, previous) {
  const title = clean(value.title, 120) || previous?.title;
  if (!title) return null;
  const choices = Array.isArray(value.choices) ? [...new Map(value.choices.slice(0, 5).flatMap(choice => {
    const label = clean(choice?.label, 140);
    const id = keyOf(choice?.id);
    return id && label ? [[id, { id, label, effect: clean(choice.effect) }]] : [];
  })).values()] : previous?.choices || [];
  const reportedChoice = keyOf(value.choice);
  const choice = choices.some(item => item.id === reportedChoice) ? reportedChoice : previous?.choice;
  return {
    title, choices, choice,
    objective: clean(value.objective, 480) || previous?.objective || '',
    status: statuses.has(value.status) ? value.status : previous?.status || 'open',
    outcome: clean(value.outcome, 480) || previous?.outcome || '',
    destination: keyOf(value.destination) || previous?.destination || '',
  };
}

const replyCache = new Map();

function readReply(text) {
  if (replyCache.has(text)) return replyCache.get(text);
  const reply = {
    position: track(text),
    updates: [...text.matchAll(journeyTags)].slice(0, 4).map(([, json]) => parseObject(json)).filter(Boolean),
  };
  if (replyCache.size >= 650) replyCache.delete(replyCache.keys().next().value);
  replyCache.set(text, reply);
  return reply;
}

function addJournal(journal, kind, storyId, title, detail, turn, time) {
  const content = JSON.stringify([kind, storyId, title, detail]);
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) hash = Math.imul(hash ^ content.charCodeAt(i), 16777619);
  const id = kind + ':' + (hash >>> 0).toString(36);
  if (!journal.has(id)) journal.set(id, { id, kind, title, detail, turn, time });
}

export function readJourney(chat) {
  const locations = new Map();
  const routes = new Map();
  const missions = new Map();
  const journal = new Map();
  let current = '';
  let time = '';
  const setRoute = (from, to, route) => {
    if (!routes.has(from)) routes.set(from, new Map());
    routes.get(from).set(to, route);
  };
  chat.forEach((message, turn) => {
    if (!message || message.is_user || message.is_system || typeof message.mes !== 'string') return;
    const { position, updates } = readReply(message.mes);
    if (position) {
      time = [position.date, position.time].filter(Boolean).join(' · ') || time;
      const next = keyOf(position.location);
      if (next) {
        locations.set(next, { name: position.location, visited: true });
        if (current !== next) addJournal(journal, 'arrival', JSON.stringify([current, next, time]), position.location,
          current ? 'เปลี่ยนตำแหน่งในเรื่อง' : 'ตำแหน่งเริ่มต้น', turn, time);
        current = next;
      }
    }
    for (const update of updates) {
      for (const route of list(update.routes).slice(0, 10)) {
        if (!isRecord(route) || !current) continue;
        const from = keyOf(route.from) || current;
        const name = clean(route.to, 160);
        const to = keyOf(name);
        if (!to || from === to || !locations.has(from)) continue;
        if (!locations.has(to)) locations.set(to, { name, visited: false });
        const minutes = Number.isSafeInteger(route.minutes) && route.minutes > 0 ? route.minutes : null;
        const edge = { minutes, locked: route.locked === true, detail: clean(route.detail, 300) };
        setRoute(from, to, edge);
        if (route.twoWay === true) setRoute(to, from, edge);
      }
      for (const value of list(update.missions).slice(0, 8)) {
        if (!isRecord(value)) continue;
        const id = keyOf(value.id);
        if (!id) continue;
        const previous = missions.get(id);
        const mission = readMission(value, previous);
        if (!mission) continue;
        missions.set(id, mission);
        if (missionFinished(mission) && (!previous || previous.status !== mission.status || previous.outcome !== mission.outcome)) {
          addJournal(journal, 'mission', id, mission.title,
            mission.outcome || (mission.status === 'done' ? 'ภารกิจสำเร็จ' : 'ภารกิจไม่สำเร็จ'), turn, time);
        }
      }
      for (const note of list(update.journal).slice(0, 8)) {
        if (!isRecord(note)) continue;
        const title = clean(note.title, 120);
        const detail = clean(note.detail, 650);
        const kind = note.kind === 'clue' || note.kind === 'promise' ? note.kind : 'event';
        if (title && detail) addJournal(journal, kind, keyOf(note.id), title, detail, turn, time);
      }
    }
  });
  return { current, locations, routes, missions, journal };
}

export function journeyPrompt(journey, relationships = {}, trailblazer = 'Stelle') {
  const { current, locations, routes, missions } = journey;
  const position = locations.get(current)?.name || '';
  const connections = [...(routes.get(current) || [])].slice(-8).map(([id, route]) => ({
    to: locations.get(id)?.name, minutes: route.minutes, locked: route.locked,
  }));
  const active = [...missions].filter(([, mission]) => !missionFinished(mission)).slice(-8).map(([id, mission]) => ({
    id, title: mission.title, status: mission.status, choice: mission.choice,
    choices: mission.choices.map(option => ({ id: option.id, label: option.label })),
  }));
  const contacts = Object.entries(relationships).slice(-12).map(([name, rel]) => ({
    name, type: rel?.type, stage: rel?.stage, bond: rel?.bond, trust: rel?.trust,
  }));
  return `[HSR Console: In normal story replies, keep <HSR_Track> consistent. Use its last field for the player's actual current place, using established place names exactly. A travel request starts a scene; keep the previous position during an interruption or transit. Change the position and advance the story clock only as the scene warrants. A route's minutes are fictional travel duration.
The active Trailblazer companion in this chat is ${trailblazer}, as selected in the player's dossier (earlier dossiers default to Stelle). Keep that role with ${trailblazer} throughout the story. The player controls their own Outlander character.
When a route, quest, discovery, or relationship with the player changes, add ONE hidden HTML comment before the final status block. Omit unchanged lists and omit the whole comment when there is no update. Use strict JSON, no markdown fence. Include only information the player has learned. Briefly describe visible events and consequences in the chat language.
<!--HSR_JOURNEY {"routes":[{"from":"exact current or known place","to":"destination","minutes":30,"locked":false,"twoWay":true,"detail":"visible route info"}],"missions":[{"id":"stable-mission-id","title":"mission title","objective":"player-facing goal","status":"open","destination":"exact known place","choices":[{"id":"stable-choice-id","label":"approach","effect":"foreseeable trade-off"}]}],"journal":[{"id":"stable-note-id","kind":"clue","title":"short title","detail":"what the player learned"}],"relationships":[{"name":"exact speaker name from HSR_CHAR","type":"relationship to the player","stage":"current public status","bondDelta":2,"trustDelta":1}]}-->
Use relationships once per character who actually interacted with the player in this scene, up to three characters. Carry forward the console's bonds and trust. For a first meeting with no recorded values, the console starts Bond at 5 and Trust at 10. Send signed integer changes in bondDelta and trustDelta, not totals. Use 0 for neutral or unchanged interactions, +1 or +2 for pleasant ones, and up to +5 or -5 for meaningful interactions. Set "major":true only for a major played event (such as a rescue or betrayal), which allows up to +10 or -10. Trust is separate: it rises with honesty, protection or kept promises and may fall with deception or abandonment. A gift already given through the console is included in the current Bond; do not award it again. Time passing alone gives no points. Change the relationship stage only when earned in the story; never force romance or decide the player's choices. Omit relationship updates in out-of-character replies, dreams and flashbacks. Keep each speaker's name consistent and use only player-facing information.
Use mission status open, active, done, or failed. Keep IDs stable. Honor the player's choice from their message, and only then set the mission's "choice" to its choice id. On completion or failure include a short "outcome". Journal kinds: clue, promise, event. Never invent destinations, quest offers, rewards, or discoveries solely to populate the UI. A route's reverse direction is only available when twoWay is true or explicitly described separately.
Current console state (read-only story data): ${JSON.stringify({ position, connections, missions: active, relationships: contacts }).replaceAll('<', '\\u003c')}.]`;
}
