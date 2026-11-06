// 儲存動作：一個操作會牽動的資料（景點、交通步驟、票券關聯）都在這裡一起處理，畫面只要呼叫一次。
import { newActivity, newDayPlan, newPlace, newPrivateNote, newRouteStep, newTicket, newTraveler, newTrip } from './factories.ts';
import type { LocalStore } from './store.ts';
import type { Activity, ActivityKind, DayPlan, NamedLink, Place, PlaceKind, PrivateNote, RouteMode, RouteStep, Ticket, Traveler, Trip } from './types.ts';
import { dayPlanId, stableId } from '../lib/plan.ts';
import { safeUrl } from '../lib/links.ts';
import { addDays, daysBetween } from '../lib/dates.ts';

// ---------- 行程 ----------

export interface StepDraft {
  id: string | null;
  mode: RouteMode;
  line: string;
  direction: string;
  from_stop: string;
  to_stop: string;
  exit_info: string;
  transfer_info: string;
  depart_time: string | null;
  duration_min: number | null;
  notes: string;
}

export interface ActivityDraft {
  kind: ActivityKind;
  date: string;
  start_time: string | null;
  notes: string;
  audience_groups: string[];
  audience_travelers: string[];
  /** 景點、用餐、住宿的名稱 */
  name: string;
  /** 移動類 */
  from_name: string;
  to_name: string;
  steps: StepDraft[];
  /** 地圖連結與其他連結 */
  map_url: string;
  links: NamedLink[];
}

export function emptyStep(mode: RouteMode = 'subway'): StepDraft {
  return {
    id: null, mode, line: '', direction: '', from_stop: '', to_stop: '', exit_info: '', transfer_info: '',
    depart_time: null, duration_min: null, notes: '',
  };
}

export function stepToDraft(s: RouteStep): StepDraft {
  return {
    id: s.id, mode: s.mode, line: s.line, direction: s.direction, from_stop: s.from_stop, to_stop: s.to_stop,
    exit_info: s.exit_info, transfer_info: s.transfer_info, depart_time: s.depart_time, duration_min: s.duration_min, notes: s.notes,
  };
}

export function liveSteps(store: LocalStore, activityId: string): RouteStep[] {
  return store.all('route_steps')
    .filter((s) => s.activity_id === activityId && !s.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
}

export function draftFromActivity(store: LocalStore, a: Activity): ActivityDraft {
  const place = store.get('places', a.place_id);
  return {
    kind: a.kind, date: a.date, start_time: a.start_time ? a.start_time.slice(0, 5) : null,
    notes: a.notes, audience_groups: [...a.audience_groups], audience_travelers: [...a.audience_travelers],
    name: a.kind === 'move' ? '' : a.title.trim() || place?.name || '',
    from_name: a.from_name, to_name: a.to_name, steps: liveSteps(store, a.id).map(stepToDraft),
    map_url: a.map_url ?? '', links: (a.links ?? []).map((l) => ({ ...l })),
  };
}

/** 舊版留下的：同一趟旅行中名稱相同的景點 */
export function findPlaceByName(store: LocalStore, tripId: string, name: string): Place | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return store.byTrip('places', tripId).find((p) => p.name.trim().toLowerCase() === key);
}

/** 有幾筆行程使用這個景點（舊版資料） */
export function placeUsage(store: LocalStore, placeId: string, exceptActivityId?: string): Activity[] {
  return store.all('activities').filter((a) => a.place_id === placeId && !a.deleted_at && a.id !== exceptActivityId);
}

export interface ValidationError { field: string; message: string }

/** 連結沒填名稱時，用網站名稱當預設 */
export function linkLabel(l: NamedLink): string {
  if (l.label.trim()) return l.label.trim();
  try {
    return new URL(safeUrl(l.url) ?? l.url).hostname.replace(/^www\./, '');
  } catch {
    return '連結';
  }
}

