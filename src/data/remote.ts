// 雲端（Supabase）介面。正式版實作在 backend.ts；本機測試用 tests/fake/fakeBackend.ts。
import type { AnyRow, Invite, InvitePreview, Member, Role, TableName, Trip } from './types.ts';

export type RemoteErrorKind = 'network' | 'duplicate' | 'permission' | 'reference' | 'not_found' | 'other';

export class RemoteError extends Error {
  kind: RemoteErrorKind;
  constructor(kind: RemoteErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** 把 Supabase/PostgREST 的錯誤轉成我們的分類 */
export function classifyError(err: { message?: string; code?: string } | null | undefined): RemoteError {
  const message = err?.message ?? '未知錯誤';
  const code = err?.code ?? '';
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return new RemoteError('network', '網路連線失敗');
  }
  if (code === '23505') return new RemoteError('duplicate', message);
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return new RemoteError('permission', '沒有權限（可能是只能查看的成員）');
  }
  if (code === '23503') return new RemoteError('reference', '關聯的資料已不存在');
  if (code === 'PGRST116') return new RemoteError('not_found', '找不到資料');
  return new RemoteError('other', message);
}

export interface AuthUser {
  id: string;
  email: string | null;
  is_anonymous: boolean;
}

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'OTHER';

export interface AuthApi {
  /** 讀取手機上已儲存的登入狀態（離線也可以） */
  getUser(): Promise<AuthUser | null>;
  onChange(cb: (user: AuthUser | null, event: AuthEvent) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirm: boolean }>;
  signInAnonymously(): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
}

export interface Remote {
  insert(table: TableName, row: Record<string, unknown>): Promise<AnyRow>;
  /** 只有伺服器版本號等於 baseRev 時才更新；版本不符回傳 null */
  update(table: TableName, id: string, patch: Record<string, unknown>, baseRev: number): Promise<AnyRow | null>;
  fetchOne(table: TableName, id: string): Promise<AnyRow | null>;
  hardDelete(table: TableName, id: string): Promise<void>;
  listTrips(): Promise<Trip[]>;
  pullTable(table: Exclude<TableName, 'trips'>, tripId: string, since: string | null): Promise<AnyRow[]>;
  listMembers(tripId: string): Promise<Member[]>;
  listInvites(tripId: string): Promise<Invite[]>;
  createInvite(tripId: string, role: 'editor' | 'viewer', seeAll: boolean): Promise<Invite>;
  revokeInvite(id: string): Promise<void>;
  getInvite(token: string): Promise<InvitePreview | null>;
  joinTrip(token: string, travelerId: string | null): Promise<string>;
  setMyTraveler(tripId: string, travelerId: string | null): Promise<void>;
  updateMember(tripId: string, userId: string, role: Role, seeAll: boolean, travelerId: string | null): Promise<void>;
  removeMember(tripId: string, userId: string): Promise<void>;
}

export interface Backend {
  configured: boolean;
  auth: AuthApi;
  remote: Remote;
}
