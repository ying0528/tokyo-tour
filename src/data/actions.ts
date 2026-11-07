// 儲存動作：一個操作會牽動的資料（景點、交通步驟、票券關聯）都在這裡一起處理，畫面只要呼叫一次。
import { newActivity, newDayPlan, newLeg, newList, newListCheck, newPlace, newPrivateNote, newRouteStep, newTicket, newTraveler, newTrip } from './factories.ts';
import type { LocalStore } from './store.ts';
import type { Activity, ActivityKind, DayPlan, LegPlan, LegStep, ListItem, NamedLink, Place, PlaceKind, PrivateNote, RouteLeg, RouteMode, RouteStep, Ticket, Traveler, Trip, TripList } from './types.ts';
import { dayLegs, legId, stepFromLegacy } from '../lib/legs.ts';
import type { LegView } from '../lib/legs.ts';
import { dayPlanId, isSplit, sortActivities, stableId } from '../lib/plan.ts';
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
  /** 補充圖片（已存在的用 path；新選的用 blob，儲存時才存到手機） */
  images: { id: string; path?: string; blob?: Blob }[];
  /** 沒填時間時排在哪個行程後面 */
  after_activity_id?: string | null;
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
    images: (a.images ?? []).map((x) => ({ ...x })),
    after_activity_id: a.after_activity_id ?? null,
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
    after_activity_id: d.start_time ? null : d.after_activity_id ?? null,
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

  // 新選的圖片先存到手機，之後自動上傳
  const images: { id: string; path: string }[] = [];
  for (const img of d.images ?? []) {
    if (img.path) images.push({ id: img.id, path: img.path });
    else if (img.blob) {
      const path = `${tripId}/act-${img.id}.${img.blob.type === 'image/png' ? 'png' : 'jpg'}`;
      await store.saveFile(path, img.blob, true);
      images.push({ id: img.id, path });
    }
  }
  fields.images = images;

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

// ---------- 清單 ----------