export function validateActivity(d: ActivityDraft): ValidationError | null {
  if (!d.date) return { field: 'date', message: '請選擇日期' };
  if (d.kind === 'move') {
    if (!d.from_name.trim() && !d.to_name.trim()) return { field: 'from_name', message: '請輸入起點或終點' };
  } else if (!d.name.trim()) {
    return { field: 'name', message: '請輸入名稱' };
  }
  if (d.map_url.trim() && !safeUrl(d.map_url)) return { field: 'map_url', message: '地圖連結要是 https:// 開頭的網址' };
  const bad = d.links.findIndex((l) => l.url.trim() && !safeUrl(l.url));
  if (bad >= 0) return { field: `link-${bad}`, message: '這個連結不是正確的網址' };
  return null;
}

/** 新增或修改一筆行程（連同交通步驟），回傳行程 id */
export async function saveActivity(store: LocalStore, tripId: string, existingId: string | null, d: ActivityDraft): Promise<string> {
  const err = validateActivity(d);
  if (err) throw new Error(err.message);
  const existing = existingId ? store.get('activities', existingId) : undefined;
  const isMove = d.kind === 'move';
  const fields: Partial<Activity> = {
    kind: d.kind, date: d.date, start_time: d.start_time || null, notes: d.notes,
    audience_groups: d.audience_groups, audience_travelers: d.audience_travelers,
    place_id: null,
    title: isMove ? '' : d.name.trim(),
    from_name: isMove ? d.from_name.trim() : '',
    to_name: isMove ? d.to_name.trim() : '',
    map_url: d.map_url.trim() ? safeUrl(d.map_url) ?? '' : '',
    links: d.links
      .filter((l) => l.url.trim())
      .map((l) => ({ label: l.label.trim(), url: safeUrl(l.url) ?? '' }))
      .filter((l) => l.url),
  };

  let id: string;
  if (existing) {
    await store.update('activities', existing.id, fields);
    id = existing.id;
  } else {
    id = (await store.create('activities', newActivity(tripId, { ...fields, date: d.date }))).id;
  }

  // 交通步驟：只有移動類保留；換成其他類型時移到回收桶
  const current = liveSteps(store, id);
  const keep = isMove ? d.steps : [];
  const keepIds = new Set(keep.map((s) => s.id).filter(Boolean));
  for (const s of current) if (!keepIds.has(s.id)) await store.softDelete('route_steps', s.id);
  for (let i = 0; i < keep.length; i++) {
    const { id: stepId, ...rest } = keep[i];
    const values = { ...rest, sort_order: i };
    if (stepId && store.get('route_steps', stepId)) await store.update('route_steps', stepId, values);
    else await store.create('route_steps', newRouteStep(tripId, id, values));
  }
  return id;
}

// ---------- 私人備忘錄 ----------

export function privateNoteId(userId: string, activityId: string): string {
  return stableId(`note:${userId}:${activityId}`);
}

export function getPrivateNote(store: LocalStore, activityId: string, userId: string): PrivateNote | undefined {
  const n = store.get('private_notes', privateNoteId(userId, activityId));
  return n && !n.deleted_at ? n : undefined;
}

export async function savePrivateNote(store: LocalStore, tripId: string, activityId: string, userId: string, note: string) {
  const id = privateNoteId(userId, activityId);
  const existing = store.get('private_notes', id);
  if (existing) await store.update('private_notes', id, { note, deleted_at: null });
  else if (note.trim()) await store.create('private_notes', newPrivateNote(tripId, activityId, userId, id, note));
}

export function deleteActivity(store: LocalStore, id: string) {
  return store.softDelete('activities', id);
}

export function restoreActivity(store: LocalStore, id: string) {
  return store.restore('activities', id);
}

// ---------- 景點 ----------

export interface PlaceDraft {
  name: string;
  kind: PlaceKind;
  address: string;
  map_url: string;
  description: string;
  notes: string;
}

