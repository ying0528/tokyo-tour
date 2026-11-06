// 匯入行程檔：把整理好的行程（含補充圖片、分組、路線）一次放進目前這趟旅行
import type { LocalStore } from './store.ts';
import type { Activity, ActivityKind, DayPlan, LegPlan, NamedLink } from './types.ts';
import { newActivity, newLeg, newTraveler } from './factories.ts';
import { saveDayPlan } from './actions.ts';
import { legId } from '../lib/legs.ts';
import { safeUrl } from '../lib/links.ts';
import { stableId } from '../lib/plan.ts';

export const IMPORT_FORMAT = 'family-trip-import';

export interface ImportFile {
  format: typeof IMPORT_FORMAT;
  version: 1;
  /** 這份檔案的代號（避免重複匯入） */
  id: string;
  /** 新版行程檔：匯入過舊版的話，先把舊版的行程移到回收桶 */
  replaces?: {
    id: string;
    activities: { date: string; title: string; time: string | null }[];
    legs: { date: string; from_name: string; to_name: string }[];
  };
  title: string;
  start_date: string;
  end_date: string;
  /** 分組：日期 → 組別名稱與成員（用同行者名字） */
  groups?: Record<string, { names: Record<string, string>; members: Record<string, string[]> }>;
  activities: {
    key: string;
    date: string;
    time: string | null;
    /** 沒時間時排在哪個行程後面（key） */
    after?: string | null;
    kind: ActivityKind;
    title: string;
    notes?: string;
    map_url?: string;
    links?: NamedLink[];
    /** 只給某一組（組別代號，例如 A） */
    group?: string | null;
    /** 圖片代號（對應 images） */
    images?: string[];
  }[];
  legs?: {
    date: string;
    group?: string;
    /** 行程 key；沒有就用 from_name */
    from?: string | null;
    to?: string | null;
    from_name?: string;
    to_name?: string;
    start_time?: string | null;
    plans: LegPlan[];
    notes?: string;
  }[];
  maps?: { label: string; image: string }[];
  /** 圖片代號 → data:image/jpeg;base64,… */
  images?: Record<string, string>;
}

export function parseImport(text: string): ImportFile {
  let d: ImportFile;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('這不是行程檔（無法讀取）');
  }
  if (d?.format !== IMPORT_FORMAT || !Array.isArray(d.activities)) throw new Error('這不是家庭旅行的行程檔');
  return d;
}

export function importSummary(d: ImportFile) {
  const days = new Set(d.activities.map((a) => a.date)).size;
  return { days, activities: d.activities.length, legs: d.legs?.length ?? 0, groups: Object.keys(d.groups ?? {}).length, images: Object.keys(d.images ?? {}).length };
}

function dataUrlToBlob(url: string): Blob {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url);
  if (!m) throw new Error('圖片格式不正確');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

/** 匯入過的舊版行程中，還在這趟旅行裡的（標題、日期、時間都一樣才算） */
export function replacedActivities(store: LocalStore, tripId: string, d: ImportFile) {
  const trip = store.get('trips', tripId);
  if (!d.replaces || !alreadyImported(trip?.settings, d.replaces.id)) return [];
  const acts = store.byTrip('activities', tripId);
  const out: Activity[] = [];
  for (const sig of d.replaces.activities) {
    const a = acts.find((x) => x.date === sig.date && x.title.trim() === sig.title.trim()
      && (x.start_time ? x.start_time.slice(0, 5) : null) === (sig.time ?? null) && !out.includes(x));
    if (a) out.push(a);
  }
  return out;
}

