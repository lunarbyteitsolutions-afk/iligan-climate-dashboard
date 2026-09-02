'use strict';

/**
 * Fetches daily precipitation (past 7 days + today) for all 44 Iligan
 * barangay reference points from Open-Meteo in a single batched call,
 * summarizes it (see rainfall.js), and writes data/rainfall-latest.json.
 *
 * PAGASA is the authoritative source for rainfall in the Philippines.
 * Open-Meteo is a supplementary, explicitly labeled derived indicator only
 * — see CLAUDE.md. This never reports "drought" or a "rainfall deficit"
 * (that needs a climatological normal this project does not have); only
 * "7-day accumulated rainfall" and "consecutive dry days" are used.
 */

const fs = require('node:fs');
const path = require('node:path');
const { DRY_DAY_THRESHOLD_MM, summarizeDaily } = require('./rainfall.js');

const REFERENCE_POINTS_PATH = path.join(__dirname, '..', '..', 'data', 'barangay_reference_points.json');
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'data', 'rainfall-latest.json');

const DERIVED_LABEL =
  'Heat index values shown here are computed from Open-Meteo model data. PAGASA — iHeatMAP, the Heat Index page, AWS readings and ENSO advisories — remains the authoritative reference for official heat index values and El Niño declarations. Values marked derived are modelled, not observed.';
const SOURCE_LABEL =
  'Open-Meteo (supplementary) — PAGASA is the authoritative rainfall reference for the Philippines';
const RESPONSIBLE_OFFICE = 'PAGASA (authoritative); CDRRMO for local rain gauges';

