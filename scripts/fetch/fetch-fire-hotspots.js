'use strict';

/**
 * Fetches NASA FIRMS' public 7-day active-fire CSVs for the SouthEast Asia
 * region (no API key), streams and filters each to Iligan's bounding box
 * as it downloads (each source CSV is ~5MB covering the whole region —
 * never buffered in full, and never committed), deduplicates detections
 * seen by more than one satellite, and writes data/fire-hotspots-latest.json.
 *
 * These are satellite thermal anomaly detections, NOT confirmed fire
 * incidents — see CLAUDE.md and fire.html. status is "reported" (a
 * detection was reported), never "verified" as an actual fire. The
 * official "Fire incidents" indicator (BFP Iligan City / ICENRO) stays
 * NO DATA / PENDING regardless of what this script finds.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  inBoundingBox, nearestBarangay, parseCsvRow, toHotspot, dedupeHotspots,
  toUtcIso, buildDailyTimeline
} = require('./fire-hotspots.js');

const REFERENCE_POINTS_PATH = path.join(__dirname, '..', '..', 'data', 'barangay_reference_points.json');
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'data', 'fire-hotspots-latest.json');

const DERIVED_LABEL =
  'Derived DEVCON Iligan indicator — not an official PAGASA declaration or City of Iligan figure.';
const DISCLAIMER =
  'These are satellite-detected thermal anomalies (NASA FIRMS), NOT confirmed fire incidents. ' +
  'A hotspot can be a grass fire, agricultural burning, industrial heat, or a false positive; a real ' +
  'structural fire can produce no hotspot at all. The official "Fire Incidents" indicator stays ' +
  'NO DATA / PENDING until BFP Iligan City or ICENRO provide confirmed records, regardless of what ' +
  'this satellite layer shows.';
const RESPONSIBLE_OFFICE =
  'None — satellite detection only. BFP Iligan City / ICENRO would confirm any actual incident.';

const WINDOW_DAYS = 7;

// NASA FIRMS' public "area" CSV feeds — no API key required. Each covers
// the whole SouthEast Asia region; this script filters to Iligan as it
// streams. See https://firms.modaps.eosdis.nasa.gov/active_fire/ for the
// full feed catalog if these ever move.
const SOURCES = [
  { label: 'suomi-npp-viirs', url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_7d.csv' },
  { label: 'noaa-20-viirs', url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_7d.csv' },
  { label: 'modis-c6.1', url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_SouthEast_Asia_7d.csv' }
];

function loadReferencePoints() {
  const raw = fs.readFileSync(REFERENCE_POINTS_PATH, 'utf8');
  return JSON.parse(raw).barangays;
}

/**
 * Streams `url`'s response body and calls `onRow(cells)` for each
 * complete CSV line (the header row included, as the first call) as soon
 * as it's available — the full response text is never held in memory at
 * once, only the current chunk plus a small carry-over buffer for a line
 * split across two chunks.
 */
async function streamCsvRows(url, onRow) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NASA FIRMS request failed for ${url}: ${res.status} ${res.statusText}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let carry = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    const lines = carry.split('\n');
    carry = lines.pop(); // last entry may be an incomplete line — hold it for the next chunk
    lines.forEach((line) => { if (line.trim()) onRow(line.trim()); });
  }
  if (carry.trim()) onRow(carry.trim());
}

/**
 * @param {{label:string, url:string}} source
 * @returns {Promise<Array<object>>} raw hotspot objects within Iligan's bounding box
 */
async function fetchAndFilterSource(source) {
  const hotspots = [];
  let header = null;
  await streamCsvRows(source.url, (line) => {
    if (!header) { header = line.split(','); return; }
    const row = parseCsvRow(line, header);
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (!inBoundingBox(lat, lon)) return;
    hotspots.push(toHotspot(row, source.label));
  });
  return hotspots;
}

