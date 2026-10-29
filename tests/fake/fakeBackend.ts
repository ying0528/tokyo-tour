// 假的後端：模擬 Supabase 的行為（版本號、權限、邀請），用在單元測試與本機畫面測試。
import { RemoteError } from '../../src/data/remote.ts';
import type { AuthApi, AuthEvent, AuthUser, Backend, Remote } from '../../src/data/remote.ts';
import { TABLES } from '../../src/data/types.ts';
import type { AnyRow, Invite, InvitePreview, Member, Role, TableName, Trip } from '../../src/data/types.ts';

type Row = Record<string, unknown> & { id: string; rev: number; updated_at: string };

interface ServerData {
  tables: Record<TableName, Record<string, Row>>;
  members: Member[];
  invites: Invite[];
  users: { id: string; email: string | null; password: string; anonymous: boolean }[];
  rev: number;
  clock: number;
}

function emptyData(): ServerData {
  return {
    tables: Object.fromEntries(TABLES.map((t) => [t, {}])) as unknown as ServerData['tables'],
    members: [],
    invites: [],
    users: [],
    rev: 0,
    clock: Date.parse('2026-01-01T00:00:00Z'),
  };
}

export class FakeServer {
  data: ServerData;
  offline = false;
  /** 每次寫入後呼叫（瀏覽器版用來存到 localStorage） */
  onWrite: (() => void) | null = null;

  constructor(data?: ServerData) {
    this.data = data ?? emptyData();
  }

  private tick(): string {
    this.data.clock = Math.max(this.data.clock + 1, Date.now());
    return new Date(this.data.clock).toISOString();
  }

  private stamp(row: Row, user: string | null, insert: boolean) {
    const now = this.tick();
    row.rev = ++this.data.rev;
    row.updated_at = now;
    row.updated_by = user;
    if (insert) row.created_at = row.created_at ?? now;
  }

  role(tripId: string, user: string | null): Role | null {
    return this.data.members.find((m) => m.trip_id === tripId && m.user_id === user)?.role ?? null;
  }

  private canEdit(tripId: string, user: string | null) {
    const r = this.role(tripId, user);
    return r === 'owner' || r === 'editor';
  }

  private tripIdOf(table: TableName, row: Record<string, unknown>) {
    return (table === 'trips' ? row.id : row.trip_id) as string;
  }

  private guard() {
    if (this.offline) throw new RemoteError('network', '網路連線失敗');
  }

