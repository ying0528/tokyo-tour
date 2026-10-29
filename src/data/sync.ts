// 同步引擎：把待同步佇列上傳到雲端，再把雲端的新資料抓回手機。
import { TABLES } from './types.ts';
import type { AnyRow, OutboxEntry, TableName } from './types.ts';
import { RemoteError } from './remote.ts';
import type { Remote } from './remote.ts';
import { TABLE_RANK } from './store.ts';
import type { LocalStore } from './store.ts';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface SyncOptions {
  /** 是否也抓雲端資料（只上傳時設 false） */
  pull?: boolean;
  /** 是否重試先前失敗的修改 */
  retryFailed?: boolean;
  /** 是否抓所有旅行的內容（預設只抓目前這趟） */
  allTrips?: boolean;
}

const MAX_CONFLICT_RETRIES = 3;

export class Syncer {
  state: SyncState = { status: 'idle', lastSyncAt: null, lastError: null };
  private running: Promise<void> | null = null;
  private again: SyncOptions | null = null;
  private newTripUploaded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private store: LocalStore;
  private remote: Remote;
  /** 目前正在看的旅行（只有這趟每次都抓） */
  activeTripId: () => string | null = () => null;
  isOnline: () => boolean = () => true;

  constructor(store: LocalStore, remote: Remote) {
    this.store = store;
    this.remote = remote;
    this.state.lastSyncAt = store.getMeta<string>('last_sync') ?? null;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getState = () => this.state;

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** 稍後上傳（連續修改時合併成一次） */
  schedule(delayMs = 600) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync({ pull: false });
    }, delayMs);
  }

  /** 執行同步；如果正在同步，結束後再跑一次 */
  sync(opts: SyncOptions = {}): Promise<void> {
    if (this.running) {
      this.again = mergeOpts(this.again, opts);
      // 等目前這次跑完，再等補跑的那一次
      return this.running.then(() => this.running ?? undefined);
    }
    this.running = this.run(opts).finally(() => {
      this.running = null;
      const next = this.again;
      this.again = null;
      if (next) void this.sync(next);
    });
    return this.running;
  }

  private async run(opts: SyncOptions) {
    if (!this.isOnline()) {
      this.set({ status: 'offline' });
      return;
    }
    this.set({ status: 'syncing' });
    try {
      const pushed = await this.push(opts.retryFailed ?? false);
      if (pushed === 'offline') {
        this.set({ status: 'offline' });
        return;
      }
      // 剛上傳新旅行時也要抓一次（取得成員資料）
      if (opts.pull !== false || this.newTripUploaded) await this.pull(opts.allTrips ?? false);
      this.newTripUploaded = false;
      const at = new Date().toISOString();
      await this.store.setMeta('last_sync', at);
      const failed = this.store.pending().some((e) => e.status === 'failed');
      this.set({ status: failed ? 'error' : 'idle', lastSyncAt: at, lastError: failed ? '有修改無法上傳' : null });
    } catch (e) {
      const err = e as RemoteError;
      if (err?.kind === 'network') this.set({ status: 'offline' });
      else this.set({ status: 'error', lastError: err?.message ?? String(e) });
    }
  }

  /** 上傳佇列：被參照的資料表先傳（旅行 → 同行者 → 景點 → 行程 → …） */
  async push(retryFailed: boolean): Promise<'ok' | 'offline'> {
    const entries = this.store
      .pending()
      .filter((e) => retryFailed || e.status === 'pending')
      .sort((a, b) => TABLE_RANK[a.table] - TABLE_RANK[b.table] || a.seq - b.seq);
    for (const entry of entries) {
      const current = this.store.pending().find((e) => e.key === entry.key);
      if (!current) continue;
      try {
        const server = await this.pushOne(current);
        await this.store.ackEntry(current.key, current.local_version, server);
        if (current.table === 'trips' && current.op === 'insert') this.newTripUploaded = true;
      } catch (e) {
        const err = e instanceof RemoteError ? e : new RemoteError('other', String((e as Error)?.message ?? e));
        if (err.kind === 'network') return 'offline';
        await this.store.failEntry(current.key, err.message);
      }
    }
    return 'ok';
  }

  private async pushOne(entry: OutboxEntry): Promise<AnyRow> {
    const patch = structuredClone(entry.patch);
    if (entry.op === 'insert') {
      try {
        return await this.remote.insert(entry.table, patch);
      } catch (e) {
        if (!(e instanceof RemoteError) || e.kind !== 'duplicate') throw e;
        // 之前其實已經上傳成功（例如回應在半路斷線），改用更新
        const cur = await this.remote.fetchOne(entry.table, entry.id);
        if (!cur) throw e;
        const { id: _id, ...rest } = patch;
        return this.updateWithMerge(entry.table, entry.id, rest, cur.rev, false);
      }
    }
    return this.updateWithMerge(entry.table, entry.id, patch, entry.base_rev, true);
  }

  /** 以版本號更新；若其他裝置先改過，拿最新版本再套上自己改的欄位 */
  private async updateWithMerge(table: TableName, id: string, patch: Record<string, unknown>, baseRev: number, notify: boolean): Promise<AnyRow> {
    let base = baseRev;
    for (let i = 0; i < MAX_CONFLICT_RETRIES; i++) {
      const res = await this.remote.update(table, id, patch, base);
      if (res) {
        if (i > 0 && notify) {
          await this.store.addNotice(`${TABLE_LABEL[table]}同時在其他裝置被修改，已自動合併（你改的欄位以你的為準）`);
        }
        return res;
      }
      const cur = await this.remote.fetchOne(table, id);
      if (!cur) throw new RemoteError('not_found', `這筆${TABLE_LABEL[table]}已在其他裝置被永久刪除`);
      base = cur.rev;
    }
    throw new RemoteError('other', '資料同時被修改太多次，請稍後再試');
  }

  /** 抓雲端新資料 */
  async pull(allTrips: boolean) {
    const trips = await this.remote.listTrips();
    await this.store.applyServerRows('trips', trips);
    await this.store.removeTripsNotIn(new Set(trips.map((t) => t.id)));

    const active = this.activeTripId();
    const targets = trips.filter((t) => allTrips || t.id === active || !this.store.getMeta(`cursor:${t.id}`));
    for (const trip of targets) {
      const since = this.store.getMeta<string>(`cursor:${trip.id}`) ?? null;
      let max = since;
      for (const table of TABLES) {
        if (table === 'trips') continue;
        const rows = await this.remote.pullTable(table, trip.id, since);
        await this.store.applyServerRows(table, rows);
        for (const r of rows) if (r.updated_at && (!max || r.updated_at > max)) max = r.updated_at;
      }
      if (max && max !== since) await this.store.setMeta(`cursor:${trip.id}`, max);
      {
        const members = await this.remote.listMembers(trip.id);
        await this.store.setMeta(`members:${trip.id}`, members);
      }
    }
  }

  /** 放棄某筆無法上傳的修改 */
  async discard(key: string) {
    const entry = this.store.pending().find((e) => e.key === key);
    if (!entry) return;
    let server: AnyRow | null = null;
    try {
      server = await this.remote.fetchOne(entry.table, entry.id);
    } catch {
      server = null;
    }
    await this.store.discardEntry(key, server);
    const failed = this.store.pending().some((e) => e.status === 'failed');
    if (!failed && this.state.status === 'error') this.set({ status: 'idle', lastError: null });
  }
}

function mergeOpts(a: SyncOptions | null, b: SyncOptions): SyncOptions {
  if (!a) return b;
  return {
    pull: (a.pull ?? true) || (b.pull ?? true),
    retryFailed: a.retryFailed || b.retryFailed,
    allTrips: a.allTrips || b.allTrips,
  };
}

export const TABLE_LABEL: Record<TableName, string> = {
  trips: '旅行',
  travelers: '同行者',
  places: '景點',
  activities: '行程',
  route_steps: '交通步驟',
  tickets: '票券',
  day_plans: '每日設定',
  personal_status: '完成狀態',
};
