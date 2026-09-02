'use strict';

/**
 * Pure fire-hotspot math and parsing — no network, no filesystem. See
 * fetch-fire-hotspots.js for the NASA FIRMS streaming fetch and file
 * writing.
 *
 * These are satellite thermal anomaly detections (NASA FIRMS), NOT
 * confirmed fire incidents — see CLAUDE.md and fire.html. A hotspot can be
 * a grass fire, agricultural burning, industrial heat, or a false
 * positive; a real structural fire can produce no hotspot at all. Never
 * call a hotspot a "fire" in status/labels — status is "reported"
 * (detected), never "verified".
 */

// Iligan City and immediate surroundings. Loose enough to catch hotspots
// just outside the city boundary (useful context) without pulling in all
// of Mindanao.
const ILIGAN_BBOX = { latMin: 8.05, latMax: 8.40, lonMin: 124.15, lonMax: 124.62 };

function inBoundingBox(lat, lon) {
  return (
    lat >= ILIGAN_BBOX.latMin && lat <= ILIGAN_BBOX.latMax &&
    lon >= ILIGAN_BBOX.lonMin && lon <= ILIGAN_BBOX.lonMax
  );
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two lat/lon points, in kilometres. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {Array<{name:string, latitude:number, longitude:number}>} referencePoints
 * @returns {{name:string, distance_km:number}}
 */
function nearestBarangay(lat, lon, referencePoints) {
  let best = null;
  let bestDist = Infinity;
  referencePoints.forEach((p) => {
    const d = haversineKm(lat, lon, p.latitude, p.longitude);
    if (d < bestDist) { bestDist = d; best = p; }
  });
  return { name: best.name, distance_km: Number(bestDist.toFixed(2)) };
}

/**
 * Splits one CSV line into an object keyed by the header row. NASA FIRMS'
 * CSVs are plain unquoted comma-separated values (no embedded commas or
 * quoted fields in any column this project reads), so a plain split is
 * safe here.
 * @param {string} line
 * @param {string[]} header
 */
function parseCsvRow(line, header) {
  const cells = line.split(',');
  const row = {};
  header.forEach((key, i) => { row[key] = cells[i]; });
  return row;
}

/**
 * Rows with the fields this project keeps, from a raw FIRMS CSV row plus
 * which dataset it came from.
 */
function toHotspot(row, datasetLabel) {
  return {
    acq_date: row.acq_date,
    acq_time: row.acq_time,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    confidence: row.confidence,
    frp: Number(row.frp),
    satellite: datasetLabel
  };
}

const DEDUPE_DISTANCE_KM = 0.5;

/**
 * Collapses hotspots detected by more than one satellite for the same
 * event: same acq_date AND acq_time (FIRMS reports acq_time to the
 * minute; two datasets reporting the identical minute this close
 * together are almost certainly the same overpass window catching the
 * same thermal anomaly), within DEDUPE_DISTANCE_KM of each other. The
 * kept record lists every contributing satellite; lat/lon/frp/confidence
 * come from whichever reading has the highest FRP (the most confident
 * physical read of the anomaly).
 * @param {Array<ReturnType<typeof toHotspot>>} hotspots
 */
function dedupeHotspots(hotspots) {
  const groups = [];
  hotspots.forEach((h) => {
    const group = groups.find((g) =>
      g[0].acq_date === h.acq_date &&
      g[0].acq_time === h.acq_time &&
      haversineKm(g[0].latitude, g[0].longitude, h.latitude, h.longitude) <= DEDUPE_DISTANCE_KM
    );
    if (group) group.push(h);
    else groups.push([h]);
  });

  return groups.map((group) => {
    const primary = group.slice().sort((a, b) => b.frp - a.frp)[0];
    const satellites = Array.from(new Set(group.map((h) => h.satellite)));
    return Object.assign({}, primary, { satellite: satellites[0], satellites });
  });
}

/**
 * FIRMS reports acq_date/acq_time in UTC, acq_time as a zero-padded HHMM
 * string (e.g. "0438" = 04:38 UTC, sometimes without leading zeros
 * trimmed already present in the source).
 */
function toUtcIso(acqDate, acqTime) {
  const padded = String(acqTime).padStart(4, '0');
  const hh = padded.slice(0, 2);
  const mm = padded.slice(2, 4);
  return new Date(`${acqDate}T${hh}:${mm}:00Z`).toISOString();
}

/** UTC+8, no DST — same conversion basis as scripts/fetch/fetch-heat-index.js. */
function utcIsoToManilaDateString(utcIso) {
  const manilaMs = new Date(utcIso).getTime() + 8 * 3600000;
  return new Date(manilaMs).toISOString().slice(0, 10);
}

/**
 * Zero-filled count-per-day for the trailing `days` Manila calendar dates
 * ending today, oldest first. A day with no hotspots is a real 0, not a
 * missing entry — "no thermal anomalies detected" is a valid answer.
 * @param {Array<{date_time:string}>} hotspots
 * @param {number} days
 * @param {Date} now
 */
function buildDailyTimeline(hotspots, days, now) {
  const todayManila = utcIsoToManilaDateString(now.toISOString());
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(new Date(todayManila + 'T00:00:00Z').getTime() - i * 86400000);
    dates.push(d.toISOString().slice(0, 10));
  }
  const counts = {};
  dates.forEach((d) => { counts[d] = 0; });
  hotspots.forEach((h) => {
    const d = utcIsoToManilaDateString(h.date_time);
    if (counts[d] !== undefined) counts[d]++;
  });
  return dates.map((date) => ({ date, count: counts[date] }));
}

module.exports = {
  ILIGAN_BBOX,
  inBoundingBox,
  haversineKm,
  nearestBarangay,
  parseCsvRow,
  toHotspot,
  dedupeHotspots,
  toUtcIso,
  utcIsoToManilaDateString,
  buildDailyTimeline
};
