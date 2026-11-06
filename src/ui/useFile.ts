// 讀取檔案（票券、圖片）：先找手機裡的；沒有就從雲端下載並存到手機（之後離線也能看）
// 下載失敗會自動重試；檔案還沒上傳到雲端的話，每次同步完再試一次。
import { useEffect, useState } from 'react';
import { files, syncer } from '../app/services.ts';
import { RemoteError } from '../data/remote.ts';

export type FileState = 'loading' | 'ready' | 'missing' | 'offline';

type Res = { url: string | null; state: FileState; type: string };

export function useFileUrl(path: string | null | undefined): Res & { reload: () => void } {
  const [res, setRes] = useState<Res>({ url: null, state: path ? 'loading' : 'missing', type: '' });
  const [tick, setTick] = useState(0);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!path) {
      setRes({ url: null, state: 'missing', type: '' });
      return;
    }
    let alive = true;
    let url: string | null = null;
    let unsub: (() => void) | null = null;
    setRes({ url: null, state: 'loading', type: '' });
    (async () => {
      try {
        const blob = fresh ? await files.download(path, 'now') : await files.get(path, 'now');
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setRes({ url, state: 'ready', type: blob.type });
      } catch (e) {
        if (!alive) return;
        const offline = !navigator.onLine || (e instanceof RemoteError && e.kind === 'network');
        setRes({ url: null, state: offline ? 'offline' : 'missing', type: '' });
        // 可能還在別人的手機等上傳：下次同步完（或連上網路）自動再試
        let last = syncer.getState().lastSyncAt;
        unsub = syncer.subscribe(() => {
          const s = syncer.getState();
          if (s.status !== 'syncing' && s.lastSyncAt !== last) {
            last = s.lastSyncAt;
            setTick((n) => n + 1);
          }
        });
        const online = () => setTick((n) => n + 1);
        window.addEventListener('online', online);
        const prev = unsub;
        unsub = () => { prev(); window.removeEventListener('online', online); };
      }
    })();
    return () => {
      alive = false;
      unsub?.();
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, tick, fresh]);

  // 手機裡的檔案壞掉（圖片顯示不出來）時，重新從雲端下載
  const reload = () => {
    if (!path || fresh) return; // 只重抓一次，避免一直重來
    setFresh(true);
    setTick((n) => n + 1);
  };
  return { ...res, reload };
}
