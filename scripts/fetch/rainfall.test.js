'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isDryDay, summarizeDaily } = require('./rainfall.js');

test('isDryDay: below 1.0mm is dry, at or above is not', () => {
  assert.equal(isDryDay(0), true);
  assert.equal(isDryDay(0.9), true);
  assert.equal(isDryDay(1.0), false);
  assert.equal(isDryDay(5.5), false);
});

test('summarizeDaily: sums the trailing 7 days (today + previous 6)', () => {
  const daily = [5.5, 2.1, 0.6, 0.3, 1.1, 0.4, 2.5, 0.1]; // 8 entries, oldest first
  const result = summarizeDaily(daily);
  assert.equal(result.rainfall_today_mm, 0.1);
  assert.equal(result.rainfall_7day_mm, 7.1); // 2.1+0.6+0.3+1.1+0.4+2.5+0.1
  assert.equal(result.window_days, 7);
});

test('summarizeDaily: counts dry days within the trailing 7-day window', () => {
  const daily = [5.5, 2.1, 0.6, 0.3, 1.1, 0.4, 2.5, 0.1];
  const result = summarizeDaily(daily);
  // trailing 7: 2.1, 0.6, 0.3, 1.1, 0.4, 2.5, 0.1 -> dry: 0.6, 0.3, 0.4, 0.1 = 4
  assert.equal(result.dry_days_7, 4);
});

test('summarizeDaily: consecutive dry days counts back from today, stops at first wet day', () => {
  const daily = [0.0, 0.0, 5.0, 0.2, 0.0, 0.9, 0.0]; // today (last) is dry; 4 dry days back to the 5.0mm day
  const result = summarizeDaily(daily);
  assert.equal(result.consecutive_dry_days, 4);
});

test('summarizeDaily: today is wet -> zero consecutive dry days', () => {
  const daily = [0.0, 0.0, 0.0, 4.0];
  const result = summarizeDaily(daily);
  assert.equal(result.consecutive_dry_days, 0);
});

test('summarizeDaily: entire window dry -> consecutive dry days equals array length', () => {
  const daily = [0.0, 0.5, 0.9, 0.0];
  const result = summarizeDaily(daily);
  assert.equal(result.consecutive_dry_days, 4);
});

test('summarizeDaily: fewer than 7 days available still works (partial window)', () => {
  const daily = [0.0, 2.0, 0.5];
  const result = summarizeDaily(daily);
  assert.equal(result.window_days, 3);
  assert.equal(result.rainfall_7day_mm, 2.5);
});

test('summarizeDaily: throws on empty input rather than silently returning zero', () => {
  assert.throws(() => summarizeDaily([]));
});
