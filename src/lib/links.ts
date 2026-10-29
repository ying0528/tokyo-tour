// 把文字裡的網址切出來，讓畫面可以變成可點的連結。只接受 http／https，不使用 innerHTML，避免注入。
export type TextPart = { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

// 網址遇到空白、全形標點或中文字就結束（韓文路徑如 Naver 地圖仍可）
const URL_RE = /\bhttps?:\/\/[^\s<>"'()\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+/gi;
const TRAILING = /[.,;:!?。，、；：！？)\]}]+$/;

export function safeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0];
    const trail = raw.match(TRAILING)?.[0] ?? '';
    if (trail) raw = raw.slice(0, -trail.length);
    const start = m.index ?? 0;
    const href = safeUrl(raw);
    if (!href) continue;
    if (start > last) parts.push({ type: 'text', text: text.slice(last, start) });
    parts.push({ type: 'link', text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}
