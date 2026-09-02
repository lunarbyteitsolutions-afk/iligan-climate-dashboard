'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  inBoundingBox, haversineKm, nearestBarangay, parseCsvRow,
  dedupeHotspots, toUtcIso, utcIsoToManilaDateString, buildDailyTimeline
} = require('./fire-hotspots.js');

test('inBoundingBox: accepts points inside the Iligan box, rejects points outside', () => {
  assert.equal(inBoundingBox(8.23, 124.24), true); // roughly downtown Iligan
  assert.equal(inBoundingBox(8.05, 124.15), true); // corner, inclusive
  assert.equal(inBoundingBox(8.40, 124.62), true); // opposite corner, inclusive
  assert.equal(inBoundingBox(-2.82, 151.95), false); // Papua New Guinea, from a real sample row
  assert.equal(inBoundingBox(8.03, 124.24), false); // just south of the box
});

test('haversineKm: zero distance for identical points', () => {
  assert.equal(haversineKm(8.2, 124.3, 8.2, 124.3), 0);
});

test('haversineKm: matches a known approximate distance (Manila to Cebu, ~570km great-circle)', () => {
  const d = haversineKm(14.5995, 120.9842, 10.3157, 123.8854);
  assert.ok(Math.abs(d - 570) < 20, `expected ~570km, got ${d.toFixed(1)}km`);
});

test('nearestBarangay: picks the closest of the reference points', () => {
  const points = [
    { name: 'Far', latitude: 9.0, longitude: 125.0 },
    { name: 'Near', latitude: 8.201, longitude: 124.301 },
    { name: 'Mid', latitude: 8.5, longitude: 124.5 }
  ];
  const result = nearestBarangay(8.2, 124.3, points);
  assert.equal(result.name, 'Near');
  assert.ok(result.distance_km < 1);
});

test('parseCsvRow: splits a plain CSV line into an object keyed by header', () => {
  const header = ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp', 'satellite'];
  const row = parseCsvRow('8.32688,124.34564,2026-08-26,0438,nominal,3.36,N', header);
  assert.equal(row.latitude, '8.32688');
  assert.equal(row.acq_date, '2026-08-26');
  assert.equal(row.confidence, 'nominal');
});

test('toUtcIso: pads a short acq_time and treats it as UTC', () => {
  assert.equal(toUtcIso('2026-08-26', '438'), new Date('2026-08-26T04:38:00Z').toISOString());
  assert.equal(toUtcIso('2026-08-26', '0438'), new Date('2026-08-26T04:38:00Z').toISOString());
});

test('utcIsoToManilaDateString: UTC evening rolls into the next Manila calendar date', () => {
  // 2026-08-26T20:00Z + 8h = 2026-08-27T04:00 Manila
  assert.equal(utcIsoToManilaDateString('2026-08-26T20:00:00.000Z'), '2026-08-27');
  // 2026-08-26T04:00Z + 8h = 2026-08-26T12:00 Manila — same date
  assert.equal(utcIsoToManilaDateString('2026-08-26T04:00:00.000Z'), '2026-08-26');
});

test('dedupeHotspots: merges same acq_date+acq_time within 500m, keeps highest-FRP reading, lists both satellites', () => {
  const hotspots = [
    { acq_date: '2026-08-26', acq_time: '0438', latitude: 8.32688, longitude: 124.34564, confidence: 'nominal', frp: 3.36, satellite: 'suomi-npp-viirs' },
    { acq_date: '2026-08-26', acq_time: '0438', latitude: 8.3269, longitude: 124.3457, confidence: 'high', frp: 9.1, satellite: 'noaa-20-viirs' }
  ];
  const result = dedupeHotspots(hotspots);
  assert.equal(result.length, 1);
  assert.equal(result[0].frp, 9.1);
  assert.deepEqual(result[0].satellites.sort(), ['noaa-20-viirs', 'suomi-npp-viirs']);
});

test('dedupeHotspots: keeps distinct events separate (different time, or far apart)', () => {
  const hotspots = [
    { acq_date: '2026-08-26', acq_time: '0438', latitude: 8.327, longitude: 124.346, confidence: 'nominal', frp: 3.0, satellite: 'modis-c6.1' },
    { acq_date: '2026-08-26', acq_time: '0500', latitude: 8.327, longitude: 124.346, confidence: 'nominal', frp: 4.0, satellite: 'modis-c6.1' }, // different time
    { acq_date: '2026-08-26', acq_time: '0438', latitude: 8.20, longitude: 124.20, confidence: 'nominal', frp: 5.0, satellite: 'modis-c6.1' } // same time, far away
  ];
  const result = dedupeHotspots(hotspots);
  assert.equal(result.length, 3);
});

test('buildDailyTimeline: zero-fills every day in the window, including days with no hotspots at all', () => {
  const now = new Date('2026-09-02T12:00:00.000Z'); // 2026-09-02 20:00 Manila
  const hotspots = [
    { date_time: '2026-08-26T04:38:00.000Z' }, // 2026-08-26 12:38 Manila
    { date_time: '2026-08-26T05:00:00.000Z' }  // same Manila day, second hotspot
  ];
  const timeline = buildDailyTimeline(hotspots, 7, now);
  assert.equal(timeline.length, 7);
  assert.equal(timeline[0].date, '2026-08-27'); // oldest of the trailing 7 days ending 2026-09-02
  assert.equal(timeline[timeline.length - 1].date, '2026-09-02');
  const total = timeline.reduce((sum, d) => sum + d.count, 0);
  assert.equal(total, 0); // both hotspots fall outside this particular 7-day window
});

test('buildDailyTimeline: an empty hotspot list is a valid all-zero week', () => {
  const timeline = buildDailyTimeline([], 7, new Date('2026-09-02T12:00:00.000Z'));
  assert.equal(timeline.every((d) => d.count === 0), true);
});
