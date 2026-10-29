import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeServer, FakeAuth } from '../fake/fakeBackend.ts';
import { MemoryPersistence } from '../../src/data/persistence.ts';
import { LocalStore } from '../../src/data/store.ts';
import { Syncer } from '../../src/data/sync.ts';
import { newActivity, newPlace, newRouteStep, newTraveler, newTrip } from '../../src/data/factories.ts';
import { RemoteError } from '../../src/data/remote.ts';
import type { AuthUser, Remote } from '../../src/data/remote.ts';

async function device(server: FakeServer, user: AuthUser, wrap?: (r: Remote) => Remote) {
  const auth = new FakeAuth(server, user);
  const store = new LocalStore(new MemoryPersistence());
  await store.init();
  const remote = server.remoteFor(() => auth.user);
  const syncer = new Syncer(store, wrap ? wrap(remote) : remote);
  // 模擬正在看第一趟旅行
  syncer.activeTripId = () => store.all('trips')[0]?.id ?? null;
  return { store, syncer, auth };
}

function setup() {
  const server = new FakeServer();
  const mom: AuthUser = { id: crypto.randomUUID(), email: 'mom@x.com', is_anonymous: false };
  server.data.users.push({ id: mom.id, email: mom.email, password: 'secret1', anonymous: false });
  return { server, mom };
}

async function makeTrip(store: LocalStore, ownerId: string) {
  return store.create('trips', newTrip(ownerId, { title: '東京', start_date: '2026-12-20', end_date: '2026-12-24' }));
}

test('離線新增的資料會留在佇列，恢復連線後上傳', async () => {
  const { server, mom } = setup();
  const a = await device(server, mom);
  server.offline = true;
  const trip = await makeTrip(a.store, mom.id);
  await a.store.create('travelers', newTraveler(trip.id, { name: '大寶' }));
  await a.syncer.sync();
  assert.equal(a.syncer.state.status, 'offline');
  assert.equal(a.store.pending().length, 2);
  assert.equal(Object.keys(server.data.tables.trips).length, 0);

  server.offline = false;
  await a.syncer.sync();
  assert.equal(a.syncer.state.status, 'idle');
  assert.equal(a.store.pending().length, 0);
  assert.equal(server.data.tables.trips[trip.id].title, '東京');
  assert.ok(a.store.get('trips', trip.id)!.rev > 0, '上傳後有伺服器版本號');
});

test('上傳前連續修改，只會送出一次最新內容', async () => {
  const { server, mom } = setup();
  const a = await device(server, mom);
  let inserts = 0;
  const counted = { ...server.remoteFor(() => a.auth.user) };
  const origInsert = counted.insert;
  counted.insert = async (t, r) => { inserts++; return origInsert(t, r); };
  const syncer = new Syncer(a.store, counted);
  const trip = await makeTrip(a.store, mom.id);
  await a.store.update('trips', trip.id, { title: '東京 v2' });
  await a.store.update('trips', trip.id, { title: '東京 v3', destination: '東京' });
  assert.equal(a.store.pending().length, 1);
  await syncer.sync();
  assert.equal(inserts, 1);
  assert.equal(server.data.tables.trips[trip.id].title, '東京 v3');
  assert.equal(server.data.tables.trips[trip.id].destination, '東京');
});

test('兩支手機同時修改不同欄位：自動合併，不會互相覆蓋', async () => {
  const { server, mom } = setup();
  const a = await device(server, mom);
  const b = await device(server, mom);
  const trip = await makeTrip(a.store, mom.id);
  await a.syncer.sync();
  await b.syncer.sync();
  assert.ok(b.store.get('trips', trip.id));

  await a.store.update('trips', trip.id, { title: '東京五日遊' });
  await b.store.update('trips', trip.id, { notes: '記得帶護照' });
  await a.syncer.sync();
  await b.syncer.sync();
  await a.syncer.sync();

  const s = server.data.tables.trips[trip.id];
  assert.equal(s.title, '東京五日遊');
  assert.equal(s.notes, '記得帶護照');
  assert.equal(a.store.get('trips', trip.id)!.notes, '記得帶護照');
  assert.equal(b.store.get('trips', trip.id)!.title, '東京五日遊');
  assert.equal(b.store.notices().length, 1, '合併時有提示');
});

test('上傳成功但回應中斷：重送時不會重複建立', async () => {
  const { server, mom } = setup();
  let failOnce = true;
  const a = await device(server, mom, (r) => ({
    ...r,
    async insert(t, row) {
      const res = await r.insert(t, row);
      if (failOnce) { failOnce = false; throw new RemoteError('network', 'fetch failed'); }
      return res;
    },
  }));
  const trip = await makeTrip(a.store, mom.id);
  await a.syncer.sync();
  assert.equal(a.store.pending().length, 1, '回應中斷，仍在佇列');
  await a.store.update('trips', trip.id, { title: '改過的名字' });
  await a.syncer.sync();
  assert.equal(a.store.pending().length, 0);
  assert.equal(Object.keys(server.data.tables.trips).length, 1);
  assert.equal(server.data.tables.trips[trip.id].title, '改過的名字');
});

