import { esc } from './core.js';
import { cardContent, signature, widgetLabels } from './hsr-widgets.js';

// Sixteen home positions and four dock positions. Empty positions are editable too.
const initial = ['mission', 'journal', 'bag', 'skills', 'emoji0', null, 'shop', 'player',
  null, null, 'appt', 'ui', null, null, null, 'emoji1', 'map', 'phone', 'rel', 'settings'];
const storageKey = skin => 'bc_hsr_layout:' + skin;
export const appIcon = (skin, id) => new URL('./icons/hsr/' + skin.slice(4) + '/' + id + '.svg', import.meta.url).href;

const isWidget = id => typeof id === 'string' && id.startsWith('widget:') && Object.hasOwn(widgetLabels, id.slice(7));

function positions(skin) {
  let slots = [...initial];
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(skin)));
    if (Array.isArray(saved) && [20, 24].includes(saved.length) &&
        initial.filter(Boolean).every(id => saved.filter(value => value === id).length === 1)) {
      const widget = saved.findIndex(isWidget);
      if (widget >= 0 && widget < saved.length - 4 && widget % 4 < 3 && saved[widget + 1] === 'span' &&
          saved.filter(Boolean).length === 16) return saved;
      if (saved.length === 20 && saved.every(id => initial.includes(id))) slots = saved;
    }
  } catch { }
  let start = slots.findIndex((v,i) => i < 16 && i % 4 < 3 && !v && !slots[i+1]);
  if (start < 0) {
    start = 16;
    slots.splice(start, 0, null, null, null, null);
  }
  slots.splice(start, 2, 'widget:' + signature[skin].widget, 'span');
  return slots;
}

