import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentActivityId } from '../../src/lib/plan.ts';

const days = ['2026-11-21', '2026-11-22', '2026-11-23'];
const d1 = [{ id: 'fly', start_time: '09:00:00' }, { id: 'land', start_time: '12:50' }, { id: 'hotel', start_time: '15:00' }, { id: 'walk', start_time: null }, { id: 'cafe', start_time: '16:00' }];

test('旅行開始前：框第一天第一個', () => {
  assert.equal(currentActivityId(d1, days, '2026-11-21', { date: '2026-11-10', time: '23:40' }), 'fly');
  assert.equal(currentActivityId(d1, days, '2026-11-22', { date: '2026-11-10', time: '23:40' }), null, '其他天不框');
});

test('旅行中：今天最後一個已經開始的', () => {
  const day = { date: '2026-11-21' };
  assert.equal(currentActivityId(d1, days, '2026-11-21', { ...day, time: '07:00' }), 'fly', '還沒開始就框第一個');
  assert.equal(currentActivityId(d1, days, '2026-11-21', { ...day, time: '13:10' }), 'land');
  assert.equal(currentActivityId(d1, days, '2026-11-21', { ...day, time: '15:30' }), 'walk', '沒時間的跟著前一個的時間');
  assert.equal(currentActivityId(d1, days, '2026-11-21', { ...day, time: '16:00' }), 'cafe');
  assert.equal(currentActivityId(d1, days, '2026-11-22', { ...day, time: '16:00' }), null, '看別天不框');
});

test('旅行結束後：不框', () => {
  assert.equal(currentActivityId(d1, days, '2026-11-23', { date: '2026-11-24', time: '10:00' }), null);
});
