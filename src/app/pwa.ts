// 安裝 service worker（離線可開啟），並在有新版本時提示更新
import { useSyncExternalStore } from 'react';

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.hostname === 'localhost' && location.port === '5173') return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = sw;
            emit();
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; emit(); }
      reg.addEventListener('updatefound', () => track(reg.installing));
      // 每次回到 APP 檢查一次是否有新版本
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch {
      /* 不支援時照常使用，只是不能離線開啟 */
    }
  });
  let reloaded = false;
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => waiting !== null);
}

export function applyUpdate() {
  waiting?.postMessage('skipWaiting');
}

/** 是否已從主畫面以 APP 方式開啟 */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