test('上傳順序依關聯：先景點再行程，即使行程先建立', async () => {
  const { server, mom } = setup();
  const a = await device(server, mom);
  const trip = await makeTrip(a.store, mom.id);
  const act = await a.store.create('activities', newActivity(trip.id, { date: '2026-12-21' }));
  const place = await a.store.create('places', newPlace(trip.id, { name: '淺草寺' }));
  await a.store.update('activities', act.id, { place_id: place.id });
  await a.syncer.sync();
  assert.equal(a.store.pending().length, 0, a.store.pending().map((e) => e.last_error).join());
  assert.equal(server.data.tables.activities[act.id].place_id, place.id);
});

test('上傳途中又被修改：新的修改不會遺失', async () => {
  const { server, mom } = setup();
  let store: LocalStore | null = null;
  let tripId = '';
  let once = true;
  const a = await device(server, mom, (r) => ({
    ...r,
    async update(t, id, patch, base) {
      const res = await r.update(t, id, patch, base);
      if (once && store) { once = false; await store.update('trips', tripId, { notes: '途中的修改' }); }
      return res;
    },
  }));
  store = a.store;
  const trip = await makeTrip(a.store, mom.id);
  tripId = trip.id;
  await a.syncer.sync();
  await a.store.update('trips', trip.id, { title: '第一次修改' });
  await a.syncer.sync();
  assert.equal(a.store.get('trips', trip.id)!.notes, '途中的修改');
  await a.syncer.sync();
  assert.equal(server.data.tables.trips[trip.id].notes, '途中的修改');
  assert.equal(server.data.tables.trips[trip.id].title, '第一次修改');
  assert.equal(a.store.pending().length, 0);
});

test('只能查看的成員修改會失敗並顯示；放棄後恢復雲端內容', async () => {
  const { server, mom } = setup();
  const a = await device(server, mom);
  const trip = await makeTrip(a.store, mom.id);
  const kid = await a.store.create('travelers', newTraveler(trip.id, { name: '小寶' }));
  await a.syncer.sync();
  const inv = await server.remoteFor(() => a.auth.user).createInvite(trip.id, 'viewer', false);

  const guest: AuthUser = { id: crypto.randomUUID(), email: null, is_anonymous: true };
  const g = await device(server, guest);
  await server.remoteFor(() => guest).joinTrip(inv.token, kid.id);
  await g.syncer.sync();
  assert.equal(g.store.get('trips', trip.id)!.title, '東京');
  assert.equal(g.store.members(trip.id).find((m) => m.user_id === guest.id)!.traveler_id, kid.id);

  await g.store.update('travelers', kid.id, { name: '亂改' });
  await g.syncer.sync();
  assert.equal(g.syncer.state.status, 'error');
  const failed = g.store.pending()[0];
  assert.equal(failed.status, 'failed');
  await g.syncer.discard(failed.key);
  assert.equal(g.store.get('travelers', kid.id)!.name, '小寶');
  assert.equal(g.store.pending().length, 0);
});

test('行程移入回收桶：交通步驟一起移入，還原時一起還原', async () => {
  const { server, mom } = setup();
  const a = await device(server, mom);
  const b = await device(server, mom);
  const trip = await makeTrip(a.store, mom.id);
  const act = await a.store.create('activities', newActivity(trip.id, { date: '2026-12-21', kind: 'move' }));
  const step = await a.store.create('route_steps', newRouteStep(trip.id, act.id, { line: '銀座線' }));
  await a.syncer.sync();
  await b.syncer.sync();

  await a.store.softDelete('activities', act.id);
  assert.ok(a.store.get('route_steps', step.id)!.deleted_at, '手機上立刻一起移入');
  await a.syncer.sync();
  await b.syncer.sync();
  assert.ok(b.store.get('route_steps', step.id)!.deleted_at, '其他手機也同步');
  assert.equal(b.store.byTrip('route_steps', trip.id).length, 0);

  await b.store.restore('activities', act.id);
  await b.syncer.sync();
  await a.syncer.sync();
  assert.equal(a.store.get('route_steps', step.id)!.deleted_at, null);
});

test('被移出旅行後，手機上的資料會清掉', async () => {
  const { server, mom } = setup();
  const a = await device(server, mom);
  const trip = await makeTrip(a.store, mom.id);
  await a.syncer.sync();
  const inv = await server.remoteFor(() => a.auth.user).createInvite(trip.id, 'editor', false);
  const dad: AuthUser = { id: crypto.randomUUID(), email: 'dad@x.com', is_anonymous: false };
  const d = await device(server, dad);
  await server.remoteFor(() => dad).joinTrip(inv.token, null);
  await d.syncer.sync();
  assert.ok(d.store.get('trips', trip.id));
  await server.remoteFor(() => a.auth.user).removeMember(trip.id, dad.id);
  await d.syncer.sync();
  assert.equal(d.store.get('trips', trip.id), undefined);
});

test('匿名訪客不能建立旅行', async () => {
  const { server } = setup();
  const guest: AuthUser = { id: crypto.randomUUID(), email: null, is_anonymous: true };
  const g = await device(server, guest);
  await makeTrip(g.store, guest.id);
  await g.syncer.sync();
  assert.equal(g.syncer.state.status, 'error');
  assert.equal(Object.keys(server.data.tables.trips).length, 0);
});
