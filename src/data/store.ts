// 本機資料中心：畫面只讀寫這裡。每次「儲存」先寫進手機，再放進待同步佇列，由同步引擎上傳。
import { SERVER_FIELDS, TABLES } from './types.ts';
import type { AnyRow, Member, OutboxEntry, RowMap, SyncNotice, TableName } from './types.ts';
import type { Persistence } from './persistence.ts';

type Rows = { [T in TableName]: Map<string, RowMap[T]> };

export const TABLE_RANK: Record<TableName, number> = Object.fromEntries(TABLES.map((t, i) => [t, i])) as Record<TableName, number>;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function stripServer(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const f of SERVER_FIELDS) delete out[f];
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export class LocalStore {
  private rows: Rows;
  private outbox = new Map<string, OutboxEntry>();
  private meta: Record<string, unknown> = {};
  private seq = 0;
  private listeners = new Set<() => void>();
  private persist: Persistence;
  /** 每次資料改變就 +1，畫面用它判斷要不要重畫 */
  version = 0;
  /** 本機有新的修改要上傳時呼叫（由同步引擎設定） */
  onLocalChange: (() => void) | null = null;

  constructor(persist: Persistence) {
    this.persist = persist;
    this.rows = Object.fromEntries(TABLES.map((t) => [t, new Map()])) as unknown as Rows;
  }

  async init() {
    const snap = await this.persist.loadAll();
    for (const t of TABLES) {
      const map = this.rows[t] as Map<string, AnyRow>;
      map.clear();
      for (const r of snap.rows[t]) map.set(r.id, r);
    }
    this.outbox = new Map(snap.outbox.map((e) => [e.key, e]));
    this.seq = Math.max(0, ...snap.outbox.map((e) => e.seq));
    this.meta = snap.meta;
    this.emit();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // ---------- 讀取 ----------
  get<T extends TableName>(table: T, id: string | null | undefined): RowMap[T] | undefined {
    if (!id) return undefined;
    return this.rows[table].get(id) as RowMap[T] | undefined;
  }

  all<T extends TableName>(table: T): RowMap[T][] {
    return [...(this.rows[table] as Map<string, RowMap[T]>).values()];
  }

  /** 某趟旅行的資料（預設不含回收桶） */
  byTrip<T extends Exclude<TableName, 'trips'>>(table: T, tripId: string, opts: { includeDeleted?: boolean } = {}): RowMap[T][] {
    return this.all(table).filter((r) => (r as { trip_id: string }).trip_id === tripId && (opts.includeDeleted || !r.deleted_at));
  }

  getMeta<V>(key: string): V | undefined {
    return this.meta[key] as V | undefined;
  }

  async setMeta(key: string, value: unknown) {
    this.meta[key] = value;
    await this.persist.setMeta(key, value);
    this.emit();
  }

  members(tripId: string): Member[] {
    return this.getMeta<Member[]>(`members:${tripId}`) ?? [];
  }

  pending(): OutboxEntry[] {
    return [...this.outbox.values()];
  }

  isPending(table: TableName, id: string): boolean {
    return this.outbox.has(`${table}:${id}`);
  }

  notices(): SyncNotice[] {
    return this.getMeta<SyncNotice[]>('notices') ?? [];
  }

  // ---------- 本機修改 ----------
  /** 新增一筆（id 由手機產生） */
  async create<T extends TableName>(table: T, row: RowMap[T]): Promise<RowMap[T]> {
    const full = { ...row, rev: 0, created_at: row.created_at ?? nowIso(), updated_at: nowIso() } as RowMap[T];
    (this.rows[table] as Map<string, RowMap[T]>).set(full.id, full);
    await this.persist.putRows(table, [full]);
    await this.enqueue(table, full, null);
    this.emit();
    this.onLocalChange?.();
    return full;
  }

  /** 修改；只有真的改變的欄位會被上傳 */
  async update<T extends TableName>(table: T, id: string, changes: Partial<RowMap[T]>): Promise<RowMap[T] | undefined> {
    const cur = this.get(table, id);
    if (!cur) return undefined;
    const changed: string[] = [];
    for (const [k, v] of Object.entries(changes)) {
      if ((SERVER_FIELDS as readonly string[]).includes(k) || k === 'id') continue;
      if (!same((cur as unknown as Record<string, unknown>)[k], v)) changed.push(k);
    }
    if (!changed.length) return cur;
    const next = { ...cur, ...Object.fromEntries(changed.map((k) => [k, (changes as Record<string, unknown>)[k]])) } as RowMap[T];
    (this.rows[table] as Map<string, RowMap[T]>).set(id, next);
    const extra = table === 'activities' && changed.includes('deleted_at')
      ? this.cascadeRouteSteps(id, (cur as RowMap['activities']).deleted_at, (next as RowMap['activities']).deleted_at)
      : [];
    await this.persist.putRows(table, [next]);
    if (extra.length) await this.persist.putRows('route_steps', extra);
    await this.enqueue(table, next, changed);
    this.emit();
    this.onLocalChange?.();
    return next;
  }

  /** 移到回收桶 */
  softDelete(table: TableName, id: string) {
    return this.update(table, id, { deleted_at: nowIso() } as Partial<AnyRow>);
  }

  /** 從回收桶還原 */
  restore(table: TableName, id: string) {
    return this.update(table, id, { deleted_at: null } as Partial<AnyRow>);
  }

  /** 行程進出回收桶時，交通步驟在手機上同步處理（伺服器也會做同樣的事） */
  private cascadeRouteSteps(activityId: string, before: string | null, after: string | null): RowMap['route_steps'][] {
    const changed: RowMap['route_steps'][] = [];
    for (const s of this.rows.route_steps.values()) {
      if (s.activity_id !== activityId) continue;
      if (after && !s.deleted_at) changed.push({ ...s, deleted_at: after });
      else if (!after && before && s.deleted_at === before) changed.push({ ...s, deleted_at: null });
    }
    for (const s of changed) this.rows.route_steps.set(s.id, s);
    return changed;
  }

  private async enqueue(table: TableName, row: AnyRow, changed: string[] | null) {
    const key = `${table}:${row.id}`;
    const existing = this.outbox.get(key);
    const rec = row as unknown as Record<string, unknown>;
    let entry: OutboxEntry;
    if (existing) {
      entry = {
        ...existing,
        patch: existing.op === 'insert' || !changed
          ? stripServer(rec)
          : { ...existing.patch, ...Object.fromEntries(changed.map((k) => [k, rec[k]])) },
        local_version: existing.local_version + 1,
        status: 'pending',
        last_error: null,
      };
    } else {
      const isInsert = !changed || !(row.rev > 0);
      entry = {
        key,
        table,
        id: row.id,
        trip_id: table === 'trips' ? row.id : (row as { trip_id: string }).trip_id,
        op: isInsert ? 'insert' : 'update',
        patch: isInsert ? stripServer(rec) : Object.fromEntries(changed!.map((k) => [k, rec[k]])),
        base_rev: row.rev,
        seq: ++this.seq,
        local_version: 1,
        status: 'pending',
        attempts: 0,
        last_error: null,
      };
    }
    this.outbox.set(key, entry);
    await this.persist.putOutbox([entry]);
  }

  // ---------- 同步引擎使用 ----------
  /** 套用伺服器資料；若本機還有未上傳的修改，保留本機修改的欄位 */
  async applyServerRows(table: TableName, serverRows: AnyRow[]): Promise<number> {
    const map = this.rows[table] as Map<string, AnyRow>;
    const changed: AnyRow[] = [];
    for (const s of serverRows) {
      const local = map.get(s.id);
      const entry = this.outbox.get(`${table}:${s.id}`);
      let next: AnyRow;
      if (entry) {
        next = { ...s, ...entry.patch } as AnyRow;
        next.rev = s.rev;
      } else {
        if (local && local.rev >= s.rev && local.rev > 0) continue;
        next = s;
      }
      if (local && same(local, next)) continue;
      map.set(s.id, next);
      changed.push(next);
    }
    if (changed.length) {
      await this.persist.putRows(table, changed);
      this.emit();
    }
    return changed.length;
  }

  /** 上傳成功 */
  async ackEntry(key: string, versionAtStart: number, server: AnyRow) {
    const entry = this.outbox.get(key);
    if (!entry) return;
    const map = this.rows[entry.table] as Map<string, AnyRow>;
    if (entry.local_version === versionAtStart) {
      this.outbox.delete(key);
      await this.persist.deleteOutbox([key]);
      map.set(server.id, server);
    } else {
      // 上傳途中又被修改：保留待上傳，下次以新版本為基礎
      const next: OutboxEntry = { ...entry, op: 'update', base_rev: server.rev };
      this.outbox.set(key, next);
      await this.persist.putOutbox([next]);
      map.set(server.id, { ...server, ...entry.patch, rev: server.rev } as AnyRow);
    }
    await this.persist.putRows(entry.table, [map.get(server.id)!]);
    this.emit();
  }

  async failEntry(key: string, message: string) {
    const entry = this.outbox.get(key);
    if (!entry) return;
    const next: OutboxEntry = { ...entry, status: 'failed', attempts: entry.attempts + 1, last_error: message };
    this.outbox.set(key, next);
    await this.persist.putOutbox([next]);
    this.emit();
  }

  /** 放棄一筆未上傳的修改，改回伺服器版本（server 為 null 表示伺服器沒有這筆） */
  async discardEntry(key: string, server: AnyRow | null) {
    const entry = this.outbox.get(key);
    if (!entry) return;
    this.outbox.delete(key);
    await this.persist.deleteOutbox([key]);
    const map = this.rows[entry.table] as Map<string, AnyRow>;
    if (server) {
      map.set(server.id, server);
      await this.persist.putRows(entry.table, [server]);
    } else if (entry.op === 'insert') {
      map.delete(entry.id);
      await this.persist.deleteRows(entry.table, [entry.id]);
    }
    this.emit();
  }

  /** 移除已經沒有權限的旅行（被移出成員或已永久刪除） */
  async removeTripsNotIn(serverTripIds: Set<string>) {
    const gone = this.all('trips').filter((t) => t.rev > 0 && !serverTripIds.has(t.id) && !this.outbox.has(`trips:${t.id}`));
    for (const t of gone) await this.removeTripLocal(t.id);
  }

  async removeTripLocal(tripId: string) {
    for (const table of TABLES) {
      const map = this.rows[table] as Map<string, AnyRow>;
      const ids = [...map.values()]
        .filter((r) => (table === 'trips' ? r.id === tripId : (r as { trip_id: string }).trip_id === tripId))
        .map((r) => r.id);
      ids.forEach((id) => map.delete(id));
      if (ids.length) await this.persist.deleteRows(table, ids);
    }
    const keys = [...this.outbox.values()].filter((e) => e.trip_id === tripId).map((e) => e.key);
    keys.forEach((k) => this.outbox.delete(k));
    if (keys.length) await this.persist.deleteOutbox(keys);
    delete this.meta[`cursor:${tripId}`];
    delete this.meta[`members:${tripId}`];
    await this.persist.setMeta(`cursor:${tripId}`, undefined);
    this.emit();
  }

  async addNotice(message: string) {
    const list = [{ id: crypto.randomUUID(), at: nowIso(), message }, ...this.notices()].slice(0, 20);
    await this.setMeta('notices', list);
  }

  async clearNotices() {
    await this.setMeta('notices', []);
  }

  /** 登出或換帳號：清空手機上的所有資料 */
  async clearAll() {
    await this.persist.clearAll();
    for (const t of TABLES) (this.rows[t] as Map<string, AnyRow>).clear();
    this.outbox.clear();
    this.meta = {};
    this.seq = 0;
    this.emit();
  }
}