function loadReferencePoints() {
  const raw = fs.readFileSync(REFERENCE_POINTS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.barangays;
}

/**
 * @param {Array<{latitude:number, longitude:number}>} points
 * @returns {Promise<Array<object>>} one Open-Meteo location object per point, same order as input
 */
async function fetchDaily(points) {
  const latitudes = points.map((p) => p.latitude).join(',');
  const longitudes = points.map((p) => p.longitude).join(',');
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${latitudes}&longitude=${longitudes}` +
    '&daily=precipitation_sum,precipitation_hours' +
    '&past_days=7&forecast_days=1&timezone=Asia%2FManila';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const results = Array.isArray(body) ? body : [body];
  if (results.length !== points.length) {
    throw new Error(
      `Open-Meteo returned ${results.length} results for ${points.length} requested points`
    );
  }
  return results;
}

function buildRecord(barangayPoint, summary, todayDateIso) {
  const remarksParts = [
    DERIVED_LABEL,
    `7-day accumulated rainfall (today + previous ${summary.window_days - 1} days). ` +
      `Dry day = under ${DRY_DAY_THRESHOLD_MM.toFixed(1)}mm.`,
    `Today: ${summary.rainfall_today_mm}mm. Dry days in this window: ${summary.dry_days_7} of ${summary.window_days}. ` +
      `Consecutive dry days (through today): ${summary.consecutive_dry_days}.`
  ];
  if (barangayPoint.coordinate_confidence === 'low') {
    remarksParts.push(
      `Reference point coordinate_confidence is "low" (${barangayPoint.coordinate_method}) — treat this reading as indicative only.`
    );
  }

  return {
    date_time: todayDateIso,
    barangay: barangayPoint.name,
    latitude: barangayPoint.latitude,
    longitude: barangayPoint.longitude,
    indicator: 'rainfall_7day_mm',
    value: summary.rainfall_7day_mm,
    unit: 'mm',
    source: SOURCE_LABEL,
    responsible_office: RESPONSIBLE_OFFICE,
    status: 'derived',
    remarks: remarksParts.join(' ')
  };
}

/**
 * Open-Meteo, requested with timezone=Asia/Manila, returns bare local dates
 * like "2026-09-02" for `daily.time` with no time-of-day. Manila is a fixed
 * UTC+8 with no DST; midnight Manila is the previous day 16:00 UTC, so this
 * anchors each date to local midnight before converting (CLAUDE.md: store
 * UTC, display Manila).
 */
function manilaDateToUtcIso(manilaDate) {
  return new Date(`${manilaDate}T00:00:00+08:00`).toISOString();
}

function buildBarangayEntry(barangayPoint, weather) {
  const dailyDates = weather.daily.time;
  const dailyPrecipMm = weather.daily.precipitation_sum;
  const dailyPrecipHours = weather.daily.precipitation_hours;
  const summary = summarizeDaily(dailyPrecipMm);
  const todayDateIso = manilaDateToUtcIso(dailyDates[dailyDates.length - 1]);

  const daily = dailyDates.map((date, i) => ({
    date,
    precipitation_mm: dailyPrecipMm[i],
    precipitation_hours: dailyPrecipHours[i],
    is_dry: dailyPrecipMm[i] < DRY_DAY_THRESHOLD_MM
  }));

  return {
    name: barangayPoint.name,
    latitude: barangayPoint.latitude,
    longitude: barangayPoint.longitude,
    rainfall_today_mm: summary.rainfall_today_mm,
    rainfall_7day_mm: summary.rainfall_7day_mm,
    dry_days_7: summary.dry_days_7,
    consecutive_dry_days: summary.consecutive_dry_days,
    window_days: summary.window_days,
    daily,
    record: buildRecord(barangayPoint, summary, todayDateIso)
  };
}

const EXPECTED_BARANGAY_COUNT = 44;
const EXPECTED_DAILY_COUNT = 8; // past_days=7 + forecast_days=1 (today)

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
    if (typeof r.value !== 'number' || !Number.isFinite(r.value) || r.value < 0) {
      problems.push(`record for ${r.barangay}: invalid rainfall_7day_mm value ${r.value}`);
    }
  });

  output.barangays.forEach((b) => {
    ['rainfall_today_mm', 'rainfall_7day_mm'].forEach((field) => {
      if (typeof b[field] !== 'number' || !Number.isFinite(b[field]) || b[field] < 0) {
        problems.push(`${b.name}: invalid ${field} ${b[field]}`);
      }
    });
    if (!Number.isInteger(b.dry_days_7) || b.dry_days_7 < 0 || b.dry_days_7 > b.window_days) {
      problems.push(`${b.name}: dry_days_7 (${b.dry_days_7}) out of range for window_days (${b.window_days})`);
    }
    if (!Number.isInteger(b.consecutive_dry_days) || b.consecutive_dry_days < 0) {
      problems.push(`${b.name}: invalid consecutive_dry_days ${b.consecutive_dry_days}`);
    }
    if (!Array.isArray(b.daily) || b.daily.length !== EXPECTED_DAILY_COUNT) {
      problems.push(`${b.name}: daily series has ${Array.isArray(b.daily) ? b.daily.length : 'no'} entries, expected ${EXPECTED_DAILY_COUNT}`);
    }
  });

  return problems;
}

async function main() {
  const barangayPoints = loadReferencePoints();
  const weatherResults = await fetchDaily(barangayPoints);

  const entries = barangayPoints.map((bp, i) => buildBarangayEntry(bp, weatherResults[i]));
  const records = entries.map((e) => e.record);
  const barangays = entries.map(({ record, ...rest }) => rest);

  const output = {
    generated_at: new Date().toISOString(),
    indicator: 'rainfall',
    label: DERIVED_LABEL,
    schema: 'schema/record.schema.json',
    dry_day_threshold_mm: DRY_DAY_THRESHOLD_MM,
    coordinate_note:
      'latitude/longitude are the barangay reference points from data/barangay_reference_points.json; Open-Meteo samples its own weather grid nearest to each point, which may snap several km away from the point itself.',
    grid_resolution_note:
      'Several barangays fall in the same Open-Meteo weather grid cell and so share identical modeled daily rainfall. This is expected model resolution, not measurement precision at the barangay level — do not read tied values as coincidence.',
    records,
    barangays
  };

  const problems = validateOutput(output);
  if (problems.length) {
    throw new Error(
      `Refusing to write ${path.relative(process.cwd(), OUTPUT_PATH)} — this fetch produced ${problems.length} problem(s); ` +
      `the existing file is left untouched:\n` + problems.map((p) => ' - ' + p).join('\n')
    );
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${records.length} rainfall records to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { fetchDaily, buildRecord, buildBarangayEntry, manilaDateToUtcIso, validateOutput };
