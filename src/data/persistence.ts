// 手機本機儲存（IndexedDB）。離線時所有資料都從這裡讀。
import { TABLES } from './types.ts';
import type { AnyRow, OutboxEntry, TableName } from './types.ts';

export interface Snapshot {
  rows: Record<TableName, AnyRow[]>;
  outbox: OutboxEntry[];
  meta: Record<string, unknown>;
}

export interface Persistence {
  loadAll(): Promise<Snapshot>;
  putRows(table: TableName, rows: AnyRow[]): Promise<void>;
  deleteRows(table: TableName, ids: string[]): Promise<void>;
  putOutbox(entries: OutboxEntry[]): Promise<void>;
  deleteOutbox(keys: string[]): Promise<void>;
  setMeta(key: string, value: unknown): Promise<void>;
  clearAll(): Promise<void>;
}

export function emptySnapshot(): Snapshot {
  const rows = {} as Record<TableName, AnyRow[]>;
  for (const t of TABLES) rows[t] = [];
  return { rows, outbox: [], meta: {} };
}

/** 測試用：存在記憶體 */
export class MemoryPersistence implements Persistence {
  data: Snapshot = emptySnapshot();
  async loadAll(): Promise<Snapshot> {
    return structuredClone(this.data);
  }
  async putRows(table: TableName, rows: AnyRow[]) {
    const map = new Map(this.data.rows[table].map((r) => [r.id, r]));
    for (const r of rows) map.set(r.id, structuredClone(r));
    this.data.rows[table] = [...map.values()];
  }
  async deleteRows(table: TableName, ids: string[]) {
    const set = new Set(ids);
    this.data.rows[table] = this.data.rows[table].filter((r) => !set.has(r.id));
  }
  async putOutbox(entries: OutboxEntry[]) {
    const map = new Map(this.data.outbox.map((e) => [e.key, e]));
    for (const e of entries) map.set(e.key, structuredClone(e));
    this.data.outbox = [...map.values()];
  }
  async deleteOutbox(keys: string[]) {
    const set = new Set(keys);
    this.data.outbox = this.data.outbox.filter((e) => !set.has(e.key));
  }
  async setMeta(key: string, value: unknown) {
    this.data.meta[key] = structuredClone(value);
  }
  async clearAll() {
    this.data = emptySnapshot();
  }
}

const DB_NAME = 'family-trip';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

export class IdbPersistence implements Persistence {
  private dbp: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = () => {
          const db = open.result;
          for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
          if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
    }
    return this.dbp;
  }

  async loadAll(): Promise<Snapshot> {
    const db = await this.db();
    const tx = db.transaction([...TABLES, 'outbox', 'meta'], 'readonly');
    const snap = emptySnapshot();
    const tasks: Promise<unknown>[] = [];
    for (const t of TABLES) tasks.push(req(tx.objectStore(t).getAll()).then((rows) => { snap.rows[t] = rows as AnyRow[]; }));
    tasks.push(req(tx.objectStore('outbox').getAll()).then((rows) => { snap.outbox = rows as OutboxEntry[]; }));
    const metaStore = tx.objectStore('meta');
    tasks.push(Promise.all([req(metaStore.getAllKeys()), req(metaStore.getAll())]).then(([keys, values]) => {
      keys.forEach((k, i) => { snap.meta[String(k)] = values[i]; });
    }));
    await Promise.all(tasks);
    return snap;
  }

  private async write(store: string, fn: (s: IDBObjectStore) => void) {
    const db = await this.db();
    const tx = db.transaction(store, 'readwrite');
    fn(tx.objectStore(store));
    await done(tx);
  }

  putRows(table: TableName, rows: AnyRow[]) {
    return this.write(table, (s) => rows.forEach((r) => s.put(r)));
  }
  deleteRows(table: TableName, ids: string[]) {
    return this.write(table, (s) => ids.forEach((id) => s.delete(id)));
  }
  putOutbox(entries: OutboxEntry[]) {
    return this.write('outbox', (s) => entries.forEach((e) => s.put(e)));
  }
  deleteOutbox(keys: string[]) {
    return this.write('outbox', (s) => keys.forEach((k) => s.delete(k)));
  }
  setMeta(key: string, value: unknown) {
    return this.write('meta', (s) => { s.put(value, key); });
  }
  async clearAll() {
    const db = await this.db();
    const names = [...TABLES, 'outbox', 'meta', 'files'];
    const tx = db.transaction(names, 'readwrite');
    names.forEach((n) => tx.objectStore(n).clear());
    await done(tx);
  }
}
