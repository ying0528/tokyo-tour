// 第四版：清單、路線、使用者權限、東京路線資料
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeServer, FakeAuth } from '../fake/fakeBackend.ts';
import { MemoryPersistence } from '../../src/data/persistence.ts';
import { LocalStore } from '../../src/data/store.ts';
import { Syncer } from '../../src/data/sync.ts';
import { newActivity, newDayPlan, newRouteStep, newTraveler, newTrip } from '../../src/data/factories.ts';
import type { AuthUser } from '../../src/data/remote.ts';
import { RemoteError } from '../../src/data/remote.ts';
import {
  addCustomLeg, checkedItems, convertMoves, createList, dismissLeg, ensureLeg, listsOf, restoreLeg, saveLegSteps, saveListItem,
  toggleListCheck, updateList,
  addTripIcon, deleteTripIcon, setHiddenIcons, tripIcons,
} from '../../src/data/actions.ts';
import { dayLegs } from '../../src/lib/legs.ts';
import { dayPlanId } from '../../src/lib/plan.ts';
import { lineById, ridePath, sameStation, setRailData, transfersAt } from '../../src/lib/rail.ts';
import type { RailData } from '../../src/lib/rail.ts';

async function device(server: FakeServer, user: AuthUser) {
  const auth = new FakeAuth(server, user);
  const store = new LocalStore(new MemoryPersistence());
  await store.init();
  const syncer = new Syncer(store, server.remoteFor(() => auth.user));
  syncer.activeTripId = () => store.all('trips')[0]?.id ?? null;
  syncer.userId = () => user.id;
  return { store, syncer };
}

async function family() {
  const server = new FakeServer();
  const mom: AuthUser = { id: crypto.randomUUID(), email: 'mom@x.com', is_anonymous: false };
  const kid: AuthUser = { id: crypto.randomUUID(), email: null, is_anonymous: true };
  const a = await device(server, mom);
  const trip = await a.store.create('trips', newTrip(mom.id, { title: '東京', start_date: '2026-11-21', end_date: '2026-11-27' }));
  const tKid = await a.store.create('travelers', newTraveler(trip.id, { name: '大寶' }));
  await a.syncer.sync();
  const inv = await server.remoteFor(() => mom).createInvite(trip.id, 'viewer', false);
  await server.remoteFor(() => kid).joinTrip(inv.token, tKid.id);
  const b = await device(server, kid);
  await b.syncer.sync({ allTrips: true });
  return { server, mom, kid, a, b, trip, tKid };
}

test('路線：相鄰兩個行程自動產生一段，可以刪除再加回來', async () => {
  const { a, trip } = await family();
  const mk = (t: string, title: string) => a.store.create('activities', newActivity(trip.id, { date: '2026-11-22', start_time: t, title }));
  await mk('08:30', '新宿御苑');
  await mk('10:00', '明治神宮外苑');
  await mk('11:00', 'EDW yellow');
  const get = () => dayLegs(trip.id, '2026-11-22', '', undefined, a.store.byTrip('activities', trip.id), a.store.byTrip('route_legs', trip.id));
  let d = get();
  assert.equal(d.legs.length, 2);
  assert.equal(d.legs[0].fromName, '新宿御苑');
  assert.equal(d.legs[1].toName, 'EDW yellow');

  await dismissLeg(a.store, trip.id, '2026-11-22', '', d.legs[0]);
  d = get();
  assert.equal(d.legs.length, 1);
  assert.equal(d.dismissed.length, 1);
  await restoreLeg(a.store, d.dismissed[0].id);
  d = get();
  assert.equal(d.legs.length, 2);

  const id = await ensureLeg(a.store, trip.id, '2026-11-22', '', d.legs[1]);
  await saveLegSteps(a.store, id, [{ id: 's1', mode: 'walk', line: '', from: '', to: '', direction: '', note: '' }], '');
  assert.equal(get().legs[1].leg?.steps.length, 1);

  // 自己加一段：從飯店出發到第一個行程，排在最前面
  await addCustomLeg(a.store, trip.id, '2026-11-22', '', { activityId: null, name: '飯店' }, { activityId: d.legs[0].from!.id, name: '' });
  d = get();
  assert.equal(d.legs.length, 3);
  assert.equal(d.legs[0].fromName, '飯店');
  await a.syncer.sync();
  assert.equal(a.store.pending().length, 0, a.store.pending().map((e) => e.last_error).join());
});

