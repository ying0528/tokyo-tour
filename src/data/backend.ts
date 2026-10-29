// 正式版後端：Supabase
import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { classifyError, RemoteError } from './remote.ts';
import type { AuthApi, AuthUser, Backend, Remote } from './remote.ts';
import type { AnyRow, Invite, InvitePreview, Member, Trip } from './types.ts';
import { SUPABASE_KEY, SUPABASE_URL } from '../config.ts';

/** 同步時多抓 2 分鐘前的資料，避免同時寫入時漏掉 */
const PULL_OVERLAP_MS = 2 * 60 * 1000;

function toUser(session: Session | null): AuthUser | null {
  const u = session?.user;
  if (!u) return null;
  return { id: u.id, email: u.email ?? null, is_anonymous: Boolean(u.is_anonymous) };
}

export function createBackend(): Backend {
  const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);
  const client = createClient(SUPABASE_URL || 'https://not-configured.supabase.co', SUPABASE_KEY || 'missing', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  const redirectTo = `${location.origin}${location.pathname}`;

  async function check<T>(p: PromiseLike<{ data: T; error: { message?: string; code?: string } | null }>): Promise<T> {
    let res: { data: T; error: { message?: string; code?: string } | null };
    try {
      res = await p;
    } catch (e) {
      throw classifyError({ message: String((e as Error)?.message ?? e) });
    }
    if (res.error) throw classifyError(res.error);
    return res.data;
  }

  const auth: AuthApi = {
    async getUser() {
      const { data } = await client.auth.getSession();
      return toUser(data.session);
    },
    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const e = event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY' ? event : 'OTHER';
        cb(toUser(session), e);
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new RemoteError('other', translateAuthError(error.message));
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      if (error) throw new RemoteError('other', translateAuthError(error.message));
      return { needsConfirm: !data.session };
    },
    async signInAnonymously() {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw new RemoteError('other', translateAuthError(error.message));
    },
    async signOut() {
      await client.auth.signOut({ scope: 'local' });
    },
    async resetPassword(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new RemoteError('other', translateAuthError(error.message));
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new RemoteError('other', translateAuthError(error.message));
    },
  };

  const remote: Remote = {
    async insert(table, row) {
      return check(client.from(table).insert(row).select().single()) as Promise<AnyRow>;
    },
    async update(table, id, patch, baseRev) {
      const rows = await check(client.from(table).update(patch).eq('id', id).eq('rev', baseRev).select());
      return (rows as AnyRow[])[0] ?? null;
    },
    async fetchOne(table, id) {
      const rows = await check(client.from(table).select().eq('id', id).limit(1));
      return (rows as AnyRow[])[0] ?? null;
    },
    async hardDelete(table, id) {
      await check(client.from(table).delete().eq('id', id));
    },
    async listTrips() {
      return (await check(client.from('trips').select())) as Trip[];
    },
    async pullTable(table, tripId, since) {
      let q = client.from(table).select().eq('trip_id', tripId);
      if (since) q = q.gt('updated_at', new Date(new Date(since).getTime() - PULL_OVERLAP_MS).toISOString());
      return (await check(q.order('updated_at').limit(5000))) as AnyRow[];
    },
    async listMembers(tripId) {
      return (await check(client.from('trip_members').select().eq('trip_id', tripId))) as Member[];
    },
    async listInvites(tripId) {
      return (await check(client.from('trip_invites').select().eq('trip_id', tripId).is('revoked_at', null).order('created_at'))) as Invite[];
    },
    async createInvite(tripId, role, seeAll) {
      return (await check(client.from('trip_invites').insert({ trip_id: tripId, role, see_all_groups: seeAll }).select().single())) as Invite;
    },
    async revokeInvite(id) {
      await check(client.from('trip_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id));
    },
    async getInvite(token) {
      return (await check(client.rpc('get_invite', { p_token: token }))) as InvitePreview | null;
    },
    async joinTrip(token, travelerId) {
      return (await check(client.rpc('join_trip', { p_token: token, p_traveler: travelerId }))) as string;
    },
    async setMyTraveler(tripId, travelerId) {
      await check(client.rpc('set_my_traveler', { p_trip: tripId, p_traveler: travelerId }));
    },
    async updateMember(tripId, userId, role, seeAll, travelerId) {
      await check(client.rpc('update_member', { p_trip: tripId, p_user: userId, p_role: role, p_see_all: seeAll, p_traveler: travelerId }));
    },
    async removeMember(tripId, userId) {
      await check(client.rpc('remove_member', { p_trip: tripId, p_user: userId }));
    },
  };

  return { configured, auth, remote };
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email 或密碼不正確';
  if (/email not confirmed/i.test(message)) return '請先到信箱點確認信中的連結';
  if (/already registered|already been registered/i.test(message)) return '這個 Email 已經註冊過，請直接登入';
  if (/password should be at least/i.test(message)) return '密碼至少要 6 個字元';
  if (/anonymous sign-ins are disabled/i.test(message)) return '尚未開啟「匿名登入」，請擁有者到 Supabase 設定開啟';
  if (/rate limit|too many/i.test(message)) return '嘗試太多次，請稍後再試';
  if (/failed to fetch|load failed|network/i.test(message)) return '網路連線失敗';
  return message;
}
