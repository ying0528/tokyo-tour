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
  /** 路線頁「完整路線圖」：管理者上傳的圖片 */
  maps?: { id: string; label: string; path: string }[];
  /** 已把舊的「移動」行程轉成路線 */
  moves_converted?: boolean;
}

export interface Traveler extends TripContent {
  name: string;
  color: string;
  sort_order: number;
  notes: string;
}

export type PlaceKind = 'sight' | 'food' | 'shop' | 'toilet' | 'lodging' | 'other';

export interface Place extends TripContent {
  name: string;
  kind: PlaceKind;
  address: string;
  map_url: string;
  description: string;
  notes: string;
  image_path: string | null;
}

export type ActivityKind = PlaceKind | 'move';

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
  /** 地圖連結（Google Maps、Naver Map 都可以） */
  map_url: string;
  /** 其他連結，可自己命名 */
  links: NamedLink[];
}

export interface NamedLink {
  label: string;
  url: string;
}

/** 私人備忘錄：只有寫的人自己看得到 */
export interface PrivateNote extends TripContent {
  activity_id: string;
  user_id: string;
  note: string;
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
  /** 組別 → 名稱，例如 { "A": "逛街組" } */
  group_names: Record<string, string>;
  /** 這天的主題，例如「澀谷・原宿」 */
  title: string;
  notes: string;
}

/** 清單的一項：文字、連結或圖片（擇一） */
export interface ListItem {
  id: string;
  kind: 'text' | 'link' | 'image';
  /** 文字項目的內容；連結項目顯示的名字；圖片的說明（可空白） */
  text: string;
  url?: string;
  /** 圖片檔案位置（旅行 id/檔名） */
  path?: string;
}

/** 清單：每個人自己的，可以分享給大家看 */
export interface TripList extends TripContent {
  owner_id: string;
  title: string;
  icon: string;
  shared: boolean;
  sort_order: number;
  items: ListItem[];
}

/** 清單打勾：每個人自己的 */
export interface ListCheck extends TripContent {
  list_id: string;
  user_id: string;
  checked: string[];
}

export type LegMode = 'rail' | 'bus' | 'walk' | 'other';

/** 一段路線中的一步 */
export interface LegStep {
  id: string;
  mode: LegMode;
  /** 內建路線資料的 id（日本時區時） */
  line_id?: string;
  /** 路線名稱（自己填或從內建資料帶入） */
  line: string;
  color?: string;
  /** 路線代號，例如 G、JY */
  code?: string;
  /** 上車／下車站（或步行的起點、終點） */
  from: string;
  to: string;
  from_station?: string;
  to_station?: string;
  from_code?: string;
  to_code?: string;
  direction: string;
  stops?: number | null;
  note: string;
  /** 自己貼的地圖連結（步行地圖或站牌位置） */
  map_url?: string;
}

/** 一段路線：某天（某組）從一個行程到下一個行程 */
export interface RouteLeg extends TripContent {
  date: ISODate;
  group_key: string;
  from_activity_id: string | null;
  to_activity_id: string | null;
  from_name: string;
  to_name: string;
  start_time: ISOTime | null;
  custom: boolean;
  /** 按了「不需要」 */
  dismissed: boolean;
  steps: LegStep[];
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
  'private_notes',
  'lists',
  'list_checks',
  'route_legs',
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
  private_notes: PrivateNote;
  lists: TripList;
  list_checks: ListCheck;
  route_legs: RouteLeg;
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