test('分組的日子：每組各自的路線', async () => {
  const { a, trip, tKid } = await family();
  await a.store.create('day_plans', newDayPlan(trip.id, '2026-11-23', dayPlanId(trip.id, '2026-11-23'), { mode: 'split', assignments: { [tKid.id]: 'B' } }));
  const plan = a.store.get('day_plans', dayPlanId(trip.id, '2026-11-23'));
  await a.store.create('activities', newActivity(trip.id, { date: '2026-11-23', start_time: '09:00', title: '一起吃早餐' }));
  await a.store.create('activities', newActivity(trip.id, { date: '2026-11-23', start_time: '10:00', title: 'A 逛街', audience_groups: ['A'] }));
  await a.store.create('activities', newActivity(trip.id, { date: '2026-11-23', start_time: '10:30', title: 'B 廁所', audience_groups: ['B'] }));
  const legs = (g: string) => dayLegs(trip.id, '2026-11-23', g, plan, a.store.byTrip('activities', trip.id), []).legs;
  assert.deepEqual(legs('A').map((v) => v.toName), ['A 逛街']);
  assert.deepEqual(legs('B').map((v) => v.toName), ['B 廁所']);
});

test('舊的「移動」行程轉成路線，交通步驟一起帶過去', async () => {
  const { a, trip } = await family();
  await a.store.create('activities', newActivity(trip.id, { date: '2026-11-21', start_time: '13:00', title: '羽田機場' }));
  const move = await a.store.create('activities', newActivity(trip.id, { date: '2026-11-21', start_time: '13:46', kind: 'move', from_name: '羽田', to_name: '大森' }));
  await a.store.create('route_steps', newRouteStep(trip.id, move.id, { mode: 'subway', line: '京急線', from_stop: '羽田', to_stop: '品川', sort_order: 0 }));
  await a.store.create('route_steps', newRouteStep(trip.id, move.id, { mode: 'walk', sort_order: 1 }));
  await a.store.create('activities', newActivity(trip.id, { date: '2026-11-21', start_time: '15:00', title: 'HOTEL METS 大森' }));
  assert.equal(await convertMoves(a.store, trip.id), 1);
  const d = dayLegs(trip.id, '2026-11-21', '', undefined, a.store.byTrip('activities', trip.id), a.store.byTrip('route_legs', trip.id));
  assert.equal(d.legs.length, 1);
  assert.deepEqual(d.legs[0].leg?.steps.map((s) => s.mode), ['rail', 'walk']);
  assert.equal(d.legs[0].leg?.steps[0].line, '京急線');
  assert.ok(a.store.get('activities', move.id)?.deleted_at, '移動行程移到回收桶');
});

test('清單：沒分享別人看不到；分享後看得到但不能改；打勾各自的', async () => {
  const { a, b, mom, kid, trip, server } = await family();
  const id = await createList(b.store, trip.id, kid.id, '想買的', '💊');
  const item = await saveListItem(b.store, id, null, { kind: 'text', text: '面膜' });
  await saveListItem(b.store, id, null, { kind: 'link', text: '優惠券', url: 'https://example.com/c' });
  await b.syncer.sync();
  assert.equal(b.store.pending().length, 0, b.store.pending().map((e) => e.last_error).join());
  await a.syncer.sync();
  assert.equal(listsOf(a.store, trip.id, mom.id).shared.length, 0, '沒分享看不到');

  await updateList(b.store, id, { shared: true });
  await b.syncer.sync();
  await a.syncer.sync();
  assert.equal(listsOf(a.store, trip.id, mom.id).shared.length, 1, '分享後看得到');

  // 媽媽在大寶的清單打勾：只有媽媽自己看得到
  await toggleListCheck(a.store, trip.id, id, mom.id, item);
  await a.syncer.sync();
  assert.equal(a.store.pending().length, 0, a.store.pending().map((e) => e.last_error).join());
  await b.syncer.sync();
  assert.equal(checkedItems(b.store, id, kid.id).size, 0, '大寶看不到媽媽的打勾');
  assert.equal(checkedItems(a.store, id, mom.id).size, 1);

  // 媽媽想改大寶的清單：伺服器不接受
  await a.store.update('lists', id, { title: '偷改' });
  await a.syncer.sync();
  assert.equal(server.data.tables.lists[id].title, '想買的');

  // 取消分享：媽媽的手機上也會消失
  await updateList(b.store, id, { shared: false });
  await b.syncer.sync();
  await a.syncer.discard(`lists:${id}`);
  await a.syncer.sync();
  assert.equal(listsOf(a.store, trip.id, mom.id).shared.length, 0, '取消分享後消失');
});

