const PALETTE_KEY = {
  '#3b9dff': 'ac', '#2f8cff': 'ac', '#6cc4ff': 'ac2',
  '#f4faff': 't1', '#dcebff': 't2', '#eaf4ff': 't2', '#cfe6ff': 't2', '#eaf5ff': 'pale',
  '#12315f': 'deep', '#1b3a66': 'ink', '#6a86ae': 'mu',
};
const COLOR = /var\(--bcu-[^)]*\)|(?:#3b9dff|#2f8cff|#6cc4ff|#f4faff|#dcebff|#eaf4ff|#eaf5ff|#cfe6ff|#12315f|#1b3a66|#6a86ae)(?![\da-f])|rgba\(\s*(59\s*,\s*157\s*,\s*255|30\s*,\s*80\s*,\s*160|40\s*,\s*100\s*,\s*180)\s*,/gi;
const SIGNATURES = ['#f4faff0%,#dcebff100%', '#ffffff0%,#eaf4ff100%'];
const normalized = value => String(value || '').replace(/\s+/g, '').toLowerCase();
const tagged = value => /(?:HI3_[A-Za-z]+|HI_Char)/i.test(String(value || '').replaceAll('\\', ''));
const knownGradient = value => {
  const css = normalized(value);
  return SIGNATURES.some(signature => css.includes(signature));
};
const visualMarkup = /<style\b[^>]*>[\s\S]*?<\/style\s*>|(\s(?:style|stroke|fill)\s*=\s*)(['"])([\s\S]*?)\2/gi;
const checked = new WeakMap();

function colors(css) {
  return css.replace(COLOR, (literal, rgb) => {
    if (rgb) {
      const key = normalized(rgb) === '59,157,255' ? 'rgb' : 'drgb';
      return 'rgba(var(--bcu-' + key + ', ' + rgb + '),';
    }
    const key = PALETTE_KEY[literal.toLowerCase()];
    return key ? 'var(--bcu-' + key + ', ' + literal + ')' : literal;
  });
}

export function themeRegex(scripts) {
  for (const script of scripts) {
    if (!script?.markdownOnly || script.promptOnly || typeof script.replaceString !== 'string') continue;
    const source = script.replaceString;
    if (checked.get(script) === source) continue;
    if (tagged(script.findRegex) || knownGradient(source)) {
      const themed = source.replace(visualMarkup, (markup, prefix, quote, value) =>
        prefix ? prefix + quote + colors(value) + quote : colors(markup));
      if (themed !== source) script.replaceString = themed;
    }
    checked.set(script, script.replaceString);
  }
}

export function themeVisibleCards(chat) {
  if (!chat) return;
  for (const card of chat.querySelectorAll('.mes_text div[style], .mes_text .hs')) {
    if (!(card.matches('.hs') || knownGradient(card.getAttribute('style')))) continue;
    for (const node of [card, ...card.querySelectorAll('[style], [stroke], [fill]')]) {
      for (const attr of ['style', 'stroke', 'fill']) {
        const value = node.getAttribute(attr);
        if (!value) continue;
        const replacement = colors(value);
        if (replacement !== value) node.setAttribute(attr, replacement);
      }
    }
  }
}
