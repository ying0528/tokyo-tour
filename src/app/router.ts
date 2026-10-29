// 簡單的網址路由（#/…），讓 iPhone 左滑返回、Android 返回鍵都能正常運作
import { useSyncExternalStore } from 'react';

function current(): string {
  const h = location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn);
  window.addEventListener('popstate', fn);
  return () => {
    window.removeEventListener('hashchange', fn);
    window.removeEventListener('popstate', fn);
  };
}

/** 目前路徑拆成片段，例如 '/t/abc/plan' → ['t','abc','plan'] */
export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, current, () => '/');
  return path.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}

const DEPTH_KEY = 'nav-depth';

function depth(): number {
  return Number(sessionStorage.getItem(DEPTH_KEY) || '0');
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `${location.pathname}${location.search}#${path}`;
  if (opts.replace) {
    history.replaceState(history.state, '', url);
  } else {
    sessionStorage.setItem(DEPTH_KEY, String(depth() + 1));
    history.pushState(history.state, '', url);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** 返回上一頁；如果是直接打開這頁（沒有上一頁），就到指定頁面 */
export function goBack(fallback: string) {
  if (depth() > 0) {
    history.back(); // 深度由下方的 popstate 監聽減一
  } else {
    navigate(fallback, { replace: true });
  }
}

window.addEventListener('popstate', (e) => {
  // 使用者按瀏覽器返回時，深度減一（navigate 觸發的不算）
  if (e.isTrusted && depth() > 0) sessionStorage.setItem(DEPTH_KEY, String(depth() - 1));
});
