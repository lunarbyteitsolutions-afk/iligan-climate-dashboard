'use strict';

/**
 * Fetches current + today's hourly temperature and humidity for all 44
 * Iligan barangay reference points from Open-Meteo in a single batched
 * call, computes the NWS/Rothfusz heat index (see heat-index.js) for each,
 * and writes data/heat-index-latest.json with:
 *   - `records`: one schema/record.schema.json-compliant current reading
 *     per barangay (unchanged shape from earlier versions of this script).
 *   - `barangays`: a richer per-barangay object (elevation, current, today's
 *     peak, and the full 24-hour curve) that the dashboard's charts/table
 *     consume. This is additional derived data, not itself a "record" in
 *     the schema sense — it doesn't replace `records`.
 *
 * PAGASA's iHeatMAP/Heat Index page is the authoritative source for heat
 * index in the Philippines. This script's output is a supplementary,
 * explicitly labeled derived indicator only — see CLAUDE.md.
 */

const fs = require('node:fs');
const path = require('node:path');
const { heatIndexCelsius, band } = require('./heat-index.js');

const REFERENCE_POINTS_PATH = path.join(__dirname, '..', '..', 'data', 'barangay_reference_points.json');
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'data', 'heat-index-latest.json');

const DERIVED_LABEL =
  'Derived DEVCON Iligan indicator — not an official PAGASA declaration or City of Iligan figure.';
const SOURCE_LABEL = 'Open-Meteo (supplementary) — PAGASA iHeatMAP is the authoritative reference';

