// 讀取票券檔案：先找手機裡的；沒有就從雲端下載並存到手機（之後離線也能看）
import { useEffect, useState } from 'react';
import { remote, store } from '../app/services.ts';

export type FileState = 'loading' | 'ready' | 'missing' | 'offline';

export function useFileUrl(path: string | null | undefined): { url: string | null; state: FileState; type: string } {
  const [res, setRes] = useState<{ url: string | null; state: FileState; type: string }>({ url: null, state: path ? 'loading' : 'missing', type: '' });

  useEffect(() => {
    if (!path) {
      setRes({ url: null, state: 'missing', type: '' });
      return;
    }
    let alive = true;
    let url: string | null = null;
    (async () => {
      let blob = await store.getFile(path);
      if (!blob) {
        if (!navigator.onLine) {
          if (alive) setRes({ url: null, state: 'offline', type: '' });
          return;
        }
        try {
          blob = await remote.downloadFile(path);
          await store.saveFile(path, blob, false);
        } catch {
          if (alive) setRes({ url: null, state: 'missing', type: '' });
          return;
        }
      }
      url = URL.createObjectURL(blob);
      if (alive) setRes({ url, state: 'ready', type: blob.type });
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  return res;
}