  /** 以某位使用者身分操作的 Remote */
  remoteFor(getUser: () => AuthUser | null): Remote {
    const s = this;
    const uid = () => getUser()?.id ?? null;
    const save = () => s.onWrite?.();
    const clone = <T>(v: T): T => structuredClone(v);

    return {
      async insert(table, input) {
        s.guard();
        const user = getUser();
        const row = clone(input) as Row;
        const store = s.data.tables[table];
        if (store[row.id]) throw new RemoteError('duplicate', 'duplicate key value violates unique constraint');
        if (table === 'trips') {
          if (!user || user.is_anonymous || row.owner_id !== user.id) throw new RemoteError('permission', '沒有權限');
        } else if (!s.canEdit(row.trip_id as string, uid())) {
          throw new RemoteError('permission', '沒有權限（可能是只能查看的成員）');
        }
        if (table === 'activities' && row.place_id && !s.data.tables.places[row.place_id as string]) {
          throw new RemoteError('reference', '關聯的資料已不存在');
        }
        if (table === 'day_plans' && Object.values(store).some((r) => r.trip_id === row.trip_id && r.date === row.date)) {
          throw new RemoteError('duplicate', 'duplicate key value violates unique constraint "day_plans_trip_id_date_key"');
        }
        s.stamp(row, uid(), true);
        store[row.id] = row;
        if (table === 'trips') {
          s.data.members.push({
            trip_id: row.id, user_id: user!.id, role: 'owner', traveler_id: null,
            see_all_groups: true, display_name: user!.email ?? '', created_at: row.created_at as string,
          });
        }
        save();
        return clone(row) as unknown as AnyRow;
      },
      async update(table, id, patch, baseRev) {
        s.guard();
        const row = s.data.tables[table][id];
        if (!row || !s.role(s.tripIdOf(table, row), uid())) return null;
        if (!s.canEdit(s.tripIdOf(table, row), uid())) throw new RemoteError('permission', '沒有權限（可能是只能查看的成員）');
        if (row.rev !== baseRev) return null;
        if (table === 'activities' && patch.place_id && !s.data.tables.places[patch.place_id as string]) {
          throw new RemoteError('reference', '關聯的資料已不存在');
        }
        const beforeDeleted = row.deleted_at as string | null;
        Object.assign(row, clone(patch));
        s.stamp(row, uid(), false);
        if (table === 'activities' && beforeDeleted !== row.deleted_at) {
          for (const st of Object.values(s.data.tables.route_steps)) {
            if (st.activity_id !== id) continue;
            if (row.deleted_at && !st.deleted_at) { st.deleted_at = row.deleted_at; s.stamp(st, uid(), false); }
            else if (!row.deleted_at && beforeDeleted && st.deleted_at === beforeDeleted) { st.deleted_at = null; s.stamp(st, uid(), false); }
          }
        }
        save();
        return clone(row) as unknown as AnyRow;
      },
      async fetchOne(table, id) {
        s.guard();
        const row = s.data.tables[table][id];
        if (!row || !s.role(s.tripIdOf(table, row), uid())) return null;
        return clone(row) as unknown as AnyRow;
      },
      async hardDelete(table, id) {
        s.guard();
        const row = s.data.tables[table][id];
        if (!row) return;
        const trip = s.tripIdOf(table, row);
        if (table === 'trips' ? s.role(trip, uid()) !== 'owner' : !s.canEdit(trip, uid())) throw new RemoteError('permission', '沒有權限');
        delete s.data.tables[table][id];
        if (table === 'trips') {
          for (const t of TABLES) for (const [rid, r] of Object.entries(s.data.tables[t])) if (r.trip_id === id) delete s.data.tables[t][rid];
          s.data.members = s.data.members.filter((m) => m.trip_id !== id);
          s.data.invites = s.data.invites.filter((i) => i.trip_id !== id);
        }
        save();
      },
      async listTrips() {
        s.guard();
        return Object.values(s.data.tables.trips).filter((t) => s.role(t.id, uid())).map(clone) as unknown as Trip[];
      },
      async pullTable(table, tripId, since) {
        s.guard();
        if (!s.role(tripId, uid())) return [];
        const from = since ? new Date(Date.parse(since) - 120000).toISOString() : null;
        return Object.values(s.data.tables[table])
          .filter((r) => r.trip_id === tripId && (!from || r.updated_at > from))
          .map(clone) as unknown as AnyRow[];
      },
      async listMembers(tripId) {
        s.guard();
        if (!s.role(tripId, uid())) return [];
        return clone(s.data.members.filter((m) => m.trip_id === tripId));
      },
      async listInvites(tripId) {
        s.guard();
        if (!s.canEdit(tripId, uid())) return [];
        return clone(s.data.invites.filter((i) => i.trip_id === tripId && !i.revoked_at));
      },
      async createInvite(tripId, role, seeAll) {
        s.guard();
        if (!s.canEdit(tripId, uid())) throw new RemoteError('permission', '沒有權限');
        const inv: Invite = {
          id: crypto.randomUUID(), trip_id: tripId, token: crypto.randomUUID().replace(/-/g, ''),
          role, see_all_groups: seeAll, created_at: s.tick(), revoked_at: null,
        };
        s.data.invites.push(inv);
        save();
        return clone(inv);
      },
      async revokeInvite(id) {
        s.guard();
        const inv = s.data.invites.find((i) => i.id === id);
        if (inv && s.canEdit(inv.trip_id, uid())) inv.revoked_at = s.tick();
        save();
      },
      async getInvite(token) {
        s.guard();
        const inv = s.data.invites.find((i) => i.token === token && !i.revoked_at);
        const trip = inv && s.data.tables.trips[inv.trip_id];
        if (!inv || !trip || trip.deleted_at) return null;
        const travelers = Object.values(s.data.tables.travelers)
          .filter((t) => t.trip_id === trip.id && !t.deleted_at)
          .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
          .map((t) => ({ id: t.id, name: t.name as string, color: t.color as string }));
        const preview: InvitePreview = {
          trip_id: trip.id, title: trip.title as string, destination: trip.destination as string,
          start_date: trip.start_date as string, end_date: trip.end_date as string, role: inv.role,
          already_member: Boolean(s.role(trip.id, uid())), travelers,
        };
        return preview;
      },
      async joinTrip(token, travelerId) {
        s.guard();
        const user = getUser();
        if (!user) throw new RemoteError('other', '請先登入');
        const inv = s.data.invites.find((i) => i.token === token && !i.revoked_at);
        if (!inv) throw new RemoteError('other', '邀請連結無效或已停用');
        const traveler = travelerId ? s.data.tables.travelers[travelerId] : null;
        const existing = s.data.members.find((m) => m.trip_id === inv.trip_id && m.user_id === user.id);
        if (existing) {
          if (travelerId) existing.traveler_id = travelerId;
          if (existing.role === 'viewer' && inv.role === 'editor') existing.role = 'editor';
        } else {
          s.data.members.push({
            trip_id: inv.trip_id, user_id: user.id, role: inv.role, traveler_id: travelerId,
            see_all_groups: inv.see_all_groups, display_name: user.email ?? (traveler?.name as string) ?? '訪客',
            created_at: s.tick(),
          });
        }
        save();
        return inv.trip_id;
      },
      async setMyTraveler(tripId, travelerId) {
        s.guard();
        const m = s.data.members.find((x) => x.trip_id === tripId && x.user_id === uid());
        if (!m) throw new RemoteError('other', '你不是這趟旅行的成員');
        m.traveler_id = travelerId;
        save();
      },
      async updateMember(tripId, userId, role, seeAll, travelerId) {
        s.guard();
        if (s.role(tripId, uid()) !== 'owner') throw new RemoteError('permission', '只有擁有者可以調整成員');
        const m = s.data.members.find((x) => x.trip_id === tripId && x.user_id === userId);
        if (!m) return;
        if (m.role !== 'owner') m.role = role;
        m.see_all_groups = seeAll;
        m.traveler_id = travelerId;
        save();
      },
      async removeMember(tripId, userId) {
        s.guard();
        if (userId !== uid() && s.role(tripId, uid()) !== 'owner') throw new RemoteError('permission', '只有擁有者可以移除成員');
        s.data.members = s.data.members.filter((m) => !(m.trip_id === tripId && m.user_id === userId && m.role !== 'owner'));
        save();
      },
    };
  }
}