/** 匯入到目前這趟旅行，回傳新增的行程數 */
export async function importIntoTrip(store: LocalStore, tripId: string, d: ImportFile): Promise<{ activities: number; addedTravelers: string[]; replaced: number }> {
  const trip = store.get('trips', tripId);
  if (!trip) throw new Error('找不到這趟旅行');

  // 換成新版：舊版匯入的行程與路線移到回收桶
  const old = replacedActivities(store, tripId, d);
  if (old.length) {
    const gone = new Set(old.map((a) => a.id));
    for (const a of old) await store.softDelete('activities', a.id);
    for (const l of store.byTrip('route_legs', tripId)) {
      const linked = (l.from_activity_id && gone.has(l.from_activity_id)) || (l.to_activity_id && gone.has(l.to_activity_id));
      const named = d.replaces!.legs.some((x) => x.date === l.date && x.from_name === l.from_name && x.to_name === l.to_name);
      if (linked || (l.custom && named)) await store.softDelete('route_legs', l.id);
    }
  }

  // 同行者：用名字對應（大小寫不分），沒有的就新增
  const travelers = store.byTrip('travelers', tripId);
  const byName = new Map(travelers.map((t) => [t.name.trim().toLowerCase(), t.id]));
  const addedTravelers: string[] = [];
  const travelerId = async (name: string) => {
    const k = name.trim().toLowerCase();
    let id = byName.get(k);
    if (!id) {
      const order = Math.max(-1, ...store.byTrip('travelers', tripId).map((t) => t.sort_order)) + 1;
      id = (await store.create('travelers', newTraveler(tripId, { name: name.trim(), sort_order: order, color: ['#e2725b', '#3d8f8a', '#d9a521', '#6a6fc4', '#c2577f', '#5f9e4c'][order % 6] }))).id;
      byName.set(k, id);
      addedTravelers.push(name.trim());
    }
    return id;
  };

  // 圖片先存到手機，連上網路後自動上傳
  const paths = new Map<string, string>();
  for (const [key, url] of Object.entries(d.images ?? {})) {
    const blob = dataUrlToBlob(url);
    const path = `${tripId}/imp-${stableId(`${d.id}:${key}`).slice(0, 13)}.${blob.type === 'image/png' ? 'png' : 'jpg'}`;
    await store.saveFile(path, blob, true);
    paths.set(key, path);
  }

  // 分組
  for (const [date, g] of Object.entries(d.groups ?? {})) {
    const assignments: Record<string, string> = {};
    for (const [group, names] of Object.entries(g.members)) for (const n of names) assignments[await travelerId(n)] = group;
    const values: Partial<DayPlan> = { mode: 'split', groups: Object.keys(g.names), group_names: g.names, assignments };
    await saveDayPlan(store, tripId, date, values);
  }

  // 行程
  const ids = new Map<string, string>();
  for (const a of d.activities) ids.set(a.key, crypto.randomUUID());
  for (const a of d.activities) {
    await store.create('activities', newActivity(tripId, {
      id: ids.get(a.key)!, date: a.date, start_time: a.time || null, kind: a.kind, title: a.title.trim(), notes: a.notes ?? '',
      map_url: a.map_url && safeUrl(a.map_url) ? safeUrl(a.map_url)! : '',
      links: (a.links ?? []).filter((l) => safeUrl(l.url)).map((l) => ({ label: l.label, url: safeUrl(l.url)! })),
      audience_groups: a.group ? [a.group] : [],
      images: (a.images ?? []).filter((k) => paths.has(k)).map((k) => ({ id: crypto.randomUUID(), path: paths.get(k)! })),
      after_activity_id: !a.time && a.after ? ids.get(a.after) ?? null : null,
    }));
  }

  // 路線：前後是行程的用固定 id（跟路線頁自動產生的同一段）；其他的是自己加的
  for (const l of d.legs ?? []) {
    const from = l.from ? ids.get(l.from) ?? null : null;
    const to = l.to ? ids.get(l.to) ?? null : null;
    const group = l.group ?? '';
    const custom = !(from && to);
    const plans = l.plans.filter((p) => p.steps.length || !l.plans.length);
    const values = {
      date: l.date, group_key: group, from_activity_id: from, to_activity_id: to,
      from_name: from ? '' : l.from_name ?? '', to_name: to ? '' : l.to_name ?? '',
      start_time: l.start_time || null, custom, steps: plans[0]?.steps ?? [], plans: plans.length > 1 ? plans : [], notes: l.notes ?? '',
    };
    const id = custom ? crypto.randomUUID() : legId(tripId, l.date, group, from!, to!);
    if (store.get('route_legs', id)) await store.update('route_legs', id, { ...values, dismissed: false, deleted_at: null });
    else await store.create('route_legs', newLeg(tripId, { ...values, id }));
  }

  // 完整路線圖、記住已經匯入過
  const maps = [...(trip.settings?.maps ?? [])];
  for (const m of d.maps ?? []) {
    const path = paths.get(m.image);
    if (path && !maps.some((x) => x.path === path || x.label === m.label)) maps.push({ id: crypto.randomUUID(), label: m.label, path });
  }
  const imports = [...(trip.settings?.imports ?? []), d.id];
  await store.update('trips', tripId, { settings: { ...trip.settings, maps, imports } });
  return { activities: d.activities.length, addedTravelers, replaced: old.length };
}

export function alreadyImported(settings: { imports?: string[] } | undefined, id: string): boolean {
  return Boolean(settings?.imports?.includes(id));
}
