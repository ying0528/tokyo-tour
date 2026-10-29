// 資料型別：欄位名稱與資料庫（supabase/schema.sql）完全一致，避免舊版「簡介／介紹」對不上的問題。

export type ISODate = string; // 'YYYY-MM-DD'
export type ISOTime = string; // 'HH:MM' 或 'HH:MM:SS'

interface SyncedBase {
  id: string;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
  /** 伺服器版本號；0 代表還沒上傳過 */
  rev: number;
}

interface TripContent extends SyncedBase {
  trip_id: string;
}

export interface Trip extends SyncedBase {
  owner_id: string;
  title: string;
  destination: string;
  start_date: ISODate;
  end_date: ISODate;
  timezone: string;
  cover_path: string | null;
  notes: string;
  settings: TripSettings;
  archived_at: string | null;
}

export interface TripSettings {
  /** 是否顯示「已完成」打勾功能（預設關閉） */
  show_done?: boolean;
}

export interface Traveler extends TripContent {
  name: string;
  color: string;
  sort_order: number;
  notes: string;
}

export type PlaceKind = 'sight' | 'food' | 'lodging' | 'shop' | 'other';

export interface Place extends TripContent {
  name: string;
  kind: PlaceKind;
  address: string;
  map_url: string;
  description: string;
  notes: string;
  image_path: string | null;
}

export type ActivityKind = 'sight' | 'food' | 'lodging' | 'move' | 'other';

export interface Activity extends TripContent {
  date: ISODate;
  start_time: ISOTime | null;
  duration_min: number | null;
  kind: ActivityKind;
  place_id: string | null;
  title: string;
  from_name: string;
  to_name: string;
  cost: number | null;
  currency: string;
  notes: string;
  audience_groups: string[];
  audience_travelers: string[];
}

export type RouteMode = 'subway' | 'bus' | 'walk' | 'uber' | 'taxi' | 'train' | 'other';

export interface RouteStep extends TripContent {
  activity_id: string;
  sort_order: number;
  mode: RouteMode;
  line: string;
  direction: string;
  from_stop: string;
  to_stop: string;
  exit_info: string;
  transfer_info: string;
  depart_time: ISOTime | null;
  duration_min: number | null;
  cost: number | null;
  notes: string;
}

export interface Ticket extends TripContent {
  title: string;
  kind: string;
  file_path: string | null;
  file_type: 'image' | 'pdf' | null;
  file_size: number | null;
  traveler_ids: string[];
  activity_ids: string[];
  sort_order: number;
  notes: string;
}

export interface DayPlan extends TripContent {
  date: ISODate;
  mode: 'together' | 'split';
  groups: string[];
  /** 同行者 id → 組別，例如 { "<id>": "A" } */
  assignments: Record<string, string>;
  notes: string;
}

export interface PersonalStatus extends TripContent {
  activity_id: string;
  traveler_id: string;
  done: boolean;
  note: string;
}

/** 由同步引擎處理的資料表，順序也是上傳順序（被參照的表在前） */
export const TABLES = [
  'trips',
  'travelers',
  'places',
  'activities',
  'route_steps',
  'tickets',
  'day_plans',
  'personal_status',
] as const;

export type TableName = (typeof TABLES)[number];

export interface RowMap {
  trips: Trip;
  travelers: Traveler;
  places: Place;
  activities: Activity;
  route_steps: RouteStep;
  tickets: Ticket;
  day_plans: DayPlan;
  personal_status: PersonalStatus;
}

export type AnyRow = RowMap[TableName];

/** 伺服器自動管理、上傳時不送出的欄位 */
export const SERVER_FIELDS = ['created_at', 'updated_at', 'updated_by', 'rev'] as const;

export type Role = 'owner' | 'editor' | 'viewer';

export interface Member {
  trip_id: string;
  user_id: string;
  role: Role;
  traveler_id: string | null;
  see_all_groups: boolean;
  display_name: string;
  created_at: string;
}

export interface Invite {
  id: string;
  trip_id: string;
  token: string;
  role: 'editor' | 'viewer';
  see_all_groups: boolean;
  created_at: string;
  revoked_at: string | null;
}

export interface InvitePreview {
  trip_id: string;
  title: string;
  destination: string;
  start_date: ISODate;
  end_date: ISODate;
  role: 'editor' | 'viewer';
  already_member: boolean;
  travelers: { id: string; name: string; color: string }[];
}

/** 待同步佇列的一筆 */
export interface OutboxEntry {
  key: string; // `${table}:${id}`
  table: TableName;
  id: string;
  trip_id: string;
  op: 'insert' | 'update';
  /** insert：整筆資料；update：只有改動的欄位 */
  patch: Record<string, unknown>;
  /** 修改時以哪個伺服器版本為基礎 */
  base_rev: number;
  seq: number;
  /** 每次本機再修改就 +1，用來判斷上傳途中是否又被改過 */
  local_version: number;
  status: 'pending' | 'failed';
  attempts: number;
  last_error: string | null;
}

export interface SyncNotice {
  id: string;
  at: string;
  message: string;
}