/** 假的登入系統 */
export class FakeAuth implements AuthApi {
  user: AuthUser | null = null;
  private server: FakeServer;
  private listeners = new Set<(u: AuthUser | null, e: AuthEvent) => void>();
  onSession: ((u: AuthUser | null) => void) | null = null;

  constructor(server: FakeServer, user: AuthUser | null = null) {
    this.server = server;
    this.user = user;
  }
  private setUser(u: AuthUser | null, e: AuthEvent) {
    this.user = u;
    this.onSession?.(u);
    for (const fn of this.listeners) fn(u, e);
  }
  async getUser() { return this.user; }
  onChange(cb: (u: AuthUser | null, e: AuthEvent) => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }
  async signIn(email: string, password: string) {
    const u = this.server.data.users.find((x) => x.email === email && x.password === password);
    if (!u) throw new RemoteError('other', 'Email 或密碼不正確');
    this.setUser({ id: u.id, email: u.email, is_anonymous: false }, 'SIGNED_IN');
  }
  async signUp(email: string, password: string) {
    if (this.server.data.users.some((x) => x.email === email)) throw new RemoteError('other', '這個 Email 已經註冊過，請直接登入');
    if (password.length < 6) throw new RemoteError('other', '密碼至少要 6 個字元');
    const u = { id: crypto.randomUUID(), email, password, anonymous: false };
    this.server.data.users.push(u);
    this.server.onWrite?.();
    this.setUser({ id: u.id, email, is_anonymous: false }, 'SIGNED_IN');
    return { needsConfirm: false };
  }
  async signInAnonymously() {
    const u = { id: crypto.randomUUID(), email: null, password: '', anonymous: true };
    this.server.data.users.push(u);
    this.server.onWrite?.();
    this.setUser({ id: u.id, email: null, is_anonymous: true }, 'SIGNED_IN');
  }
  async signOut() { this.setUser(null, 'SIGNED_OUT'); }
  async resetPassword() {}
  async updatePassword() {}
}

/** 瀏覽器測試版：資料存在 localStorage，重新整理不會消失 */
export function createBackend(): Backend {
  const KEY = 'fake-server';
  const SESSION = 'fake-session';
  let data: ServerData | undefined;
  try { data = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? undefined; } catch { data = undefined; }
  const server = new FakeServer(data);
  server.onWrite = () => localStorage.setItem(KEY, JSON.stringify(server.data));
  let session: AuthUser | null = null;
  try { session = JSON.parse(localStorage.getItem(SESSION) ?? 'null'); } catch { session = null; }
  const auth = new FakeAuth(server, session);
  auth.onSession = (u) => localStorage.setItem(SESSION, JSON.stringify(u));
  (globalThis as Record<string, unknown>).__fakeServer = server;
  Object.defineProperty(server, 'offline', {
    get: () => localStorage.getItem('fake-offline') === '1',
    set: (v: boolean) => localStorage.setItem('fake-offline', v ? '1' : '0'),
  });
  return { configured: true, auth, remote: server.remoteFor(() => auth.user) };
}
