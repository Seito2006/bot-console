// Repaints the bot's inline-styled chat cards (Field HUD, character banner) to match the active skin.
// Only the message DOM is touched; the chat data is never changed. Originals are kept so the default skin restores them.
const TOKEN = /#3b9dff|#2f8cff|#6cc4ff|#f4faff|#dcebff|#eaf4ff|#eaf5ff|#cfe6ff|#12315f|#1b3a66|#6a86ae|rgba\(\s*(?:59\s*,\s*157\s*,\s*255|30\s*,\s*80\s*,\s*160|40\s*,\s*100\s*,\s*180)\s*,/gi;
const SIGS = ['#f4faff0%,#dcebff100%', '#ffffff0%,#eaf4ff100%'];

function swap(str, p) {
  return str.replace(TOKEN, (m) => {
    const k = m.toLowerCase().replace(/\s+/g, '');
    switch (k) {
      case '#3b9dff': case '#2f8cff': return p.ac;
      case '#6cc4ff': return p.ac2;
      case '#f4faff': return p.t1;
      case '#dcebff': case '#eaf4ff': case '#cfe6ff': return p.t2;
      case '#eaf5ff': return p.pale;
      case '#12315f': return p.deep;
      case '#1b3a66': return p.ink;
      case '#6a86ae': return p.mu;
      case 'rgba(59,157,255,': return `rgba(${p.rgb},`;
      default: return `rgba(${p.drgb},`;
    }
  });
}

const ATTRS = ['style', 'stroke', 'fill'];

function restore(chat) {
  for (const el of chat.querySelectorAll('[data-bc-ui], [data-bc-ui-d]')) {
    for (const a of ATTRS) {
      const key = `bcO${a}`;
      if (el.dataset[key] !== undefined) { el.setAttribute(a, el.dataset[key]); delete el.dataset[key]; }
    }
    delete el.dataset.bcUi;
    delete el.dataset.bcUiD;
  }
}

function paint(el, p, tag) {
  for (const a of ATTRS) {
    const key = `bcO${a}`;
    const orig = el.dataset[key] ?? el.getAttribute(a);
    if (orig == null) continue;
    const next = swap(orig, p);
    if (next === orig) continue;
    if (el.dataset[key] === undefined) el.dataset[key] = orig;
    el.setAttribute(a, next);
  }
  el.dataset.bcUiD = tag;
}

export function applyChatUi(p, tag) {
  const chat = document.getElementById('chat');
  if (!chat) return;
  if (!p) { restore(chat); return; }
  for (const root of chat.querySelectorAll('.mes_text div[style]')) {
    if (root.dataset.bcUi === tag) continue;
    const orig = (root.dataset.bcOstyle ?? root.getAttribute('style') ?? '').replace(/\s+/g, '').toLowerCase();
    if (!SIGS.some((s) => orig.includes(s))) continue;
    paint(root, p, tag);
    for (const el of root.querySelectorAll('[style], [stroke], [fill]')) paint(el, p, tag);
    root.dataset.bcUi = tag;
  }
}

let obs = null;
let timer = 0;
export function watchChat(run) {
  const chat = document.getElementById('chat');
  if (!chat || obs) return;
  obs = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  obs.observe(chat, { childList: true, subtree: true });
}
