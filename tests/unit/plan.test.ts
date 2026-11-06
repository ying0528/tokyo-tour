import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newActivity, newTraveler } from '../../src/data/factories.ts';
import type { DayPlan, Ticket } from '../../src/data/types.ts';
import {
  activityName, dayPlanId, endTime, mapLink, sortActivities, ticketForTraveler, visibleIn, visibleToTraveler,
} from '../../src/lib/plan.ts';

const TRIP = 'trip-1';
const D = '2026-11-23';

function plan(over: Partial<DayPlan> = {}): DayPlan {
  return {
    id: dayPlanId(TRIP, D), trip_id: TRIP, date: D, mode: 'split', groups: ['A', 'B'],
    assignments: {}, group_names: { A: '逛街組', B: '廁所組' }, title: '', notes: '',
    deleted_at: null, created_at: null, updated_at: null, updated_by: null, rev: 0, ...over,
  };
}

test('依時間自動排序，沒有時間的放最後；改時間就重排', () => {
  const a = newActivity(TRIP, { date: D, start_time: '18:00', title: '一蘭' });
  const b = newActivity(TRIP, { date: D, start_time: '08:30:00', title: '新宿御苑' });
  const c = newActivity(TRIP, { date: D, title: '沒時間' });
  const d = newActivity(TRIP, { date: '2026-11-22', start_time: '23:00', title: '前一天' });
  assert.deepEqual(sortActivities([a, b, c, d]).map((x) => x.title), ['前一天', '新宿御苑', '一蘭', '沒時間']);
  a.start_time = '07:00';
  assert.equal(sortActivities([a, b, c]).map((x) => x.title)[0], '一蘭');
});

test('結束時間與顯示名稱', () => {
  assert.equal(endTime({ start_time: '11:00', duration_min: 120 }), '13:00');
  assert.equal(endTime({ start_time: '23:30', duration_min: 60 }), '00:30');
  assert.equal(endTime({ start_time: '11:00', duration_min: null }), '');
  const move = newActivity(TRIP, { date: D, kind: 'move', from_name: '羽田機場', to_name: '大森飯店' });
  assert.equal(activityName(move, undefined), '羽田機場－大森飯店');
  const linked = newActivity(TRIP, { date: D, kind: 'food' });
  assert.equal(activityName(linked, { name: 'EDW yellow' } as never), 'EDW yellow');
});

test('每日設定 id 固定：兩支手機離線建立同一天也不會重複', () => {
  assert.equal(dayPlanId(TRIP, D), dayPlanId(TRIP, D));
  assert.notEqual(dayPlanId(TRIP, D), dayPlanId(TRIP, '2026-11-24'));
  assert.match(dayPlanId(TRIP, D), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('分組：各人只看到自己組和共同活動；晚餐只存一筆兩組都看得到', () => {
  const mom = newTraveler(TRIP, { name: '媽媽' });
  const dad = newTraveler(TRIP, { name: '爸爸' });
  const p = plan({ assignments: { [mom.id]: 'A', [dad.id]: 'B' } });
  const gu = newActivity(TRIP, { date: D, audience_groups: ['A'] });
  const toilet = newActivity(TRIP, { date: D, audience_groups: ['B'] });
  const ramen = newActivity(TRIP, { date: D });
  const dadOnly = newActivity(TRIP, { date: D, audience_travelers: [dad.id] });

  assert.ok(visibleToTraveler(gu, p, mom.id));
  assert.ok(!visibleToTraveler(toilet, p, mom.id));
  assert.ok(visibleToTraveler(ramen, p, mom.id) && visibleToTraveler(ramen, p, dad.id));
  assert.ok(visibleToTraveler(dadOnly, p, dad.id) && !visibleToTraveler(dadOnly, p, mom.id));

  assert.ok(visibleIn(toilet, p, null, null), '查看全部時都顯示');
  assert.ok(!visibleIn(toilet, p, 'A', null));
  assert.ok(visibleIn(dadOnly, p, 'B', null), '指定個人的行程出現在他那組');

  // 改分組後立即反映
  p.assignments[mom.id] = 'B';
  assert.ok(visibleToTraveler(toilet, p, mom.id) && !visibleToTraveler(gu, p, mom.id));
  // 不分組的日子全部顯示
  assert.ok(visibleToTraveler(toilet, plan({ mode: 'together' }), mom.id));
  assert.ok(visibleToTraveler(toilet, undefined, mom.id));
});

test('票券：A 組專用不出現在 B 組旅伴清單；指定持有人只給持有人', () => {
  const mom = newTraveler(TRIP, { name: '媽媽' });
  const dad = newTraveler(TRIP, { name: '爸爸' });
  const p = plan({ assignments: { [mom.id]: 'A', [dad.id]: 'B' } });
  const disneyA = newActivity(TRIP, { date: D, audience_groups: ['A'] });
  const acts = new Map([[disneyA.id, disneyA]]);
  const plans = new Map([[D, p]]);
  const base = { trip_id: TRIP, title: '', kind: '', file_path: null, file_type: null, file_size: null, sort_order: 0, notes: '', deleted_at: null, created_at: null, updated_at: null, updated_by: null, rev: 0 };
  const shared: Ticket = { ...base, id: 't1', traveler_ids: [], activity_ids: [disneyA.id] };
  const dads: Ticket = { ...base, id: 't2', traveler_ids: [dad.id], activity_ids: [] };
  assert.ok(ticketForTraveler(shared, mom.id, acts, plans));
  assert.ok(!ticketForTraveler(shared, dad.id, acts, plans));
  assert.ok(ticketForTraveler(dads, dad.id, acts, plans) && !ticketForTraveler(dads, mom.id, acts, plans));
});

test('地圖：優先用 Naver Map 連結，沒有就搜尋', () => {
  assert.equal(mapLink({ map_url: 'https://naver.me/abc', name: 'x', address: '' }), 'https://naver.me/abc');
  assert.equal(mapLink({ map_url: '', name: '一蘭 澀谷', address: '' }), 'https://map.naver.com/p/search/%E4%B8%80%E8%98%AD%20%E6%BE%80%E8%B0%B7');
  assert.equal(mapLink({ map_url: 'javascript:alert(1)', name: '', address: '' }), null);
});