test('使用者：只能改分組那天自己那組的行程與路線、自己的票券', async () => {
  const { a, b, trip, tKid, server } = await family();
  await a.store.create('day_plans', newDayPlan(trip.id, '2026-11-23', dayPlanId(trip.id, '2026-11-23'), { mode: 'split', assignments: { [tKid.id]: 'B' } }));
  await a.syncer.sync();
  await b.syncer.sync();
  const ok = await b.store.create('activities', newActivity(trip.id, { date: '2026-11-23', title: 'B 組午餐', audience_groups: ['B'] }));
  const bad = await b.store.create('activities', newActivity(trip.id, { date: '2026-11-23', title: 'A 組', audience_groups: ['A'] }));
  const bad2 = await b.store.create('activities', newActivity(trip.id, { date: '2026-11-24', title: '全員', audience_groups: [] }));
  await b.store.create('tickets', { ...(await import('../../src/data/factories.ts')).newTicket(trip.id, { title: '我的', traveler_ids: [tKid.id] }) });
  await b.store.create('route_legs', (await import('../../src/data/factories.ts')).newLeg(trip.id, { date: '2026-11-23', group_key: 'B' }));
  await b.syncer.sync();
  assert.ok(server.data.tables.activities[ok.id], '自己那組可以');
  assert.ok(!server.data.tables.activities[bad.id], '別組不行');
  assert.ok(!server.data.tables.activities[bad2.id], '沒分組的日子不行');
  assert.equal(Object.keys(server.data.tables.tickets).length, 1, '自己的票券可以');
  assert.equal(Object.keys(server.data.tables.route_legs).length, 1, '自己那組的路線可以');
  assert.equal(b.store.pending().filter((e) => e.status === 'failed').length, 2);
});

test('東京路線資料：方向、站數、轉乘', () => {
  const d = JSON.parse(readFileSync(new URL('../../public/data/rail-tokyo.json', import.meta.url), 'utf8')) as RailData;
  setRailData(d);
  const byName = (lineId: string, ja: string) => lineById(d, lineId)!.stations.find((id) => d.stations[id].ja === ja)!;

  const jk = lineById(d, 'JR-East.KeihinTohokuNegishi')!;
  const p1 = ridePath(d, jk, byName(jk.id, '品川'), byName(jk.id, '大森'))!;
  assert.equal(p1.stops, 2);
  assert.match(p1.direction, /大船/);

  const g = lineById(d, 'TokyoMetro.Ginza')!;
  const p2 = ridePath(d, g, byName(g.id, '外苑前'), byName(g.id, '渋谷'))!;
  assert.equal(p2.stops, 2);
  assert.match(p2.direction, /澀谷/);

  const jy = lineById(d, 'JR-East.Yamanote')!;
  const p3 = ridePath(d, jy, byName(jy.id, '原宿'), byName(jy.id, '渋谷'))!;
  assert.equal(p3.stops, 1);
  assert.match(p3.direction, /內回り/);
  const p4 = ridePath(d, jy, byName(jy.id, '大崎'), byName(jy.id, '東京'))!;
  assert.equal(p4.stops, 7, '大崎到東京走東側比較近（品川、高輪Gateway、田町、濱松町、新橋、有樂町、東京）');
  assert.match(p4.direction, /內回り/);

  const kk = lineById(d, 'Keikyu.Airport')!;
  const haneda = kk.stations.find((id) => d.stations[id].ja.startsWith('羽田空港第3'))!;
  const p5 = ridePath(d, kk, haneda, byName(kk.id, '京急蒲田'))!;
  assert.equal(p5.stops, 5);
  assert.equal(kk.codes[kk.stations.indexOf(haneda)], 'KK16');

  const e = lineById(d, 'Toei.Oedo')!;
  const p6 = ridePath(d, e, byName(e.id, '都庁前'), byName(e.id, '光が丘'))!;
  assert.equal(p6.stops, 10);

  const h = lineById(d, 'TokyoMetro.Hibiya')!;
  assert.equal(h.codes[h.stations.indexOf(byName(h.id, '霞ケ関'))], 'H07', '虎之門之丘開業後重新編號');
  assert.ok(transfersAt(d, byName(jk.id, '品川'), jk.id).some((l) => l.id === 'JR-East.Yamanote'), '品川可以轉山手線');
  assert.ok(sameStation(d, byName(jy.id, '品川'), byName(jk.id, '品川')));
});

test('清單與他人共用：兩邊都可以編輯，會同步', async () => {
  const { a, b, mom, kid, trip, server } = await family();
  const id = await createList(b.store, trip.id, kid.id, '一起買的', '🛍️');
  await updateList(b.store, id, { editors: [mom.id] });
  await b.syncer.sync();
  await a.syncer.sync();
  assert.equal(listsOf(a.store, trip.id, mom.id).mine.length, 1, '共用的清單出現在我的清單');
  await saveListItem(a.store, id, null, { kind: 'text', text: '媽媽加的' });
  await a.syncer.sync();
  assert.equal(a.store.pending().length, 0, a.store.pending().map((e) => e.last_error).join());
  await b.syncer.sync();
  assert.deepEqual(b.store.get('lists', id)!.items.map((i) => i.text), ['媽媽加的']);
  // 共用的人也可以分享給大家、刪除
  await a.store.update('lists', id, { shared: true });
  await a.syncer.sync();
  assert.equal(server.data.tables.lists[id].shared, true);
  await a.store.softDelete('lists', id);
  await a.syncer.sync();
  assert.equal(a.store.pending().length, 0, a.store.pending().map((e) => e.last_error).join());
  assert.ok(server.data.tables.lists[id].deleted_at, '共用的人可以刪除');
});

