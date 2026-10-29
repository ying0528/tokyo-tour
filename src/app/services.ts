// 全 APP 共用的服務：後端、本機資料、同步引擎、登入狀態
import { useSyncExternalStore } from 'react';
import { createBackend } from '../data/backend.ts';
import { IdbPersistence } from '../data/persistence.ts';
import { LocalStore } from '../data/store.ts';
import { Syncer } from '../data/sync.ts';
import type { AuthUser } from '../data/remote.ts';
import type { Member, Role, Trip } from '../data/types.ts';

export const backend = createBackend();
export const store = new LocalStore(new IdbPersistence());
export const syncer = new Syncer(store, backend.remote);
export const remote = backend.remote;

syncer.isOnline = () => navigator.onLine !== false;
syncer.activeTripId = () => store.getMeta<string>('active_trip') ?? null;
store.onLocalChange = () => syncer.schedule();

// ---------- 登入狀態 ----------
interface SessionState {
  ready: boolean;
  user: AuthUser | null;
  recovery: boolean;
}
let session: SessionState = { ready: false, user: null, recovery: false };
const sessionListeners = new Set<() => void>();
function setSession(patch: Partial<SessionState>) {
  session = { ...session, ...patch };
  sessionListeners.forEach((fn) => fn());
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (fn) => { sessionListeners.add(fn); return () => { sessionListeners.delete(fn); }; },
    () => session,
  );
}

/** 啟動：讀手機資料、讀登入狀態；換帳號時清掉上一個帳號的資料 */
export async function boot() {
  await store.init();
  let user: AuthUser | null = null;
  try {
    user = await backend.auth.getUser();
  } catch {
    user = null;
  }
  // 離線且登入過期時，仍可用上次的帳號查看手機上的資料
  if (!user && !navigator.onLine) user = store.getMeta<AuthUser>('user') ?? null;
  await adoptUser(user);
  setSession({ ready: true });
  backend.auth.onChange((u, event) => {
    if (event === 'PASSWORD_RECOVERY') setSession({ recovery: true });
    if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') void adoptUser(u);
  });
}

async function adoptUser(user: AuthUser | null) {
  if (session.ready && session.user?.id === user?.id) return; // 同一個人（例如重新取得登入憑證），不用重來
  const prev = store.getMeta<AuthUser>('user');
  if (user && prev && prev.id !== user.id) await store.clearAll();
  if (user) await store.setMeta('user', user);
  setSession({ user });
  if (user) void syncer.sync();
}

export async function signOut() {
  await backend.auth.signOut();
  await store.clearAll();
  setSession({ user: null });
}

export function endRecovery() {
  setSession({ recovery: false });
}

// ---------- 訂閱 hooks ----------
/** 本機資料一改變就重畫 */
export function useData(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

export function useSync() {
  return useSyncExternalStore(syncer.subscribe, syncer.getState);
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener('online', fn);
      window.addEventListener('offline', fn);
      return () => {
        window.removeEventListener('online', fn);
        window.removeEventListener('offline', fn);
      };
    },
    () => navigator.onLine !== false,
  );
}

// ---------- 權限 ----------
export function myMember(tripId: string, userId: string | undefined): Member | undefined {
  return store.members(tripId).find((m) => m.user_id === userId);
}

export function roleOf(trip: Trip | undefined, userId: string | undefined): Role | null {
  if (!trip || !userId) return null;
  if (trip.owner_id === userId) return 'owner';
  return myMember(trip.id, userId)?.role ?? null;
}

export function canEditTrip(trip: Trip | undefined, userId: string | undefined): boolean {
  const r = roleOf(trip, userId);
  return r === 'owner' || r === 'editor';
}

// ---------- 自動同步時機 ----------
let lastVisibleSync = 0;
window.addEventListener('online', () => { void syncer.sync(); });
window.addEventListener('offline', () => { void syncer.sync({ pull: false }); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !session.user) return;
  // 回到 APP 時，距離上次超過 1 分鐘才抓新資料，避免浪費
  const last = Date.parse(syncer.state.lastSyncAt ?? '') || 0;
  if (Date.now() - Math.max(last, lastVisibleSync) > 60_000) {
    lastVisibleSync = Date.now();
    void syncer.sync();
  }
});