export function listsOf(store: LocalStore, tripId: string, userId: string | null | undefined): { mine: TripList[]; shared: TripList[] } {
  const all = store.byTrip('lists', tripId)
    .sort((a, b) => a.sort_order - b.sort_order || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const mineOrShared = (l: TripList) => l.owner_id === userId || Boolean(userId && (l.editors ?? []).includes(userId));
  return {
    mine: all.filter(mineOrShared),
    shared: all.filter((l) => !mineOrShared(l) && l.shared),
  };
}

/** 圖示可以是 emoji，或自訂的小圖（data:image/...，不能太大） */
function checkIcon(icon: string | undefined) {
  if (icon && icon.startsWith('data:') && (icon.length > 120_000 || !/^data:image\/(jpeg|png|webp);base64,/.test(icon))) throw new Error('這張圖示圖片不能用，換一張試試');
}

export async function createList(store: LocalStore, tripId: string, userId: string, title: string, icon: string): Promise<string> {
  const t = title.trim();
  if (!t) throw new Error('請輸入清單名稱');
  checkIcon(icon);
  const order = Math.max(-1, ...store.byTrip('lists', tripId).filter((l) => l.owner_id === userId).map((l) => l.sort_order)) + 1;
  return (await store.create('lists', newList(tripId, userId, { title: t, icon, sort_order: order }))).id;
}

/** 能不能編輯這個清單（自己的，或別人跟我共用的） */
export function canEditList(l: Pick<TripList, 'owner_id' | 'editors'> | undefined, userId: string | null | undefined): boolean {
  return Boolean(l && userId && (l.owner_id === userId || (l.editors ?? []).includes(userId)));
}

export async function updateList(store: LocalStore, listId: string, values: Partial<Pick<TripList, 'title' | 'icon' | 'shared' | 'editors'>>) {
  if (values.title !== undefined && !values.title.trim()) throw new Error('請輸入清單名稱');
  checkIcon(values.icon);
  await store.update('lists', listId, values.title !== undefined ? { ...values, title: values.title.trim() } : values);
}

export function validateListItem(item: Pick<ListItem, 'kind' | 'text' | 'url' | 'path'>): string | null {
  if (item.kind === 'text') return item.text.trim() ? null : '請輸入文字';
  if (item.kind === 'image') return item.path ? null : '請選一張圖片';
  if (!item.text.trim()) return '請輸入顯示的名字';
  if (!item.url?.trim()) return '請貼上網址';
  if (!safeUrl(item.url)) return '網址要是 https:// 開頭';
  return null;
}

/** 新增或修改清單裡的一項（itemId 為 null＝新增） */
export async function saveListItem(store: LocalStore, listId: string, itemId: string | null, item: Pick<ListItem, 'kind' | 'text' | 'url' | 'path'>): Promise<string> {
  const err = validateListItem(item);
  if (err) throw new Error(err);
  const list = store.get('lists', listId);
  if (!list) throw new Error('找不到這個清單');
  const id = itemId ?? crypto.randomUUID();
  const clean: ListItem = item.kind === 'link'
    ? { id, kind: 'link', text: item.text.trim(), url: safeUrl(item.url ?? '') ?? '' }
    : item.kind === 'image'
      ? { id, kind: 'image', text: item.text.trim(), path: item.path }
      : { id, kind: 'text', text: item.text.trim() };
  const items = itemId ? list.items.map((x) => (x.id === itemId ? clean : x)) : [...list.items, clean];
  await store.update('lists', listId, { items });
  return clean.id;
}

export async function deleteListItem(store: LocalStore, listId: string, itemId: string) {
  const list = store.get('lists', listId);
  if (!list) return;
  await store.update('lists', listId, { items: list.items.filter((x) => x.id !== itemId) });
}

export async function moveListItem(store: LocalStore, listId: string, itemId: string, dir: -1 | 1) {
  const list = store.get('lists', listId);
  if (!list) return;
  const items = [...list.items];
  const i = items.findIndex((x) => x.id === itemId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  await store.update('lists', listId, { items });
}

export function listCheckId(userId: string, listId: string): string {
  return stableId(`check:${userId}:${listId}`);
}

/** 我在這個清單打勾的項目（只有自己看得到） */
export function checkedItems(store: LocalStore, listId: string, userId: string | null | undefined): Set<string> {
  if (!userId) return new Set();
  const c = store.get('list_checks', listCheckId(userId, listId));
  return new Set(c && !c.deleted_at ? c.checked : []);
}

/** 我有沒有釘選這個清單 */
export function isPinned(store: LocalStore, listId: string, userId: string | null | undefined): boolean {
  if (!userId) return false;
  const c = store.get('list_checks', listCheckId(userId, listId));
  return Boolean(c && !c.deleted_at && c.pinned);
}

export async function togglePin(store: LocalStore, tripId: string, listId: string, userId: string) {
  const id = listCheckId(userId, listId);
  const cur = store.get('list_checks', id);
  if (cur) await store.update('list_checks', id, { pinned: !cur.pinned, deleted_at: null });
  else await store.create('list_checks', { ...newListCheck(tripId, listId, userId, id, []), pinned: true });
}

export async function toggleListCheck(store: LocalStore, tripId: string, listId: string, userId: string, itemId: string) {
  const id = listCheckId(userId, listId);
  const cur = store.get('list_checks', id);
  const set = new Set(cur && !cur.deleted_at ? cur.checked : []);
  if (set.has(itemId)) set.delete(itemId);
  else set.add(itemId);
  if (cur) await store.update('list_checks', id, { checked: [...set], deleted_at: null });
  else await store.create('list_checks', newListCheck(tripId, listId, userId, id, [...set]));
}

// ---------- 路線 ----------

/** 這段路線存到手機（還沒存過就建立），回傳 id */
export async function ensureLeg(store: LocalStore, tripId: string, date: string, group: string, v: LegView): Promise<string> {
  if (store.get('route_legs', v.id)) return v.id;
  await store.create('route_legs', newLeg(tripId, {
    id: v.id, date, group_key: group, from_activity_id: v.from?.id ?? null, to_activity_id: v.to?.id ?? null,
    from_name: v.fromName, to_name: v.toName,
  }));
  return v.id;
}

/** 按「不需要」：先藏起來，之後可以從「新增路線」找回來 */
export async function dismissLeg(store: LocalStore, tripId: string, date: string, group: string, v: LegView) {
  const id = await ensureLeg(store, tripId, date, group, v);
  await store.update('route_legs', id, { dismissed: true });
}

export async function restoreLeg(store: LocalStore, id: string) {
  await store.update('route_legs', id, { dismissed: false, deleted_at: null });
}

/** 自己加一段（例如從飯店出發） */
export async function addCustomLeg(store: LocalStore, tripId: string, date: string, group: string,
  from: { activityId: string | null; name: string }, to: { activityId: string | null; name: string }): Promise<string> {
  if (!from.activityId && !from.name.trim()) throw new Error('請選擇或輸入起點');
  if (!to.activityId && !to.name.trim()) throw new Error('請選擇或輸入終點');
  if (from.activityId && from.activityId === to.activityId) throw new Error('起點和終點不能一樣');
  return (await store.create('route_legs', newLeg(tripId, {
    date, group_key: group, custom: true,
    from_activity_id: from.activityId, to_activity_id: to.activityId,
    from_name: from.activityId ? '' : from.name.trim(), to_name: to.activityId ? '' : to.name.trim(),
  }))).id;
}

export async function saveLegSteps(store: LocalStore, id: string, steps: LegStep[], notes: string) {
  await store.update('route_legs', id, { steps, plans: [], notes, dismissed: false });
}

/** 儲存所有方案；第一個方案是主要的（行程頁顯示它） */
export async function saveLegPlans(store: LocalStore, id: string, plans: LegPlan[], notes: string, startTime: string | null) {
  const clean = plans.filter((p, i) => i === 0 || p.steps.length || p.label.trim());
  await store.update('route_legs', id, {
    plans: clean.length > 1 ? clean : [], steps: clean[0]?.steps ?? [], notes, start_time: startTime || null, dismissed: false,
  });
}

/** 自己加的段刪掉；自動產生的段改成「不需要」 */
export async function removeLeg(store: LocalStore, leg: RouteLeg) {
  if (leg.custom) await store.softDelete('route_legs', leg.id);
  else await store.update('route_legs', leg.id, { dismissed: true });
}

/** 舊版的「移動」行程數量 */
export function legacyMoves(store: LocalStore, tripId: string): Activity[] {
  return store.byTrip('activities', tripId).filter((a) => a.kind === 'move');
}

/**
 * 把舊的「移動」行程轉成路線：放到它前後兩個行程之間那一段，交通步驟一起帶過去，
 * 原本的移動行程移到回收桶（可以還原）。回傳轉換了幾筆。
 */
export async function convertMoves(store: LocalStore, tripId: string): Promise<number> {
  const moves = sortActivities(legacyMoves(store, tripId));
  const activities = store.byTrip('activities', tripId);
  let n = 0;
  for (const m of moves) {
    const plan = dayPlanOf(store, tripId, m.date);
    const group = isSplit(plan) && m.audience_groups.length === 1 && m.audience_travelers.length === 0 ? m.audience_groups[0] : '';
    const { activities: acts } = dayLegs(tripId, m.date, group, plan, activities, []);
    const t = m.start_time ? m.start_time.slice(0, 5) : null;
    const before = t ? [...acts].reverse().find((a) => a.start_time && a.start_time.slice(0, 5) <= t) : undefined;
    const after = t ? acts.find((a) => a.start_time && a.start_time.slice(0, 5) > t) : undefined;
    const idx = before ? acts.indexOf(before) : -1;
    const steps = liveSteps(store, m.id).map(stepFromLegacy);
    const notes = m.notes;
    if (before && after && acts[idx + 1] === after) {
      const id = legId(tripId, m.date, group, before.id, after.id);
      const cur = store.get('route_legs', id);
      if (cur && cur.steps.length) {
        // 這段已經設定過：另外加一段，不覆蓋
        await store.create('route_legs', newLeg(tripId, { date: m.date, group_key: group, custom: true, from_activity_id: before.id, to_activity_id: after.id, steps, notes, start_time: m.start_time }));
      } else if (cur) {
        await store.update('route_legs', id, { steps, notes, dismissed: false });
      } else {
        await store.create('route_legs', newLeg(tripId, {
          id, date: m.date, group_key: group, from_activity_id: before.id, to_activity_id: after.id, steps, notes,
        }));
      }
    } else {
      await store.create('route_legs', newLeg(tripId, {
        date: m.date, group_key: group, custom: true,
        from_activity_id: before?.id ?? null, to_activity_id: after?.id ?? null,
        from_name: before ? '' : m.from_name || '出發地', to_name: after ? '' : m.to_name || '目的地',
        start_time: m.start_time, steps, notes,
      }));
    }
    await store.softDelete('activities', m.id);
    n++;
  }
  return n;
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
  /** 第四版之後的備份才有 */
  route_legs?: RouteLeg[];
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
    route_legs: store.byTrip('route_legs', tripId),
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
    for (const l of (src.route_legs ?? []).filter((x) => !x.deleted_at)) {
      const from = l.from_activity_id ? remap(l.from_activity_id) ?? null : null;
      const to = l.to_activity_id ? remap(l.to_activity_id) ?? null : null;
      if ((l.from_activity_id && !from) || (l.to_activity_id && !to)) continue;
      const date = move(l.date);
      const group = opts.groups ? l.group_key : '';
      if (!opts.groups && l.group_key) continue;
      await store.create('route_legs', newLeg(trip.id, {
        id: !l.custom && from && to ? legId(trip.id, date, group, from, to) : crypto.randomUUID(),
        date, group_key: group, from_activity_id: from, to_activity_id: to, from_name: l.from_name, to_name: l.to_name,
        start_time: l.start_time, custom: l.custom, dismissed: l.dismissed, steps: l.steps, notes: l.notes,
      }));
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
