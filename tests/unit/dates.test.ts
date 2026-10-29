import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayCount, dayLabel, rangeLabel, todayIn, tripDays } from '../../src/lib/dates.ts';

test('依旅行日期自動產生每一天（含跨月、跨年）', () => {
  assert.deepEqual(tripDays('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual(tripDays('2026-02-27', '2026-03-01'), ['2026-02-27', '2026-02-28', '2026-03-01']);
  assert.equal(dayCount('2026-12-20', '2026-12-26'), 7);
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('中文日期標籤', () => {
  assert.equal(dayLabel('2026-10-29'), '10/29（四）');
  assert.equal(rangeLabel('2026-12-20', '2026-12-24'), '2026/12/20 – 12/24');
  assert.equal(rangeLabel('2026-12-30', '2027-01-02'), '2026/12/30 – 2027/1/2');
});

test('依旅行地時區判斷今天', () => {
  const now = new Date('2026-10-29T16:30:00Z'); // 台北 10/30 00:30，倫敦 10/29
  assert.equal(todayIn('Asia/Taipei', now), '2026-10-30');
  assert.equal(todayIn('Europe/London', now), '2026-10-29');
});
