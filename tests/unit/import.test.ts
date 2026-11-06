// 匯入行程檔、沒填時間的排序、路線方案
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryPersistence } from '../../src/data/persistence.ts';
import { LocalStore } from '../../src/data/store.ts';
import { newActivity, newTraveler, newTrip } from '../../src/data/factories.ts';
import { importIntoTrip, parseImport } from '../../src/data/importer.ts';
import type { ImportFile } from '../../src/data/importer.ts';
import { dayLegs, legPlans } from '../../src/lib/legs.ts';
import { sortActivities, visibleIn } from '../../src/lib/plan.ts';
import { dayPlanOf, saveLegPlans } from '../../src/data/actions.ts';

async function setup() {
  const store = new LocalStore(new MemoryPersistence());
  await store.init();
  const trip = await store.create('trips', newTrip('me', { title: '東京', start_date: '2026-11-21', end_date: '2026-11-27' }));
  for (const name of ['phil', '大酷', '阿慧']) await store.create('travelers', newTraveler(trip.id, { name }));
  return { store, tripId: trip.id };
}

test('沒填時間的行程排在指定的行程後面', () => {
  const a = newActivity('t', { date: '2026-11-23', start_time: '08:30', title: '新宿御苑', created_at: '1' });
  const b = newActivity('t', { date: '2026-11-23', start_time: null, title: '明治神宮外苑', after_activity_id: a.id, created_at: '3' });
  const c = newActivity('t', { date: '2026-11-23', start_time: '11:00', title: 'SHAKE SHACK', created_at: '2' });
  const d = newActivity('t', { date: '2026-11-23', start_time: null, title: '沒指定', created_at: '0' });
  assert.deepEqual(sortActivities([c, d, b, a]).map((x) => x.title), ['新宿御苑', '明治神宮外苑', 'SHAKE SHACK', '沒指定']);
});

test('匯入行程檔：行程、分組、路線、方案、圖片', async () => {
  const { store, tripId } = await setup();
  const file: ImportFile = {
    format: 'family-trip-import', version: 1, id: 'x', title: '測試', start_date: '2026-11-21', end_date: '2026-11-27',
    groups: { '2026-11-22': { names: { A: '跑步組', B: '逛街組' }, members: { A: ['phil'], B: ['大酷', '阿慧', 'fisher'] } } },
    activities: [
      { key: 'h', date: '2026-11-21', time: '12:50', kind: 'other', title: '抵達羽田機場', images: ['p'] },
      { key: 'o', date: '2026-11-21', time: '15:00', kind: 'lodging', title: '飯店' },
      { key: 'u', date: '2026-11-21', time: null, after: 'h', kind: 'sight', title: '機場拍照' },
      { key: 'r', date: '2026-11-22', time: '19:00', kind: 'sight', title: '皇居跑步', group: 'A' },
      { key: 's', date: '2026-11-22', time: '19:00', kind: 'sight', title: '一番街', group: 'B' },
    ],
    legs: [{ date: '2026-11-21', from: 'u', to: 'o', plans: [
      { id: '1', label: '京急', steps: [{ id: 'a', mode: 'walk', line: '', from: '', to: '', direction: '', note: '' }] },
      { id: '2', label: '單軌', steps: [{ id: 'b', mode: 'walk', line: '', from: '', to: '', direction: '', note: '' }] },
    ] }],
    maps: [{ label: '地鐵圖', image: 'p' }],
    images: { p: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==' },
  };
  const r = await importIntoTrip(store, tripId, parseImport(JSON.stringify(file)));
  assert.deepEqual(r.addedTravelers, ['fisher'], '沒有的同行者會新增');
  const acts = store.byTrip('activities', tripId);
  assert.deepEqual(sortActivities(acts.filter((a) => a.date === '2026-11-21')).map((a) => a.title), ['抵達羽田機場', '機場拍照', '飯店']);
  assert.equal(acts.find((a) => a.title === '抵達羽田機場')!.images.length, 1);
  const plan = dayPlanOf(store, tripId, '2026-11-22')!;
  assert.equal(plan.group_names.A, '跑步組');
  const phil = store.byTrip('travelers', tripId).find((t) => t.name === 'phil')!;
  assert.equal(plan.assignments[phil.id], 'A');
  assert.ok(!visibleIn(acts.find((a) => a.title === '一番街')!, plan, 'A', null), '跑步組看不到逛街組的行程');
  const d = dayLegs(tripId, '2026-11-21', '', undefined, acts, store.byTrip('route_legs', tripId));
  const leg = d.legs.find((v) => v.fromName === '機場拍照')!.leg!;
  assert.deepEqual(legPlans(leg).map((p) => p.label), ['京急', '單軌']);
  assert.equal(leg.steps[0].id, 'a', '主要方案存在 steps');
  assert.equal(store.get('trips', tripId)!.settings.maps!.length, 1);
  assert.equal(store.pendingUploads().length, 1, '圖片等待上傳');

  // 換主要方案
  await saveLegPlans(store, leg.id, [legPlans(leg)[1], legPlans(leg)[0]], '', '13:30');
  const after = store.get('route_legs', leg.id)!;
  assert.equal(after.steps[0].id, 'b');
  assert.equal(after.start_time, '13:30');
});