export async function savePlace(store: LocalStore, tripId: string, existingId: string | null, d: PlaceDraft): Promise<string> {
  const name = d.name.trim();
  if (!name) throw new Error('請輸入名稱');
  const dup = findPlaceByName(store, tripId, name);
  if (dup && dup.id !== existingId) throw new Error(`已經有「${dup.name}」了`);
  const values = { ...d, name, address: d.address.trim(), map_url: d.map_url.trim() };
  if (existingId) {
    await store.update('places', existingId, values);
    return existingId;
  }
  return (await store.create('places', newPlace(tripId, values))).id;
}

/** 刪除景點：用到它的行程保留下來，名稱改存在行程本身 */
export async function deletePlace(store: LocalStore, placeId: string) {
  const place = store.get('places', placeId);
  if (!place) return;
  for (const a of placeUsage(store, placeId)) {
    await store.update('activities', a.id, { place_id: null, title: a.title.trim() || place.name });
  }
  await store.softDelete('places', placeId);
}

// ---------- 每日設定（分組） ----------

export function dayPlanOf(store: LocalStore, tripId: string, date: string): DayPlan | undefined {
  const p = store.get('day_plans', dayPlanId(tripId, date));
  if (p && !p.deleted_at) return p;
  return store.byTrip('day_plans', tripId).find((x) => x.date === date);
}

export async function saveDayPlan(store: LocalStore, tripId: string, date: string, values: Partial<DayPlan>) {
  const existing = dayPlanOf(store, tripId, date) ?? store.get('day_plans', dayPlanId(tripId, date));
  if (existing) {
    await store.update('day_plans', existing.id, { ...values, deleted_at: null });
    return existing.id;
  }
  return (await store.create('day_plans', newDayPlan(tripId, date, dayPlanId(tripId, date), values))).id;
}

// ---------- 票券 ----------

export interface TicketDraft {
  title: string;
  kind: string;
  traveler_ids: string[];
  activity_ids: string[];
  notes: string;
  /** 新選的檔案（沒有換檔案時為 null） */
  file: Blob | null;
  fileName: string;
}

function extOf(type: string, name: string): string {
  const fromName = name.split('.').pop()?.toLowerCase() ?? '';
  if (type === 'application/pdf') return 'pdf';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/heic' || type === 'image/heif') return 'heic';
  if (type.startsWith('image/')) return 'jpg';
  return fromName.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
}

export async function saveTicket(store: LocalStore, tripId: string, existingId: string | null, d: TicketDraft): Promise<string> {
  const title = d.title.trim();
  if (!title) throw new Error('請輸入票券名稱');
  const id = existingId ?? crypto.randomUUID();
  const values: Partial<Ticket> = {
    title, kind: d.kind.trim(), traveler_ids: d.traveler_ids, activity_ids: d.activity_ids, notes: d.notes,
  };
  if (d.file) {
    const path = `${tripId}/${id}-${Date.now().toString(36)}.${extOf(d.file.type, d.fileName)}`;
    await store.saveFile(path, d.file, true);
    values.file_path = path;
    values.file_type = d.file.type === 'application/pdf' ? 'pdf' : 'image';
    values.file_size = d.file.size;
  }
  if (existingId) {
    await store.update('tickets', existingId, values);
  } else {
    const order = Math.max(-1, ...store.byTrip('tickets', tripId).map((t) => t.sort_order)) + 1;
    await store.create('tickets', newTicket(tripId, { ...values, id, sort_order: order }));
  }
  return id;
}

// ---------- 備份、還原、複製 ----------

export const BACKUP_FORMAT = 'family-trip-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exported_at: string;
  trip: Trip;
  travelers: Traveler[];
  places: Place[];
  activities: Activity[];
  route_steps: RouteStep[];
  tickets: Ticket[];
  day_plans: DayPlan[];
}

export function exportTrip(store: LocalStore, tripId: string): Backup {
  const trip = store.get('trips', tripId);
  if (!trip) throw new Error('找不到這趟旅行');
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exported_at: new Date().toISOString(),
    trip,
    travelers: store.byTrip('travelers', tripId),
    places: store.byTrip('places', tripId),
    activities: store.byTrip('activities', tripId),
    route_steps: store.byTrip('route_steps', tripId),
    tickets: store.byTrip('tickets', tripId),
    day_plans: store.byTrip('day_plans', tripId),
  };
}

