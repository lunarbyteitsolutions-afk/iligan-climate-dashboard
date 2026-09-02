'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { heatIndexCelsius, band } = require('./heat-index.js');

const fToC = (f) => ((f - 32) * 5) / 9;
const cToF = (c) => (c * 9) / 5 + 32;

/**
 * Tolerance for the three "published example" tests below: NWS publishes
 * these worked examples rounded to the nearest whole Fahrenheit degree, so a
 * correct implementation will land within roughly half a degree, not exactly
 * on the rounded value.
 */
const PUBLISHED_EXAMPLE_TOLERANCE_F = 0.5;

test('matches NWS Amarillo worked example: 100F/55% RH -> 124F', () => {
  // Source: https://www.weather.gov/ama/heatindex
  const hiF = cToF(heatIndexCelsius(fToC(100), 55));
  assert.ok(
    Math.abs(hiF - 124) <= PUBLISHED_EXAMPLE_TOLERANCE_F,
    `expected ~124F, got ${hiF.toFixed(2)}F`
  );
});

test('matches NWS Amarillo worked example: 100F/15% RH -> 96F (below air temp, low humidity)', () => {
  // Source: https://www.weather.gov/ama/heatindex
  const hiF = cToF(heatIndexCelsius(fToC(100), 15));
  assert.ok(
    Math.abs(hiF - 96) <= PUBLISHED_EXAMPLE_TOLERANCE_F,
    `expected ~96F, got ${hiF.toFixed(2)}F`
  );
});

test('matches NWS national safety page worked example: 96F/65% RH -> 121F', () => {
  // Source: https://www.weather.gov/safety/heat-index
  const hiF = cToF(heatIndexCelsius(fToC(96), 65));
  assert.ok(
    Math.abs(hiF - 121) <= PUBLISHED_EXAMPLE_TOLERANCE_F,
    `expected ~121F, got ${hiF.toFixed(2)}F`
  );
});

/**
 * The three tests above exercise the base Rothfusz regression. NWS's public
 * chart only tabulates RH 40-100%, so there is no published table value to
 * check the low-/high-humidity adjustment branches against. Instead these
 * next values were confirmed by independently re-transcribing the adjustment
 * formulas from the NOAA/WPC source
 * (https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml) in a
 * separate script and checking it agreed with this module bit-for-bit
 * before being pinned as an expected value here — this catches transcription
 * bugs in heat-index.js, it is not an independent confirmation of the
 * formula itself.
 */
const FORMULA_VERIFIED_TOLERANCE_F = 0.05;

test('low-humidity adjustment applies (RH < 13%, 80-112F)', () => {
  const hiF = cToF(heatIndexCelsius(fToC(95), 10));
  assert.ok(
    Math.abs(hiF - 89.45) <= FORMULA_VERIFIED_TOLERANCE_F,
    `expected ~89.45F, got ${hiF.toFixed(2)}F`
  );
});

test('high-humidity adjustment applies (RH > 85%, 80-87F)', () => {
  const hiF = cToF(heatIndexCelsius(fToC(82), 95));
  assert.ok(
    Math.abs(hiF - 93.97) <= FORMULA_VERIFIED_TOLERANCE_F,
    `expected ~93.97F, got ${hiF.toFixed(2)}F`
  );
});

test('falls back to the simple Steadman formula below ~80F', () => {
  const hiF = cToF(heatIndexCelsius(fToC(75), 50));
  assert.ok(
    Math.abs(hiF - 74.55) <= FORMULA_VERIFIED_TOLERANCE_F,
    `expected ~74.55F, got ${hiF.toFixed(2)}F`
  );
});

test('band() boundaries match the NWS Caution/Extreme Caution/Danger/Extreme Danger chart', () => {
  assert.equal(band(fToC(85)), 'Caution');
  assert.equal(band(fToC(95)), 'Extreme Caution');
  assert.equal(band(fToC(110)), 'Danger');
  assert.equal(band(fToC(135)), 'Extreme Danger');
});
