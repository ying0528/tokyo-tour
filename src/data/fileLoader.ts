// 下載雲端檔案（圖片、票券）：同一個檔案只抓一次、同時最多抓幾個、正在看的先抓、逾時自動重試
import type { LocalStore } from './store.ts';
import { RemoteError, type Remote } from './remote.ts';

type Job = { path: string; resolve: (b: Blob) => void; reject: (e: unknown) => void };

export class FileLoader {
  private inflight = new Map<string, Promise<Blob>>();
  private queue: Job[] = [];
  private active = 0;
  /** 同時下載的數量 */
  max = 3;
  /** 每次下載最多等幾毫秒 */
  timeoutMs = 30_000;
  /** 失敗後再試的等待時間 */
  retryDelays = [800, 2500];

  private store: LocalStore;
  private remote: Remote;

  constructor(store: LocalStore, remote: Remote) {
    this.store = store;
    this.remote = remote;
  }

  /** 取得檔案：手機裡有就直接用；沒有就下載（now = 畫面正在等，排到最前面） */
  async get(path: string, priority: 'now' | 'later' = 'now'): Promise<Blob> {
    if (this.store.hasFile(path)) {
      const local = await this.store.getFile(path).catch(() => undefined);
      if (local && local.size > 0) return local;
    }
    return this.download(path, priority);
  }

  /** 從雲端下載（不管手機裡有沒有） */
  download(path: string, priority: 'now' | 'later' = 'now'): Promise<Blob> {
    const existing = this.inflight.get(path);
    if (existing) {
      if (priority === 'now') this.bump(path);
      return existing;
    }
    const p = new Promise<Blob>((resolve, reject) => {
      const job = { path, resolve, reject };
      if (priority === 'now') this.queue.unshift(job);
      else this.queue.push(job);
    });
    this.inflight.set(path, p);
    void p.catch(() => undefined).finally(() => this.inflight.delete(path));
    this.pump();
    return p;
  }

  private bump(path: string) {
    const i = this.queue.findIndex((j) => j.path === path);
    if (i > 0) this.queue.unshift(...this.queue.splice(i, 1));
  }

  private pump() {
    while (this.active < this.max && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      this.run(job.path).then(job.resolve, job.reject).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async run(path: string): Promise<Blob> {
    let last: unknown;
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, this.retryDelays[attempt - 1]));
      try {
        const blob = await withTimeout(this.remote.downloadFile(path), this.timeoutMs);
        await this.store.saveFile(path, blob, false).catch(() => undefined);
        return blob;
      } catch (e) {
        last = e;
        // 檔案不在雲端（還沒上傳）或沒有權限：再試也沒用
        if (e instanceof RemoteError && (e.kind === 'not_found' || e.kind === 'permission')) break;
      }
    }
    throw last;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new RemoteError('network', '下載逾時')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