test('共用的人已經不是旅行成員（例如移除的測試手機）：同步時自動拿掉', async () => {
  const { b, mom, kid, trip, server } = await family();
  const id = await createList(b.store, trip.id, kid.id, '退稅攻略', '📝');
  await updateList(b.store, id, { editors: [mom.id, 'removed-phone-1', 'removed-phone-2'] });
  await b.syncer.sync();
  await b.syncer.sync();
  assert.deepEqual(b.store.get('lists', id)!.editors, [mom.id]);
  assert.deepEqual(server.data.tables.lists[id].editors, [mom.id]);
});

test('之前上傳失敗、雲端沒有的圖片：下次同步自動補傳，別人就看得到', async () => {
  const { a, b, trip, server } = await family();
  const path = `${trip.id}/imp-test.jpg`;
  await a.store.saveFile(path, new Blob(['img'], { type: 'image/jpeg' }), true);
  await a.store.create('activities', newActivity(trip.id, { date: '2026-11-21', title: '有圖', images: [{ id: 'i1', path }] }));
  // 模擬當時上傳失敗（No content provided），被移出佇列
  const remote = (a.syncer as unknown as { remote: { uploadFile: (...x: unknown[]) => Promise<void> } }).remote;
  const real = remote.uploadFile;
  remote.uploadFile = async () => { throw new RemoteError('other', 'No content provided'); };
  await a.syncer.sync();
  assert.equal(a.store.pendingUploads().length, 0);
  assert.ok(!server.files.has(path));
  remote.uploadFile = real;
  await a.syncer.sync();
  assert.ok(server.files.has(path), '補傳成功');
  await b.syncer.sync();
  const blob = await b.store.getFile(path);
  assert.equal(await blob?.text(), 'img');
  // 失敗通知只出現一次
  assert.equal(a.store.getMeta<unknown[]>('notices')?.filter((n) => JSON.stringify(n).includes('No content')).length ?? 1, 1);
});

test('圖示庫：大家上傳的圖示每個人都能用；只有上傳的人或管理者能刪', async () => {
  const { a, b, mom, kid, trip, server } = await family();
  const img1 = 'data:image/jpeg;base64,AAAA';
  const img2 = 'data:image/jpeg;base64,BBBB';
  await addTripIcon(b.store, trip.id, kid.id, img1);
  await addTripIcon(b.store, trip.id, kid.id, img1); // 同一張不重複
  await b.syncer.sync();
  await a.syncer.sync();
  assert.deepEqual(tripIcons(a.store, trip.id).map((i) => i.image), [img1], '媽媽看得到大寶上傳的圖示');
  await addTripIcon(a.store, trip.id, mom.id, img2);
  await a.syncer.sync();
  await b.syncer.sync();
  const momIcon = tripIcons(b.store, trip.id).find((i) => i.image === img2)!;
  await deleteTripIcon(b.store, momIcon.id);
  await b.syncer.sync();
  assert.ok(!server.data.tables.trip_icons[momIcon.id].deleted_at, '使用者不能刪別人的圖示');
  const kidIcon = tripIcons(a.store, trip.id).find((i) => i.image === img1)!;
  await deleteTripIcon(a.store, kidIcon.id);
  await a.syncer.sync();
  assert.ok(server.data.tables.trip_icons[kidIcon.id].deleted_at, '管理者可以刪');
  // 管理者拿掉內建 emoji
  await setHiddenIcons(a.store, trip.id, ['🎁']);
  await a.syncer.sync();
  await b.syncer.sync();
  assert.deepEqual(b.store.get('trips', trip.id)!.settings.hidden_icons, ['🎁']);
});

test('雲端還沒建立圖示庫資料表：其他資料照常同步', async () => {
  const { a, trip } = await family();
  const remote = (a.syncer as unknown as { remote: { pullTable: (t: string, ...x: unknown[]) => Promise<unknown[]> } }).remote;
  const real = remote.pullTable.bind(remote);
  remote.pullTable = async (t, ...x) => { if (t === 'trip_icons') throw new RemoteError('other', "Could not find the table 'public.trip_icons'"); return real(t, ...x); };
  await a.store.create('activities', newActivity(trip.id, { date: '2026-11-21', title: '照常同步' }));
  await a.syncer.sync();
  assert.equal(a.syncer.getState().status === 'error', false, JSON.stringify(a.syncer.getState()));
});
