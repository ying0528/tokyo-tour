// 東京一帶的鐵路資料（public/data/rail-tokyo.json，由 scripts/build_rail.py 產生）
// 用途：選路線與車站、自動算方向與站數、畫沿途路線圖、標出可以轉乘的站

export interface RailLine {
  id: string;
  name: string;
  ja: string;
  color: string;
  /** 車站編號的字首，例如 G、JY */
  prefix: string;
  loop: boolean;
  stations: string[];
  /** 和 stations 對應的車站編號（沒有資料時是空字串） */
  codes: string[];
}

export interface RailStation {
  /** 繁體中文名稱 */
  n: string;
  /** 日文名稱 */
  ja: string;
  /** [經度, 緯度] */
  c: [number, number];
}

export interface RailData {
  updated: string;
  source: string;
  lines: RailLine[];
  stations: Record<string, RailStation>;
  /** 同一個車站（可轉乘）的各路線車站 id */
  groups: string[][];
}

let cache: Promise<RailData> | null = null;
let loaded: RailData | null = null;
let groupIndex: Map<string, string[]> | null = null;

/** 載入路線資料（第一次需要網路，之後離線也能用） */
export function loadRail(): Promise<RailData> {
  if (!cache) {
    cache = fetch('./data/rail-tokyo.json')
      .then((r) => {
        if (!r.ok) throw new Error('路線資料下載失敗');
        return r.json() as Promise<RailData>;
      })
      .then((d) => {
        loaded = d;
        groupIndex = null;
        return d;
      })
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

/** 已經載入的資料（還沒載入時是 null） */
export function railNow(): RailData | null {
  return loaded;
}

/** 測試用：直接放入資料 */
export function setRailData(d: RailData) {
  loaded = d;
  cache = Promise.resolve(d);
  groupIndex = null;
}

export function lineById(d: RailData, id: string | undefined): RailLine | undefined {
  return id ? d.lines.find((l) => l.id === id) : undefined;
}

/** 線上某站的編號 */
export function codeAt(line: RailLine, stationId: string): string {
  const i = line.stations.indexOf(stationId);
  return i >= 0 ? line.codes[i] ?? '' : '';
}

/** 路線代號：有車站編號的線用字首（G、JY），沒有就空白 */
export function lineCode(line: RailLine): string {
  return line.codes.some(Boolean) ? line.prefix : '';
}

/** 同一條線上不重複的車站（環狀線與大江戶線同一站會出現兩次；日文名稱相同就當作同一站） */
export function uniqueStations(d: RailData, line: RailLine): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of line.stations) {
    const key = d.stations[id]?.ja ?? id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export interface RidePath {
  /** 沿途經過的車站（含上下車站） */
  stations: string[];
  /** 坐幾站 */
  stops: number;
  /** 往哪個方向，例如「澀谷方向」或「外回り（往 品川）」 */
  direction: string;
}

/**
 * 在同一條線上從 from 坐到 to：找最短的走法，算出方向與站數。
 * 環狀線（山手線）兩個方向都考慮；大江戶線（6 字形）也能處理。
 */
export function ridePath(d: RailData, line: RailLine, fromId: string, toId: string): RidePath | null {
  const key = (id: string) => d.stations[id]?.ja ?? id;
  const seq = line.stations;
  // 建立相鄰關係（以名稱合併重複出現的站）
  const adj = new Map<string, Set<string>>();
  const rep = new Map<string, string>();
  for (const id of seq) if (!rep.has(key(id))) rep.set(key(id), id);
  for (let i = 0; i + 1 < seq.length; i++) {
    const a = key(seq[i]);
    const b = key(seq[i + 1]);
    if (a === b) continue;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  const start = key(fromId);
  const goal = key(toId);
  if (!adj.has(start) || !adj.has(goal)) return null;
  if (start === goal) return { stations: [rep.get(start)!], stops: 0, direction: '' };
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === goal) break;
    for (const n of adj.get(cur) ?? []) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(goal)) return null;
  const names: string[] = [];
  for (let at: string | null = goal; at; at = prev.get(at) ?? null) names.unshift(at);
  const stations = names.map((n) => rep.get(n)!);
  return { stations, stops: names.length - 1, direction: directionLabel(d, line, names) };
}

function directionLabel(d: RailData, line: RailLine, names: string[]): string {
  const key = (id: string) => d.stations[id]?.ja ?? id;
  const seqNames = line.stations.map(key);
  const next = names[1];
  const nameZh = (ja: string) => d.stations[line.stations[seqNames.indexOf(ja)]]?.n ?? ja;
  if (line.loop) {
    // 資料中的順序＝外回り（順時針）
    const i = seqNames.indexOf(names[0]);
    const forward = seqNames[i + 1] === next || (i === seqNames.length - 1 && seqNames[1] === next);
    return `${forward ? '外回り' : '內回り'}（往 ${nameZh(next)}）`;
  }
  const first = seqNames[0];
  const last = seqNames[seqNames.length - 1];
  const hasRepeat = new Set(seqNames).size !== seqNames.length;
  if (hasRepeat) {
    // 大江戶線：繞圈的部分用下一站表示，往光丘的部分用終點
    const lastIdx = seqNames.lastIndexOf(names[0]);
    if (seqNames[lastIdx + 1] === next && seqNames.indexOf(names[0]) !== lastIdx) return `往 ${nameZh(last)} 方向`;
    return `往 ${nameZh(next)} 方向`;
  }
  const iFrom = seqNames.indexOf(names[0]);
  const iNext = seqNames.indexOf(next);
  return `往 ${nameZh(iNext > iFrom ? last : first)} 方向`;
}

/** 這一站還可以轉乘哪些路線（不含自己這條線） */
export function transfersAt(d: RailData, stationId: string, exceptLine?: string): RailLine[] {
  if (!groupIndex) {
    groupIndex = new Map();
    for (const g of d.groups) for (const id of g) groupIndex.set(id, g);
  }
  const ids = groupIndex.get(stationId) ?? [stationId];
  const out: RailLine[] = [];
  for (const id of ids) {
    for (const l of d.lines) {
      if (l.id === exceptLine || out.includes(l)) continue;
      if (l.stations.includes(id)) out.push(l);
    }
  }
  return out;
}

/** 兩個車站是不是同一站（可以直接轉乘） */
export function sameStation(d: RailData, a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  transfersAt(d, a);
  const g = groupIndex?.get(a);
  return Boolean(g && g.includes(b)) || d.stations[a]?.ja === d.stations[b]?.ja;
}

/** 搜尋路線：名稱、日文名、代號或經過的車站 */
export function searchLines(d: RailData, q: string): RailLine[] {
  const s = q.trim().toLowerCase();
  if (!s) return d.lines;
  return d.lines.filter((l) => l.name.toLowerCase().includes(s) || l.ja.includes(s) || lineCode(l).toLowerCase() === s
    || l.stations.some((id) => d.stations[id]?.n.includes(q.trim()) || d.stations[id]?.ja.includes(q.trim())));
}

/** 車站在 Google 地圖上的位置（用日文站名搜尋最準） */
export function stationMapUrl(d: RailData, stationId: string): string {
  const st = d.stations[stationId];
  if (!st) return '';
  const name = /駅$/.test(st.ja) ? st.ja : `${st.ja}駅`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

/** 常用的路線放前面（選路線時先顯示） */
export const POPULAR_LINES = [
  'TokyoMetro.Ginza', 'TokyoMetro.Marunouchi', 'TokyoMetro.Hibiya', 'TokyoMetro.Tozai', 'TokyoMetro.Chiyoda',
  'TokyoMetro.Hanzomon', 'Toei.Oedo', 'Toei.Asakusa', 'JR-East.Yamanote', 'JR-East.ChuoRapid',
  'JR-East.KeihinTohokuNegishi', 'Keikyu.Airport',
];
