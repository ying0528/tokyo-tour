// 行程的核心規則：類型、排序、顯示名稱、分組可見範圍、票券顯示
import type { Activity, ActivityKind, DayPlan, Place, PlaceKind, RouteMode, Ticket, Traveler } from '../data/types.ts';

export interface KindInfo {
  label: string;
  short: string;
  /** 卡片底色 */
  bg: string;
  /** 卡片上次要文字的顏色（在底色上要清楚） */
  sub: string;
}

/** 顏色沿用原本行程表：紅＝必去、橘＝餐飲、綠＝購物、青＝廁所、藍灰＝交通／一般 */
export const KINDS: Record<ActivityKind, KindInfo> = {
  sight: { label: '景點', short: '景點', bg: '#ffd1da', sub: '#6b3d48' },
  food: { label: '用餐', short: '用餐', bg: '#ffdcb0', sub: '#6b4a22' },
  shop: { label: '買買買', short: '買買', bg: '#c6efd9', sub: '#2f5a44' },
  toilet: { label: '廁所', short: '廁所', bg: '#bde8f0', sub: '#2a5560' },
  lodging: { label: '住宿', short: '住宿', bg: '#e6d4ff', sub: '#4d3a6b' },
  move: { label: '移動', short: '移動', bg: '#e4e8f0', sub: '#454b58' },
  other: { label: '不分類', short: '', bg: '#eef0f4', sub: '#4f5563' },
};

/** 新增／編輯行程時可選的類型 */
export const ACTIVITY_KINDS: ActivityKind[] = ['sight', 'food', 'lodging', 'other'];
export const PLACE_KINDS: PlaceKind[] = ['sight', 'food', 'shop', 'toilet', 'lodging', 'other'];

export function isPlaceKind(k: ActivityKind): k is PlaceKind {
  return k !== 'move';
}

export const ROUTE_MODES: { value: RouteMode; label: string; transit: boolean }[] = [
  { value: 'subway', label: '地鐵／電車', transit: true },
  { value: 'bus', label: '公車', transit: true },
  { value: 'train', label: '火車／新幹線', transit: true },
  { value: 'walk', label: '步行', transit: false },
  { value: 'uber', label: 'Uber', transit: false },
  { value: 'taxi', label: '計程車', transit: false },
  { value: 'other', label: '其他', transit: false },
];

export function modeLabel(m: RouteMode): string {
  return ROUTE_MODES.find((x) => x.value === m)?.label ?? '其他';
}

export function isTransit(m: RouteMode): boolean {
  return ROUTE_MODES.find((x) => x.value === m)?.transit ?? false;
}

/** 'HH:MM:SS' 或 'HH:MM' → 'HH:MM' */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}

function minutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 結束時間（開始時間＋停留時間），跨過午夜也照算 */
export function endTime(a: Pick<Activity, 'start_time' | 'duration_min'>): string {
  if (!a.start_time || !a.duration_min) return '';
  const total = (minutes(a.start_time) + a.duration_min) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

type Sortable = Pick<Activity, 'date' | 'start_time' | 'created_at' | 'id'> & { after_activity_id?: string | null };

/**
 * 依日期、時間排序。沒填時間的行程排在指定的行程後面（after_activity_id）；
 * 沒指定的排在當天最後，再依建立先後。
 */
export function sortActivities<T extends Sortable>(list: T[]): T[] {
  const byCreated = (a: T, b: T) => {
    const ca = a.created_at ?? '';
    const cb = b.created_at ?? '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  };
  const dates = [...new Set(list.map((a) => a.date))].sort();
  const out: T[] = [];
  for (const date of dates) {
    const day = list.filter((a) => a.date === date);
    const ids = new Set(day.map((a) => a.id));
    const timed = day.filter((a) => a.start_time).sort((a, b) => minutes(a.start_time!) - minutes(b.start_time!) || byCreated(a, b));
    const untimed = day.filter((a) => !a.start_time).sort(byCreated);
    const children = new Map<string, T[]>();
    const loose: T[] = [];
    for (const a of untimed) {
      const anchor = a.after_activity_id;
      if (anchor && anchor !== a.id && ids.has(anchor)) children.set(anchor, [...(children.get(anchor) ?? []), a]);
      else loose.push(a);
    }
    const seen = new Set<string>();
    const emit = (a: T) => {
      if (seen.has(a.id)) return;
      seen.add(a.id);
      out.push(a);
      for (const c of children.get(a.id) ?? []) emit(c);
    };
    timed.forEach(emit);
    loose.forEach(emit);
    untimed.forEach(emit); // 互相指來指去的（不會發生，保險起見）
  }
  return out;
}

/** 行程顯示的名稱：移動＝「起點－終點」；有自訂名稱用自訂的，否則用景點名稱 */
export function activityName(a: Activity, place: Place | undefined): string {
  if (a.kind === 'move') {
    const route = [a.from_name.trim(), a.to_name.trim()].filter(Boolean).join('－');
    return a.title.trim() || route || '移動';
  }
  return a.title.trim() || place?.name.trim() || '未命名行程';
}

// ---------- 分組 ----------

/** 同一趟旅行同一天的每日設定，id 固定（兩支手機離線各自建立也不會重複） */
export function dayPlanId(tripId: string, date: string): string {
  return stableId(`day:${tripId}:${date}`);
}

/** 由文字算出固定的 uuid（同樣的輸入永遠得到同一個 id） */
export function stableId(key: string): string {
  const h = hash128(key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function hash128(s: string): string {
  // 四組 FNV-1a，不需要加密強度，只需要穩定
  let out = '';
  for (let seed = 0; seed < 4; seed++) {
    let h = 0x811c9dc5 ^ (seed * 0x9e3779b1);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

export function isSplit(plan: DayPlan | undefined): plan is DayPlan {
  return Boolean(plan && !plan.deleted_at && plan.mode === 'split' && plan.groups.length > 1);
}

export function groupName(plan: DayPlan | undefined, key: string): string {
  return plan?.group_names?.[key]?.trim() || `${key} 組`;
}

export function travelerGroup(plan: DayPlan | undefined, travelerId: string | null | undefined): string | null {
  if (!isSplit(plan) || !travelerId) return null;
  const g = plan.assignments[travelerId];
  return g && plan.groups.includes(g) ? g : null;
}

/** 這筆行程是「所有人」都參加的嗎 */
export function isForEveryone(a: Pick<Activity, 'audience_groups' | 'audience_travelers'>): boolean {
  return a.audience_groups.length === 0 && a.audience_travelers.length === 0;
}

/**
 * 在某個檢視下要不要顯示這筆行程。
 * group = null 代表「全部」；travelerId 是正在看的人（可為空）。
 * 沒有分組的日子，所有行程都顯示。
 */
export function visibleIn(a: Activity, plan: DayPlan | undefined, group: string | null, travelerId: string | null): boolean {
  if (!isSplit(plan) || isForEveryone(a) || group === null) return true;
  if (a.audience_groups.includes(group)) return true;
  if (travelerId && a.audience_travelers.includes(travelerId)) return true;
  return a.audience_travelers.some((t) => plan.assignments[t] === group);
}

/** 這個人這一天是否會看到這筆行程 */
export function visibleToTraveler(a: Activity, plan: DayPlan | undefined, travelerId: string): boolean {
  if (!isSplit(plan) || isForEveryone(a)) return true;
  if (a.audience_travelers.includes(travelerId)) return true;
  const g = travelerGroup(plan, travelerId);
  return g !== null && a.audience_groups.includes(g);
}

/** 行程卡片上的「誰參加」標示 */
export function audienceLabel(a: Activity, plan: DayPlan | undefined, travelers: Traveler[]): string {
  if (isForEveryone(a)) return isSplit(plan) ? '全員' : '';
  const parts = [
    ...a.audience_groups.map((g) => groupName(plan, g)),
    ...a.audience_travelers.map((id) => travelers.find((t) => t.id === id)?.name).filter((x): x is string => Boolean(x)),
  ];
  return parts.join('、');
}

// ---------- 票券 ----------

/**
 * 某位旅伴的票券清單要不要出現這張票：
 * 有指定持有人 → 只有持有人看得到；
 * 全員共用 → 只要有一筆關聯行程這個人會參加（沒有關聯行程就一律顯示）。
 */
export function ticketForTraveler(
  t: Ticket,
  travelerId: string,
  activities: Map<string, Activity>,
  plans: Map<string, DayPlan>,
): boolean {
  if (t.traveler_ids.length) return t.traveler_ids.includes(travelerId);
  const linked = t.activity_ids.map((id) => activities.get(id)).filter((a): a is Activity => Boolean(a && !a.deleted_at));
  if (!linked.length) return true;
  return linked.some((a) => visibleToTraveler(a, plans.get(a.date), travelerId));
}

/** 地圖連結：優先用使用者填的 Naver Map；沒有就用名稱或地址在 Naver Map 搜尋 */
export function mapLink(place: Pick<Place, 'map_url' | 'name' | 'address'> | undefined, fallbackName = ''): string | null {
  const url = place?.map_url?.trim();
  if (url && /^https?:\/\//i.test(url)) return url;
  const q = (place?.address?.trim() || place?.name?.trim() || fallbackName.trim());
  return q ? `https://map.naver.com/p/search/${encodeURIComponent(q)}` : null;
}

/**
 * 現在進行到的行程（行程頁用綠色框起來）
 * - 旅行開始前：第一天的第一個
 * - 旅行中：今天最後一個已經開始的；今天還沒開始就是今天第一個
 * - 旅行結束後：沒有
 * shown 是這天（這組）已經排好順序的行程；沒有時間的行程跟著前面那個的時間
 */
export function currentActivityId(shown: { id: string; start_time: string | null }[], days: string[], selected: string, now: { date: string; time: string }): string | null {
  if (!days.length || !shown.length || now.date > days[days.length - 1]) return null;
  const target = now.date < days[0] ? days[0] : now.date;
  if (selected !== target) return null;
  if (now.date < days[0]) return shown[0].id;
  let t = '';
  let cur: string | null = null;
  for (const a of shown) {
    if (a.start_time) t = a.start_time.slice(0, 5);
    if (t && t <= now.time) cur = a.id;
  }
  return cur ?? shown[0].id;
}
