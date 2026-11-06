import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryPersistence } from '../../src/data/persistence.ts';
import { LocalStore } from '../../src/data/store.ts';
import { newTraveler, newTrip } from '../../src/data/factories.ts';
import {
  copyTrip, dayPlanOf, deletePlace, emptyStep, exportTrip, liveSteps, parseBackup, placeUsage, saveActivity, saveDayPlan, saveTicket,
} from '../../src/data/actions.ts';
import type { ActivityDraft } from '../../src/data/actions.ts';
import { activityName } from '../../src/lib/plan.ts';

async function setup() {
  const store = new LocalStore(new MemoryPersistence());
  await store.init();
  const trip = await store.create('trips', newTrip('me', { title: '東京七日遊', start_date: '2026-11-21', end_date: '2026-11-27' }));
  return { store, tripId: trip.id };
}

function draft(over: Partial<ActivityDraft>): ActivityDraft {
  return {
    kind: 'sight', date: '2026-11-23', start_time: null, duration_min: null, cost: null, notes: '',
    audience_groups: [], audience_travelers: [], name: '', placeId: null, renameMode: 'all',
    from_name: '', to_name: '', steps: [], ...over,
  };
}

test('新增景點類行程：新名稱自動建立景點；同名不會重複建立', async () => {
  const { store, tripId } = await setup();
  const a1 = await saveActivity(store, tripId, null, draft({ kind: 'food', name: '一蘭拉麵', start_time: '18:00' }));
  const a2 = await saveActivity(store, tripId, null, draft({ kind: 'food', name: ' 一蘭拉麵 ', date: '2026-11-25' }));
  const places = store.byTrip('places', tripId);
  assert.equal(places.length, 1);
  assert.equal(places[0].kind, 'food');
  assert.equal(store.get('activities', a1)!.place_id, places[0].id);
  assert.equal(store.get('activities', a2)!.place_id, places[0].id);
  assert.equal(placeUsage(store, places[0].id).length, 2);
});

test('改名規則：全部一起改 vs 只改這一筆', async () => {
  const { store, tripId } = await setup();
  const a1 = await saveActivity(store, tripId, null, draft({ name: '明治神宮' }));
  const a2 = await saveActivity(store, tripId, null, draft({ name: '明治神宮', date: '2026-11-24' }));
  const pid = store.get('activities', a1)!.place_id!;

  await saveActivity(store, tripId, a1, draft({ name: '明治神宮外苑', placeId: pid, renameMode: 'all' }));
  assert.equal(store.get('places', pid)!.name, '明治神宮外苑');
  assert.equal(activityName(store.get('activities', a2)!, store.get('places', pid)), '明治神宮外苑', '另一筆也跟著改');

  await saveActivity(store, tripId, a2, draft({ name: '外苑（早上）', placeId: pid, renameMode: 'this', date: '2026-11-24' }));
  assert.equal(store.get('places', pid)!.name, '明治神宮外苑', '景點本身不變');
  assert.equal(activityName(store.get('activities', a2)!, store.get('places', pid)), '外苑（早上）');
  assert.equal(activityName(store.get('activities', a1)!, store.get('places', pid)), '明治神宮外苑');
});

test('移動行程：多步交通一起儲存、編輯、刪除、排序；換類型時交通步驟移入回收桶', async () => {
  const { store, tripId } = await setup();
  const s1 = { ...emptyStep('subway'), line: '京急機場線' };
  const s2 = { ...emptyStep('subway'), line: '京濱東北線' };
  const id = await saveActivity(store, tripId, null, draft({ kind: 'move', from_name: '羽田機場', to_name: '大森飯店', steps: [s1, s2] }));
  let steps = liveSteps(store, id);
  assert.deepEqual(steps.map((s) => s.line), ['京急機場線', '京濱東北線']);
  assert.equal(activityName(store.get('activities', id)!, undefined), '羽田機場－大森飯店');

  // 重新排序＋改內容＋新增＋刪除
  const [x, y] = steps.map((s) => ({ ...emptyStep(), ...s, id: s.id }));
  y.direction = '往大宮';
  await saveActivity(store, tripId, id, draft({ kind: 'move', from_name: '羽田機場', to_name: '大森飯店', steps: [y, { ...emptyStep('walk'), notes: '走 5 分鐘' }] }));
  steps = liveSteps(store, id);
  assert.deepEqual(steps.map((s) => s.line || s.mode), ['京濱東北線', 'walk']);
  assert.equal(steps[0].direction, '往大宮');
  assert.ok(store.get('route_steps', x.id!)!.deleted_at, '拿掉的步驟移入回收桶');

  await saveActivity(store, tripId, id, draft({ kind: 'sight', name: '大森' }));
  assert.equal(liveSteps(store, id).length, 0);
});

