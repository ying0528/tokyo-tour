// 日期工具：全部以 'YYYY-MM-DD' 字串處理，避免時區造成日期跑掉
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function parse(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  return fmt(parse(d) + n * 86400000);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / 86400000);
}

/** 旅行的每一天 */
export function tripDays(start: string, end: string): string[] {
  const n = daysBetween(start, end);
  if (!(n >= 0) || n > 90) return [start];
  return Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
}

export function weekday(d: string): string {
  return WEEK[new Date(parse(d)).getUTCDay()];
}

/** 12/20（六） */
export function dayLabel(d: string): string {
  const [, m, day] = d.split('-').map(Number);
  return `${m}/${day}（${weekday(d)}）`;
}

/** 2026/12/20 – 12/24，跨年時顯示完整年份 */
export function rangeLabel(start: string, end: string): string {
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  if (start === end) return `${y1}/${m1}/${d1}`;
  return y1 === y2 ? `${y1}/${m1}/${d1} – ${m2}/${d2}` : `${y1}/${m1}/${d1} – ${y2}/${m2}/${d2}`;
}

/** 某時區的今天 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** 共 N 天 */
export function dayCount(start: string, end: string): number {
  return daysBetween(start, end) + 1;
}

/** 相對時間：剛剛、5 分鐘前… */
export function ago(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '尚未同步';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return '剛剛';
  if (s < 3600) return `${Math.round(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小時前`;
  return `${Math.round(s / 86400)} 天前`;
}

export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Tokyo', label: '日本（東京）' },
  { value: 'Asia/Seoul', label: '韓國（首爾、釜山）' },
  { value: 'Asia/Taipei', label: '台灣' },
  { value: 'Asia/Hong_Kong', label: '香港、澳門' },
  { value: 'Asia/Shanghai', label: '中國' },
  { value: 'Asia/Bangkok', label: '泰國、越南' },
  { value: 'Asia/Singapore', label: '新加坡、馬來西亞' },
  { value: 'Europe/London', label: '英國' },
  { value: 'Europe/Paris', label: '歐洲中部（法、德、義…）' },
  { value: 'America/New_York', label: '美東' },
  { value: 'America/Los_Angeles', label: '美西' },
  { value: 'Australia/Sydney', label: '澳洲（雪梨）' },
];