function buildRecord(hotspot, dateTimeIso) {
  const satellitesText = hotspot.satellites.length > 1
    ? `Detected by ${hotspot.satellites.join(' and ')}.`
    : `Detected by ${hotspot.satellite}.`;
  return {
    date_time: dateTimeIso,
    barangay: hotspot.nearest_barangay,
    latitude: hotspot.latitude,
    longitude: hotspot.longitude,
    indicator: 'fire_hotspot_detection',
    value: hotspot.frp,
    unit: 'MW',
    source: `NASA FIRMS (${hotspot.satellites.join(', ')}) — satellite thermal anomaly detection, not a confirmed fire incident`,
    responsible_office: RESPONSIBLE_OFFICE,
    status: 'reported',
    remarks:
      `${DERIVED_LABEL} ${satellitesText} Confidence: ${hotspot.confidence}. ` +
      `Nearest reference point: ${hotspot.nearest_barangay} (${hotspot.distance_km}km). ` +
      'This is a satellite thermal anomaly, not a confirmed fire incident.'
  };
}

const EXPECTED_TIMELINE_DAYS = WINDOW_DAYS;

/**
 * Refuse to publish a corrupt fetch. Zero hotspots is a valid, expected
 * outcome ("no thermal anomalies detected in the last 7 days") and is
 * NOT a validation failure — only structural problems are.
 */
function validateOutput(output) {
  const problems = [];

  if (!Array.isArray(output.hotspots)) problems.push('hotspots is not an array');
  if (!Array.isArray(output.by_day) || output.by_day.length !== EXPECTED_TIMELINE_DAYS) {
    problems.push(`by_day should have ${EXPECTED_TIMELINE_DAYS} entries, got ${Array.isArray(output.by_day) ? output.by_day.length : 'none'}`);
  }
  if (output.by_day) {
    output.by_day.forEach((d) => {
      if (!Number.isInteger(d.count) || d.count < 0) problems.push(`by_day ${d.date}: invalid count ${d.count}`);
    });
  }

  (output.hotspots || []).forEach((h, i) => {
    ['latitude', 'longitude', 'frp', 'distance_km'].forEach((field) => {
      if (typeof h[field] !== 'number' || !Number.isFinite(h[field])) {
        problems.push(`hotspot[${i}]: invalid ${field} ${h[field]}`);
      }
    });
    if (!h.nearest_barangay) problems.push(`hotspot[${i}]: missing nearest_barangay`);
    if (!Array.isArray(h.satellites) || h.satellites.length === 0) problems.push(`hotspot[${i}]: missing satellites`);
  });

  if (output.records.length !== (output.hotspots || []).length) {
    problems.push(`expected ${output.hotspots.length} records (one per hotspot), got ${output.records.length}`);
  }

  return problems;
}

async function main() {
  const referencePoints = loadReferencePoints();

  const perSource = await Promise.all(SOURCES.map(fetchAndFilterSource));
  const rawHotspots = perSource.flat();
  const deduped = dedupeHotspots(rawHotspots);

  const hotspots = deduped.map((h) => {
    const dateTimeIso = toUtcIso(h.acq_date, h.acq_time);
    const nearest = nearestBarangay(h.latitude, h.longitude, referencePoints);
    return {
      date_time: dateTimeIso,
      latitude: h.latitude,
      longitude: h.longitude,
      confidence: h.confidence,
      frp: h.frp,
      satellite: h.satellite,
      satellites: h.satellites,
      nearest_barangay: nearest.name,
      distance_km: nearest.distance_km
    };
  }).sort((a, b) => new Date(b.date_time) - new Date(a.date_time));

  const records = hotspots.map((h) => buildRecord(h, h.date_time));
  const byDay = buildDailyTimeline(hotspots, WINDOW_DAYS, new Date());

  const output = {
    generated_at: new Date().toISOString(),
    indicator: 'fire_hotspots',
    label: DERIVED_LABEL,
    schema: 'schema/record.schema.json',
    disclaimer: DISCLAIMER,
    window_days: WINDOW_DAYS,
    bounding_box: { lat_min: 8.05, lat_max: 8.40, lon_min: 124.15, lon_max: 124.62 },
    count_7day: hotspots.length,
    by_day: byDay,
    sources: SOURCES.map((s) => s.label),
    records,
    hotspots
  };

  const problems = validateOutput(output);
  if (problems.length) {
    throw new Error(
      `Refusing to write ${path.relative(process.cwd(), OUTPUT_PATH)} — this fetch produced ${problems.length} problem(s); ` +
      `the existing file is left untouched:\n` + problems.map((p) => ' - ' + p).join('\n')
    );
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${hotspots.length} fire hotspot(s) (last ${WINDOW_DAYS} days) to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { streamCsvRows, fetchAndFilterSource, buildRecord, validateOutput, SOURCES };