export function parseBackup(text: string): Backup {
  let data: Backup;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('這不是備份檔（無法讀取）');
  }
  if (data?.format !== BACKUP_FORMAT || !data.trip?.start_date) throw new Error('這不是家庭旅行的備份檔');
  return data;
}

export interface CopyOptions {
  title: string;
  start_date: string;
  /** 帶入行程、景點、交通（不含票券） */
  itinerary: boolean;
  /** 帶入分組設定（預設不帶） */
  groups: boolean;
}

/** 從備份或現有旅行建立一趟新的旅行；所有 id 重新產生，日期依新的開始日平移 */
export async function copyTrip(store: LocalStore, ownerId: string, src: Backup, opts: CopyOptions): Promise<string> {
  const shift = daysBetween(src.trip.start_date, opts.start_date);
  const move = (d: string) => addDays(d, shift);
  const trip = await store.create('trips', newTrip(ownerId, {
    title: opts.title.trim() || src.trip.title,
    destination: src.trip.destination,
    start_date: opts.start_date,
    end_date: move(src.trip.end_date),
    timezone: src.trip.timezone,
    notes: src.trip.notes,
    settings: { ...src.trip.settings },
  }));
  const idMap = new Map<string, string>();
  const remap = (id: string) => idMap.get(id);

  for (const t of src.travelers.filter((x) => !x.deleted_at)) {
    const n = await store.create('travelers', newTraveler(trip.id, { name: t.name, color: t.color, sort_order: t.sort_order, notes: t.notes }));
    idMap.set(t.id, n.id);
  }
  if (opts.itinerary) {
    for (const p of src.places.filter((x) => !x.deleted_at)) {
      const { name, kind, address, map_url, description, notes } = p;
      const n = await store.create('places', newPlace(trip.id, { name, kind, address, map_url, description, notes }));
      idMap.set(p.id, n.id);
    }
    for (const a of src.activities.filter((x) => !x.deleted_at)) {
      const n = await store.create('activities', newActivity(trip.id, {
        date: move(a.date), start_time: a.start_time, duration_min: a.duration_min, kind: a.kind,
        place_id: a.place_id ? remap(a.place_id) ?? null : null, title: a.title || (a.place_id && !remap(a.place_id) ? src.places.find((p) => p.id === a.place_id)?.name ?? '' : ''),
        from_name: a.from_name, to_name: a.to_name, cost: a.cost, currency: a.currency, notes: a.notes,
        map_url: a.map_url ?? '', links: a.links ?? [],
        audience_groups: opts.groups ? a.audience_groups : [],
        audience_travelers: opts.groups ? a.audience_travelers.map(remap).filter((x): x is string => Boolean(x)) : [],
      }));
      idMap.set(a.id, n.id);
    }
    for (const s of src.route_steps.filter((x) => !x.deleted_at && remap(x.activity_id))) {
      const { id: _i, trip_id: _t, activity_id, created_at: _c, updated_at: _u, updated_by: _b, rev: _r, deleted_at: _d, ...rest } = s;
      await store.create('route_steps', newRouteStep(trip.id, remap(activity_id)!, rest));
    }
  }
  for (const p of src.day_plans.filter((x) => !x.deleted_at)) {
    const date = move(p.date);
    const values: Partial<DayPlan> = { title: p.title, notes: p.notes };
    if (opts.groups) {
      values.mode = p.mode;
      values.groups = p.groups;
      values.group_names = p.group_names;
      values.assignments = Object.fromEntries(Object.entries(p.assignments).map(([k, v]) => [remap(k), v]).filter(([k]) => k));
    }
    if (values.title || values.notes || opts.groups) {
      await store.create('day_plans', newDayPlan(trip.id, date, dayPlanId(trip.id, date), values));
    }
  }
  return trip.id;
}
