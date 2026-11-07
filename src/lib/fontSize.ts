// 字體大小：小（預設）、中（+4）、大（+6）、特大（+8）。記在這支手機（關掉 App 再打開也一樣）
export type FontSize = 's' | 'm' | 'l' | 'xl';
const KEY = 'family-trip:font-size-v2';
/** 舊版只有小（0）／中（+2）／大（+4）：舊的「大」就是新的「中」 */
const OLD_KEY = 'family-trip:font-size';

export function getFontSize(): FontSize {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 's' || v === 'm' || v === 'l' || v === 'xl') return v;
    const old = localStorage.getItem(OLD_KEY);
    if (old === 'm' || old === 'l') return 'm';
  } catch { /* 無痕模式等讀不到就用預設 */ }
  return 's';
}

export function applyFontSize(v: FontSize = getFontSize()) {
  if (v === 's') delete document.documentElement.dataset.font;
  else document.documentElement.dataset.font = v;
}

export function setFontSize(v: FontSize) {
  try {
    localStorage.setItem(KEY, v);
  } catch { /* 存不了就只有這次有效 */ }
  applyFontSize(v);
}