test('刪除景點：行程保留且名稱不消失', async () => {
  const { store, tripId } = await setup();
  const id = await saveActivity(store, tripId, null, draft({ name: '上野動物園' }));
  const pid = store.get('activities', id)!.place_id!;
  await deletePlace(store, pid);
  const a = store.get('activities', id)!;
  assert.equal(a.place_id, null);
  assert.equal(activityName(a, undefined), '上野動物園');
  assert.ok(!a.deleted_at);
});

test('每日分組設定：同一天只會有一筆', async () => {
  const { store, tripId } = await setup();
  await saveDayPlan(store, tripId, '2026-11-23', { mode: 'split', group_names: { A: '逛街組', B: '廁所組' } });
  await saveDayPlan(store, tripId, '2026-11-23', { title: '澀谷・原宿' });
  const plans = store.byTrip('day_plans', tripId);
  assert.equal(plans.length, 1);
  assert.equal(dayPlanOf(store, tripId, '2026-11-23')!.mode, 'split');
  assert.equal(plans[0].title, '澀谷・原宿');
});

test('票券：檔案先存在手機待上傳，一張票可連到多個行程', async () => {
  const { store, tripId } = await setup();
  const a = await saveActivity(store, tripId, null, draft({ name: '迪士尼海洋' }));
  const b = await saveActivity(store, tripId, null, draft({ name: '迪士尼陸地', date: '2026-11-26' }));
  const file = new Blob(['x'], { type: 'image/jpeg' });
  const id = await saveTicket(store, tripId, null, { title: '迪士尼兩日券', kind: '樂園門票', traveler_ids: [], activity_ids: [a, b], notes: '', file, fileName: 'a.jpg' });
  const t = store.get('tickets', id)!;
  assert.ok(t.file_path!.startsWith(`${tripId}/${id}-`));
  assert.equal(t.file_type, 'image');
  assert.ok(store.hasFile(t.file_path));
  assert.deepEqual(store.pendingUploads(), [t.file_path]);
  assert.deepEqual(t.activity_ids, [a, b]);
});

test('備份與複製：新旅行從新日期開始，不帶票券、預設不帶分組', async () => {
  const { store, tripId } = await setup();
  const mom = await store.create('travelers', newTraveler(tripId, { name: '媽媽' }));
  await saveActivity(store, tripId, null, draft({ name: '鶴岡八幡宮', date: '2026-11-24', start_time: '08:30' }));
  await saveActivity(store, tripId, null, draft({ name: 'GU', date: '2026-11-23', audience_groups: ['A'] }));
  await saveDayPlan(store, tripId, '2026-11-23', { mode: 'split', title: '澀谷', assignments: { [mom.id]: 'A' } });
  await saveTicket(store, tripId, null, { title: '機票', kind: '', traveler_ids: [], activity_ids: [], notes: '', file: null, fileName: '' });

  const backup = parseBackup(JSON.stringify(exportTrip(store, tripId)));
  const newId = await copyTrip(store, 'me', backup, { title: '東京再訪', start_date: '2027-03-01', itinerary: true, groups: false });
  const trip = store.get('trips', newId)!;
  assert.equal(trip.end_date, '2027-03-07');
  const acts = store.byTrip('activities', newId);
  assert.deepEqual(acts.map((a) => a.date).sort(), ['2027-03-03', '2027-03-04']);
  assert.ok(acts.every((a) => a.audience_groups.length === 0), '不帶入分組');
  assert.equal(store.byTrip('tickets', newId).length, 0, '不帶入票券');
  assert.equal(store.byTrip('travelers', newId)[0].name, '媽媽');
  assert.equal(store.byTrip('day_plans', newId)[0].mode, 'together');
  assert.equal(store.byTrip('day_plans', newId)[0].title, '澀谷');
  assert.equal(store.byTrip('activities', tripId).length, 2, '原本的旅行不受影響');

  const blank = await copyTrip(store, 'me', backup, { title: '空白', start_date: '2027-05-01', itinerary: false, groups: false });
  assert.equal(store.byTrip('activities', blank).length, 0);
  assert.throws(() => parseBackup('{"hello":1}'));
});