function loadReferencePoints() {
  const raw = fs.readFileSync(REFERENCE_POINTS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.barangays;
}

/**
 * @param {Array<{latitude:number, longitude:number}>} points
 * @returns {Promise<Array<object>>} one Open-Meteo location object per point, same order as input
 */
async function fetchWeather(points) {
  const latitudes = points.map((p) => p.latitude).join(',');
  const longitudes = points.map((p) => p.longitude).join(',');
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${latitudes}&longitude=${longitudes}` +
    '&current=temperature_2m,relative_humidity_2m' +
    '&hourly=temperature_2m,relative_humidity_2m' +
    '&forecast_days=1&timezone=Asia%2FManila';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  // Open-Meteo returns a single object, not an array, when given exactly one
  // location; normalize so callers always get an array aligned to `points`.
  const results = Array.isArray(body) ? body : [body];
  if (results.length !== points.length) {
    throw new Error(
      `Open-Meteo returned ${results.length} results for ${points.length} requested points`
    );
  }
  return results;
}

/**
 * Open-Meteo, requested with timezone=Asia/Manila, returns bare local
 * wall-clock strings like "2026-09-02T13:00" (no offset). Manila is a fixed
 * UTC+8 with no DST, so appending the offset and letting Date parse it gives
 * the correct UTC instant for storage (CLAUDE.md: store UTC, display Manila).
 */
function manilaLocalToUtcIso(manilaLocalTime) {
  return new Date(`${manilaLocalTime}:00+08:00`).toISOString();
}

function hiPoint(temperatureC, relativeHumidityPct) {
  const value = Number(heatIndexCelsius(temperatureC, relativeHumidityPct).toFixed(1));
  return { value, band: band(value) };
}

function buildRecord(barangayPoint, weather, currentPoint, currentUtcIso) {
  const remarksParts = [
    DERIVED_LABEL,
    'Computed from Open-Meteo temperature_2m + relative_humidity_2m via the NWS/Rothfusz formula (not Open-Meteo apparent_temperature).',
    `Inputs: ${weather.current.temperature_2m.toFixed(1)}°C, ${weather.current.relative_humidity_2m}% RH.`,
  ];
  if (barangayPoint.coordinate_confidence === 'low') {
    remarksParts.push(
      `Reference point coordinate_confidence is "low" (${barangayPoint.coordinate_method}) — treat this reading as indicative only.`
    );
  }

  return {
    date_time: currentUtcIso,
    barangay: barangayPoint.name,
    latitude: barangayPoint.latitude,
    longitude: barangayPoint.longitude,
    indicator: 'heat_index',
    value: currentPoint.value,
    unit: '°C',
    band: currentPoint.band,
    source: SOURCE_LABEL,
    responsible_office: null,
    status: 'derived',
    remarks: remarksParts.join(' '),
  };
}

function buildBarangayEntry(barangayPoint, weather) {
  const currentUtcIso = manilaLocalToUtcIso(weather.current.time);
  const currentPoint = hiPoint(weather.current.temperature_2m, weather.current.relative_humidity_2m);

  const hourly = weather.hourly.time.map((localTime, i) => {
    const point = hiPoint(weather.hourly.temperature_2m[i], weather.hourly.relative_humidity_2m[i]);
    return { date_time: manilaLocalToUtcIso(localTime), value: point.value, band: point.band };
  });

  const peak = hourly.reduce((best, h) => (h.value > best.value ? h : best), hourly[0]);

  return {
    name: barangayPoint.name,
    latitude: barangayPoint.latitude,
    longitude: barangayPoint.longitude,
    elevation_m: weather.elevation,
    current: { date_time: currentUtcIso, value: currentPoint.value, band: currentPoint.band },
    today_peak: peak,
    hourly,
    record: buildRecord(barangayPoint, weather, currentPoint, currentUtcIso),
  };
}

const EXPECTED_BARANGAY_COUNT = 44;
const EXPECTED_HOURLY_COUNT = 24;

/**
 * Refuse to publish a partial/corrupt fetch. Returns a list of problems;
 * an empty list means the output is safe to write. Called before
 * fs.writeFileSync so a failed validation never touches the existing file
 * on disk — a bad run leaves last run's good data in place.
 */
function validateOutput(output) {
  const problems = [];

  if (output.records.length !== EXPECTED_BARANGAY_COUNT) {
    problems.push(`expected ${EXPECTED_BARANGAY_COUNT} records, got ${output.records.length}`);
  }
  if (output.barangays.length !== EXPECTED_BARANGAY_COUNT) {
    problems.push(`expected ${EXPECTED_BARANGAY_COUNT} barangays, got ${output.barangays.length}`);
  }

  output.records.forEach((r) => {
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) {
      problems.push(`record for ${r.barangay}: non-finite value ${r.value}`);
    }
  });

  output.barangays.forEach((b) => {
    if (typeof b.current.value !== 'number' || !Number.isFinite(b.current.value)) {
      problems.push(`${b.name}: non-finite current.value ${b.current.value}`);
    }
    if (typeof b.today_peak.value !== 'number' || !Number.isFinite(b.today_peak.value)) {
      problems.push(`${b.name}: non-finite today_peak.value ${b.today_peak.value}`);
    }
    if (typeof b.elevation_m !== 'number' || !Number.isFinite(b.elevation_m)) {
      problems.push(`${b.name}: non-finite elevation_m ${b.elevation_m}`);
    }
    if (!Array.isArray(b.hourly) || b.hourly.length !== EXPECTED_HOURLY_COUNT) {
      problems.push(`${b.name}: hourly series has ${Array.isArray(b.hourly) ? b.hourly.length : 'no'} entries, expected ${EXPECTED_HOURLY_COUNT}`);
    } else {
      b.hourly.forEach((h, i) => {
        if (typeof h.value !== 'number' || !Number.isFinite(h.value)) {
          problems.push(`${b.name}: non-finite hourly[${i}] value ${h.value}`);
        }
      });
    }
  });

  return problems;
}

async function main() {
  const barangayPoints = loadReferencePoints();
  const weatherResults = await fetchWeather(barangayPoints);

  const entries = barangayPoints.map((bp, i) => buildBarangayEntry(bp, weatherResults[i]));
  const records = entries.map((e) => e.record);
  const barangays = entries.map(({ record, ...rest }) => rest);

  const output = {
    generated_at: new Date().toISOString(),
    indicator: 'heat_index',
    label: DERIVED_LABEL,
    schema: 'schema/record.schema.json',
    coordinate_note:
      'latitude/longitude are the barangay reference points from data/barangay_reference_points.json; Open-Meteo samples its own weather grid nearest to each point, which may snap several km away from the point itself. elevation_m is Open-Meteo\'s grid-cell elevation, not a surveyed barangay elevation.',
    grid_resolution_note:
      'Several barangays fall in the same Open-Meteo weather grid cell and so share an identical modeled value. This is expected model resolution, not measurement precision at the barangay level — do not read tied values as coincidence.',
    records,
    barangays,
  };

  const problems = validateOutput(output);
  if (problems.length) {
    throw new Error(
      `Refusing to write ${path.relative(process.cwd(), OUTPUT_PATH)} — this fetch produced ${problems.length} problem(s); ` +
      `the existing file is left untouched:\n` + problems.map((p) => ' - ' + p).join('\n')
    );
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${records.length} heat_index records + ${barangays.length} barangay hourly series to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { fetchWeather, buildRecord, buildBarangayEntry, manilaLocalToUtcIso, validateOutput };
