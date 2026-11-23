import { genericParser } from './core.js';
import { hi3Parser } from './adapters-hi3.js';
import { DEFAULT_SHOP } from './shop.js';

const SKY = {
  '--bc-bg': '#f3f9ff',
  '--bc-card': '#ffffff',
  '--bc-ink': '#17324d',
  '--bc-dim': '#6b86a3',
  '--bc-line': '#d4e6f8',
  '--bc-accent': '#3fa2ff',
  '--bc-accent2': '#8fd0ff',
};

export const PROFILES = [
  {
    id: 'hi3',
    label: 'Honkai Impact 3rd',
    match: (c) => /honkai|hi3|ไฮ\s*3|崩坏/i.test(c.name2 || ''),
    theme: SKY,
    bondMax: 100,
    defaults: {},
    shop: DEFAULT_SHOP,
    playerFields: [
      { key: 'title', label: 'ตำแหน่ง' },
      { key: 'element', label: 'ธาตุ' },
      { key: 'weapon', label: 'อาวุธ' },
    ],
    uiToggles: [
      { key: 'hud', label: 'Field HUD', selector: '.hi3-hud' },
      { key: 'dossier', label: 'Dossier card', selector: '.hi3-dossier' },
      { key: 'bond', label: 'Header & Bond (HI_Char)', selector: '.hi3-char' },
      { key: 'status', label: 'Valkyrie Status', selector: '.hi3-status' },
      { key: 'mission', label: 'Mission Log', selector: '.hi3-mission' },
    ],
    parsers: [genericParser, hi3Parser],
  },
  {
    id: 'default',
    label: 'Bot Console',
    match: () => true,
    theme: SKY,
    bondMax: 100,
    defaults: {},
    playerFields: [
      { key: 'title', label: 'ตำแหน่ง' },
      { key: 'element', label: 'ธาตุ' },
      { key: 'weapon', label: 'อาวุธ' },
    ],
    uiToggles: [],
    parsers: [genericParser],
  },
];

export const REQUIRED_NAME = 'HI3 Rpg';

const normName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export function botName(ctx) {
  const ch = ctx.characters?.[ctx.characterId];
  return String(ch?.name || (ctx.characterId !== undefined ? ctx.name2 : '') || '');
}

export function hasName(ctx, wanted) {
  return normName(botName(ctx)) === normName(wanted);
}

export function hasTag(ctx, tagName) {
  if (!Array.isArray(ctx.tags) || !ctx.tagMap || typeof ctx.tagMap !== 'object') return null;
  const want = String(tagName || '').trim().toLowerCase();
  const avatar = ctx.characters?.[ctx.characterId]?.avatar;
  const ids = (avatar && ctx.tagMap[avatar]) || [];
  return ids.some((id) => String(ctx.tags.find((t) => t.id === id)?.name ?? '').trim().toLowerCase() === want);
}

export function matchProfile(ctx) {
  return PROFILES.find((p) => p.id !== 'default' && p.match(ctx)) || null;
}

export function pickProfile(ctx) {
  return matchProfile(ctx) || PROFILES.find((p) => p.id === 'default');
}
