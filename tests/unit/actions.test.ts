import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryPersistence } from '../../src/data/persistence.ts';
import { LocalStore } from '../../src/data/store.ts';
import { newTraveler, newTrip } from '../../src/data/factories.ts';
import {
  copyTrip, dayPlanOf, emptyStep, exportTrip, getPrivateNote, linkLabel, liveSteps, parseBackup, saveActivity, saveDayPlan,
  savePrivateNote, saveTicket, validateActivity,
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
    kind: 'sight', date: '2026-11-23', start_time: null, notes: '',
    audience_groups: [], audience_travelers: [], name: '',
    from_name: '', to_name: '', steps: [], map_url: '', links: [], ...over,
  };
}

test('行程名稱直接存在行程上，不再建立景點；地圖與其他連結一起儲存', async () => {
  const { store, tripId } = await setup();
  const id = await saveActivity(store, tripId, null, draft({
    kind: 'food', name: '一蘭拉麵', start_time: '18:00',
    map_url: 'https://maps.app.goo.gl/abc',
    links: [{ label: '訂位', url: 'https://example.com/book' }, { label: '', url: 'www.ichiran.com' }, { label: '空的', url: '' }],
  }));
  const a = store.get('activities', id)!;
  assert.equal(store.byTrip('places', tripId).length, 0);
  assert.equal(activityName(a, undefined), '一蘭拉麵');
  assert.equal(a.map_url, 'https://maps.app.goo.gl/abc');
  assert.deepEqual(a.links, [{ label: '訂位', url: 'https://example.com/book' }, { label: '', url: 'https://www.ichiran.com/' }]);
  assert.equal(linkLabel(a.links[1]), 'ichiran.com');
  assert.ok(validateActivity(draft({ name: 'x', map_url: 'javascript:alert(1)' })));
  assert.ok(validateActivity(draft({ name: 'x', links: [{ label: '壞的', url: 'not a url' }] })));
});

test('私人備忘錄：每人每筆行程一則，同一則可以一直修改', async () => {
  const { store, tripId } = await setup();
  const id = await saveActivity(store, tripId, null, draft({ name: '晴空塔' }));
  await savePrivateNote(store, tripId, id, 'user-a', '記得帶相機');
  await savePrivateNote(store, tripId, id, 'user-a', '記得帶相機和行動電源');
  await savePrivateNote(store, tripId, id, 'user-b', '我想吃冰淇淋');
  assert.equal(getPrivateNote(store, id, 'user-a')!.note, '記得帶相機和行動電源');
  assert.equal(getPrivateNote(store, id, 'user-b')!.note, '我想吃冰淇淋');
  assert.equal(store.byTrip('private_notes', tripId).length, 2);
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
