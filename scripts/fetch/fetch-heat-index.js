'use strict';

/**
 * Fetches current temperature and humidity for all 44 Iligan barangay
 * reference points from Open-Meteo in a single batched call, computes the
 * NWS/Rothfusz heat index (see heat-index.js) for each, and writes
 * data/heat-index-latest.json in the schema/record.schema.json shape.
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
async function fetchCurrentWeather(points) {
  const latitudes = points.map((p) => p.latitude).join(',');
  const longitudes = points.map((p) => p.longitude).join(',');
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${latitudes}&longitude=${longitudes}` +
    '&current=temperature_2m,relative_humidity_2m&timezone=UTC';

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

function toUtcIso8601(openMeteoUtcTime) {
  // With timezone=UTC, Open-Meteo returns e.g. "2026-09-02T02:30" (no seconds, no offset).
  return `${openMeteoUtcTime}:00Z`;
}

function buildRecord(barangayPoint, weather) {
  const temperatureC = weather.current.temperature_2m;
  const relativeHumidityPct = weather.current.relative_humidity_2m;
  const hiC = heatIndexCelsius(temperatureC, relativeHumidityPct);
  const hiBand = band(hiC);

  const remarksParts = [
    DERIVED_LABEL,
    'Computed from Open-Meteo temperature_2m + relative_humidity_2m via the NWS/Rothfusz formula (not Open-Meteo apparent_temperature).',
    `Inputs: ${temperatureC.toFixed(1)}°C, ${relativeHumidityPct}% RH.`,
  ];
  if (barangayPoint.coordinate_confidence === 'low') {
    remarksParts.push(
      `Reference point coordinate_confidence is "low" (${barangayPoint.coordinate_method}) — treat this reading as indicative only.`
    );
  }

  return {
    date_time: toUtcIso8601(weather.current.time),
    barangay: barangayPoint.name,
    latitude: barangayPoint.latitude,
    longitude: barangayPoint.longitude,
    indicator: 'heat_index',
    value: Number(hiC.toFixed(1)),
    unit: '°C',
    band: hiBand,
    source: SOURCE_LABEL,
    responsible_office: null,
    status: 'derived',
    remarks: remarksParts.join(' '),
  };
}

async function main() {
  const barangays = loadReferencePoints();
  const weatherResults = await fetchCurrentWeather(barangays);

  const records = barangays.map((barangayPoint, i) => buildRecord(barangayPoint, weatherResults[i]));

  const output = {
    generated_at: new Date().toISOString(),
    indicator: 'heat_index',
    label: DERIVED_LABEL,
    schema: 'schema/record.schema.json',
    coordinate_note:
      'latitude/longitude are the barangay reference points from data/barangay_reference_points.json; Open-Meteo samples its own weather grid nearest to each point, which may snap several km away from the point itself.',
    records,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${records.length} heat_index records to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { fetchCurrentWeather, buildRecord, toUtcIso8601 };