export function launcher(skin, apps, cards) {
  const slots = positions(skin.id);
  const cells = slots.map((id, i) => {
    if (id === 'span') return '';
    if (isWidget(id)) {
      const kind = id.slice(7);
      return `<button type="button" class="rail-slot rail-widget" data-slot="${i}" data-story="${kind}">
        ${cardContent(kind, cards[kind], skin)}</button>`;
    }
    const app = apps.find(a => a.id === id);
    const label = app?.label || (id ? 'อิโมจิ ' + (Number(id.slice(-1)) + 1) : 'ช่องว่าง');
    const img = app ? appIcon(skin.id, id) : id ? skin.emojis[Number(id.slice(-1))] : '';
    return `<button type="button" class="rail-slot ${app ? 'app' : id ? 'sticker' : 'vacant'}" data-slot="${i}" ${app ? 'data-tab="' + id + '"' : ''} aria-label="${esc(label)}">
      ${img ? '<img draggable="false" alt="" src="' + esc(img) + '">' : ''}
      ${app ? '<span>' + esc(label) + '</span>' : ''}${id === 'phone' ? '<b class="bc-badge" hidden></b>' : ''}</button>`;
  });
  return `<div class="rail-launcher" data-layout-skin="${skin.id}">
    <div class="rail-tools"><b class="rail-signature">${skin.title}</b><button type="button" data-layout-edit aria-label="จัดตำแหน่ง" title="จัดตำแหน่ง"><i class="fa-solid fa-arrows-up-down-left-right" aria-hidden="true"></i></button></div>
    <label class="rail-widget-picker">วิดเจ็ตบนหน้าหลัก <select data-widget-picker>${Object.entries(widgetLabels).map(([kind,label]) =>
      `<option value="${kind}"${slots.includes('widget:' + kind) ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    <nav class="rail-grid" aria-label="แอปพลิเคชัน">${cells.slice(0, -4).join('')}</nav>
    <nav class="rail-dock" aria-label="แอปด่วน">${cells.slice(-4).join('')}</nav></div>`;
}

export function mountLauncher(panel, render) {
  let press, selected = null, suppress = 0;
  const home = () => panel.querySelector('.rail-launcher');
  const cancel = () => { clearTimeout(press?.timer); press = null; };
  const select = (root, slot) => {
    root.querySelector('.selected')?.classList.remove('selected');
    selected = slot;
    slot?.classList.add('selected');
  };
  const edit = (root, on) => {
    root.classList.toggle('arranging', on);
    const button = root.querySelector('[data-layout-edit]');
    button.innerHTML = on ? 'เสร็จ' : '<i class="fa-solid fa-arrows-up-down-left-right" aria-hidden="true"></i>';
    button.setAttribute('aria-label', on ? 'เสร็จ' : 'จัดตำแหน่ง');
    select(root, null);
  };
  function saveLayout(root, slots) {
    try { localStorage.setItem(storageKey(root.dataset.layoutSkin), JSON.stringify(slots)); }
    catch { return; }
    render();
    if (home()) edit(home(), true);
  }
  panel.addEventListener('change', e => {
    if (!e.target.matches('[data-widget-picker]') || !Object.hasOwn(widgetLabels, e.target.value)) return;
    const root = home(), slots = positions(root.dataset.layoutSkin);
    slots[slots.findIndex(isWidget)] = 'widget:' + e.target.value;
    saveLayout(root, slots);
  });
  function move(root, from, to) {
    if (!to || from === to || !root.contains(from) || !root.contains(to)) return;
    const slots = positions(root.dataset.layoutSkin);
    let a = Number(from.dataset.slot), b = Number(to.dataset.slot);
    if (isWidget(slots[b])) [a,b] = [b,a];
    if (isWidget(slots[a])) {
      if (b >= slots.length - 4) return;
      if (b % 4 === 3) b--;
      if (a === b) return;
      const widget = slots[a];
      const old = [a, a+1].filter(i => i !== b && i !== b+1);
      const incoming = [b,b+1].filter(i => i !== a && i !== a+1).map(i => slots[i]);
      old.forEach((i, n) => { slots[i] = incoming[n]; });
      slots.splice(b, 2, widget, 'span');
    } else [slots[a], slots[b]] = [slots[b], slots[a]];
    saveLayout(root, slots);
  }
  panel.addEventListener('contextmenu', e => { if (e.target.closest('.rail-slot')) e.preventDefault(); });
  panel.addEventListener('pointerdown', e => {
    suppress = 0;
    const slot = e.target.closest('.rail-slot'), root = home();
    if (!slot || !root || e.button !== 0 || !e.isPrimary) return;
    cancel();
    const state = press = { slot, x: e.clientX, y: e.clientY, pointer: e.pointerId };
    state.timer = setTimeout(() => {
      if (!slot.isConnected) return cancel();
      edit(root, true); select(root, slot); state.held = true;
      slot.setPointerCapture(e.pointerId);
    }, 440);
  });
  panel.addEventListener('pointermove', e => {
    if (!press || press.pointer !== e.pointerId) return;
    if (!press.held && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 9) cancel();
    else if (press.held) {
      const root = home();
      const thumb = press.slot.querySelector('img');
      if (thumb) thumb.style.transform = `translate(${e.clientX - press.x}px, ${e.clientY - press.y}px) scale(1.08)`;
      root?.querySelector('.drop-target')?.classList.remove('drop-target');
      document.elementFromPoint(e.clientX,e.clientY)?.closest('.rail-slot')?.classList.add('drop-target');
    }
  });
  window.addEventListener('pointerup', e => {
    if (!press || press.pointer !== e.pointerId) return;
    const root = home();
    if (press.held && root) {
      press.slot.querySelector('img')?.style.removeProperty('transform');
      suppress = performance.now() + 350;
      root.querySelector('.drop-target')?.classList.remove('drop-target');
      move(root, press.slot, document.elementFromPoint(e.clientX,e.clientY)?.closest('.rail-slot'));
    }
    cancel();
  });
  window.addEventListener('pointercancel', () => {
    press?.slot.querySelector('img')?.style.removeProperty('transform');
    home()?.querySelector('.drop-target')?.classList.remove('drop-target');
    cancel();
  });
  panel.addEventListener('click', e => {
    const root = home();
    if (!root?.contains(e.target)) return;
    const slot = e.target.closest('.rail-slot');
    const afterDrag = e.detail > 0 && performance.now() < suppress;
    if (!e.target.closest('[data-layout-edit]') && !(slot && root.classList.contains('arranging')) && !afterDrag) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (afterDrag) return;
    if (!slot) {
      const on = !root.classList.contains('arranging');
      edit(root, on);
      if (!on) render();
    }
    else if (selected && root.contains(selected) && selected !== slot) move(root, selected, slot);
    else select(root, slot.classList.contains('vacant') || selected === slot ? null : slot);
  }, true);
}
