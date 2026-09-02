'use strict';

/**
 * Single source of truth for: band thresholds, band colors/classes, Manila
 * time handling, number/tween formatting, staleness, competition ranking,
 * and loading/normalizing the data files.
 *
 * No page or module computes a heat index, a band, or a formatted date on
 * its own — everything reads from here. A literal band threshold or hex
 * color anywhere outside this file is a bug.
 */

export const STALE_HOURS = 3;

// Same NWS/Rothfusz band boundaries as scripts/fetch/heat-index.js's
// band() function, expressed in Celsius.
export const CAUTION_MIN_C = ((80 - 32) * 5) / 9; // 26.7
export const EXTREME_CAUTION_MIN_C = ((90 - 32) * 5) / 9; // 32.2
export const DANGER_MIN_C = ((105 - 32) * 5) / 9; // 40.6
export const EXTREME_DANGER_MIN_C = ((130 - 32) * 5) / 9; // 54.4

export const BAND_ORDER = ['Caution', 'Extreme Caution', 'Danger', 'Extreme Danger'];

// A day counts as "dry" below this accumulation. Same threshold as
// scripts/fetch/rainfall.js's DRY_DAY_THRESHOLD_MM — stated wherever a dry
// day count appears in the UI. Never call this "drought" or a "rainfall
// deficit" (needs a climatological normal this project doesn't have); only
// "7-day accumulated rainfall" and "consecutive dry days".
export const DRY_DAY_THRESHOLD_MM = 1.0;

export const BAND_CLASS = {
  'Caution': 'band-caution',
  'Extreme Caution': 'band-extreme-caution',
  'Danger': 'band-danger',
  'Extreme Danger': 'band-extreme-danger'
};

export const ROW_CLASS = {
  'Caution': 'row-caution',
  'Extreme Caution': 'row-extreme-caution',
  'Danger': 'row-danger',
  'Extreme Danger': 'row-extreme-danger'
};

export const PULSE_BANDS = { 'Danger': true, 'Extreme Danger': true };

// Decorative hero gradient wash per band. Not the semantic band ramp
// (that's CSS custom properties, read via bandVarColor) — but still
// band-keyed, so it's defined once here rather than duplicated per page.
export const HERO_BAND_COLORS = {
  'Caution': ['#0f5f52', '#08312b'],
  'Extreme Caution': ['#7a4a00', '#4a0e12'],
  'Danger': ['#7a2600', '#3a0000'],
  'Extreme Danger': ['#5c0010', '#210005']
};

// Shared content for the ESG scorecard/reframe AND the drawer's
// "Data Owed" block — one list so no two views can drift out of sync.
export const PENDING_INDICATORS = {
  E: [
    { label: 'Rainfall', office: 'PAGASA (authoritative); CDRRMO for local rain gauges — pending confirmation with the office' },
    { label: 'Water level / availability', office: 'CDRRMO (river and water-source levels); Iligan City Water District (supply and service interruptions) — pending confirmation with the office' },
    { label: 'Fire incidents', office: 'BFP Iligan City (structural/grass); ICENRO (vegetation/watershed) — pending confirmation with the office' }
  ],
  S: [
    { label: 'Population exposed', office: 'CSWDO' },
    { label: 'Households with water shortage', office: 'City Health' },
    { label: 'Farmers & hectares affected', office: 'City Agriculture' }
  ],
  G: [
    { label: 'Government intervention / response status', office: "City Administrator's Office" }
  ]
};

export function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function bandVarColor(bandName) {
  const key = bandName.toLowerCase().replace(/\s+/g, '-');
  return getCssVar('--band-' + key + '-bg');
}

export function reduceMotionPreferred() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** A <span> badge for a band name — the only place "does this band pulse" is decided. */
export function bandBadge(bandName) {
  const span = document.createElement('span');
  span.className = 'band-badge ' + (BAND_CLASS[bandName] || '') +
    (PULSE_BANDS[bandName] && !reduceMotionPreferred() ? ' is-pulsing' : '');
  span.textContent = bandName;
  return span;
}

// ---------------------------------------------------------------------
// Manila time (Asia/Manila, fixed UTC+8, no DST)
// ---------------------------------------------------------------------
export function formatManilaClock(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

export function formatManilaFull(date) {
  const fmt = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  return fmt.format(date) + ' PHT';
}

export function manilaHourLabel(isoUtc) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(isoUtc));
}

/** Current fractional hour-of-day in Asia/Manila, e.g. 13.75 for 13:45. */
export function manilaNowFraction() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h + m / 60;
}

export function nowHourIndex(hourCount) {
  return Math.round(Math.max(0, Math.min(hourCount - 1, manilaNowFraction())));
}

// ---------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------
export function computeFreshness(generatedAtIso) {
  const generated = new Date(generatedAtIso);
  const ageMs = Date.now() - generated.getTime();
  const ageHours = ageMs / 3600000;
  return { generated, ageMs, ageHours, isStale: ageHours > STALE_HOURS };
}

// ---------------------------------------------------------------------
// Competition ranking — tie-safe. Equal (displayed, rounded) values share
// a rank; the next distinct value's rank is its position, not rank+1.
// ---------------------------------------------------------------------
export function competitionRanks(barangays) {
  const sorted = barangays.slice().sort((a, b) => b.current.value - a.current.value);
  const rankOf = {};
  sorted.forEach((b, i) => {
    if (i === 0) {
      rankOf[b.name] = 1;
    } else {
      const prev = sorted[i - 1];
      rankOf[b.name] = prev.current.value === b.current.value ? rankOf[prev.name] : i + 1;
    }
  });
  return rankOf;
}

/** How many barangays share a given rank (for "TIED #1 (+N more)" copy). */
export function rankCounts(rankOf) {
  const counts = {};
  Object.keys(rankOf).forEach((name) => {
    const r = rankOf[name];
    counts[r] = (counts[r] || 0) + 1;
  });
  return counts;
}

/** Group barangays by their exact current value, hottest tier first. */
export function buildTiers(barangays) {
  const groups = {};
  const order = [];
  barangays.forEach((b) => {
    const key = b.current.value.toFixed(1);
    if (!groups[key]) { groups[key] = { value: b.current.value, band: b.current.band, barangays: [] }; order.push(key); }
    groups[key].barangays.push(b);
  });
  return order.map((k) => groups[k]).sort((a, b) => b.value - a.value);
}

function median(values) {
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * City-wide hourly series (min/max/median), and the peak hour defined by
 * the city MAX (not the median) — a "now" figure is always a city max, so
 * "peak" must be a city max too, or the two don't compare like-for-like.
 */
export function computeCitySeries(data) {
  const barangays = data.barangays;
  const hourly = barangays[0].hourly;
  const labels = hourly.map((h) => manilaHourLabel(h.date_time));
  const minSeries = [], maxSeries = [], medianSeries = [];
  for (let i = 0; i < hourly.length; i++) {
    const valuesAtHour = barangays.map((b) => b.hourly[i].value);
    minSeries.push(Math.min(...valuesAtHour));
    maxSeries.push(Math.max(...valuesAtHour));
    medianSeries.push(Number(median(valuesAtHour).toFixed(1)));
  }
  let peakIndex = 0;
  maxSeries.forEach((v, i) => { if (v > maxSeries[peakIndex]) peakIndex = i; });
  return { hourly, labels, minSeries, maxSeries, medianSeries, peakIndex };
}

/** Swap each barangay's `.current` for its hourly[index] reading. */
export function scrubbedView(data, hourIndex) {
  return {
    barangays: data.barangays.map((b) => {
      const h = b.hourly[hourIndex];
      return Object.assign({}, b, { current: { date_time: h.date_time, value: h.value, band: h.band } });
    })
  };
}

// ---------------------------------------------------------------------
// Population exposed — crosses each barangay's population baseline
// against its current heat band. This is an EXPOSURE ESTIMATE, never a
// count of people harmed: never phrase it as "affected", "at risk of heat
// stroke", or any health outcome — "in these conditions" is the honest
// phrasing. It assumes barangay-wide exposure at the reference point's
// heat index; actual exposure varies with elevation, shade, housing, and
// outdoor work. The population baseline itself is pending PSA
// verification (data/barangays.json's population_dispute). All three
// caveats must stay visible wherever a number from this function is
// shown — see exposure.html.
// ---------------------------------------------------------------------
export function loadPopulationData() {
  return fetch('data/barangays.json').then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' loading barangays.json');
    return res.json();
  });
}

/**
 * @param {Array<{name:string, current:{band:string}}>} barangaysWithCurrent - data.barangays, or scrubbedView(...).barangays for a specific hour
 * @param {object} populationData - the parsed data/barangays.json contents
 * @returns {{byBand: Record<string, number>, totalPopulation: number, unmatchedNames: string[]}}
 */
export function computeExposureByBand(barangaysWithCurrent, populationData) {
  const popByName = {};
  let totalPopulation = 0;
  populationData.barangays.forEach((p) => {
    popByName[p.name] = p.population_2024;
    totalPopulation += p.population_2024;
  });

  const byBand = {};
  BAND_ORDER.forEach((band) => { byBand[band] = 0; });
  const unmatchedNames = [];

  barangaysWithCurrent.forEach((b) => {
    const pop = popByName[b.name];
    if (typeof pop !== 'number') { unmatchedNames.push(b.name); return; }
    byBand[b.current.band] = (byBand[b.current.band] || 0) + pop;
  });

  return { byBand, totalPopulation, unmatchedNames };
}

// ---------------------------------------------------------------------
// Loading — the one place every page fetches from.
// ---------------------------------------------------------------------
export function loadDashboardData() {
  const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  return Promise.all([
    fetch('data/heat-index-latest.json').then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' loading heat-index-latest.json');
      return res.json();
    }),
    fetch('data/barangay_reference_points.json').then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' loading barangay_reference_points.json');
      return res.json();
    }),
    fontsReady
  ]).then(([data, refFile]) => {
    if (!data.barangays || !data.barangays.length) throw new Error('No barangays in heat-index-latest.json');
    const referenceData = refFile.barangays || [];
    const referenceByName = {};
    referenceData.forEach((r) => { referenceByName[r.name] = r; });
    return { data, referenceData, referenceByName, citySeries: computeCitySeries(data) };
  });
}

/** Same shape as loadDashboardData, for rainfall.html/overview.js/ops.js. */
export function loadRainfallData() {
  return fetch('data/rainfall-latest.json').then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' loading rainfall-latest.json');
    return res.json();
  }).then((data) => {
    if (!data.barangays || !data.barangays.length) throw new Error('No barangays in rainfall-latest.json');
    return data;
  });
}

/**
 * For fire.html. Unlike loadRainfallData, an empty `hotspots` array is a
 * valid, expected result ("no thermal anomalies detected") — only a
 * missing/malformed `by_day` (the 7-day timeline, always present even at
 * zero) means the file itself failed to load correctly.
 */
export function loadFireHotspotsData() {
  return fetch('data/fire-hotspots-latest.json').then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' loading fire-hotspots-latest.json');
    return res.json();
  }).then((data) => {
    if (!Array.isArray(data.hotspots) || !Array.isArray(data.by_day)) {
      throw new Error('Malformed fire-hotspots-latest.json');
    }
    return data;
  });
}

// ---------------------------------------------------------------------
// Number tween
// ---------------------------------------------------------------------
/**
 * Animates text content toward `toValue`, guaranteeing the correct final
 * value via a plain timer — heavy synchronous work elsewhere (chart/map
 * creation) can starve requestAnimationFrame well past `duration`, and a
 * slow device or a screenshot must never catch a wrong intermediate number.
 */
export function tweenNumber(el, toValue, opts) {
  opts = opts || {};
  const suffix = opts.suffix || '';
  const decimals = opts.decimals != null ? opts.decimals : 1;
  const duration = reduceMotionPreferred() ? 0 : (opts.duration || 260);
  const fromValue = Number(el.getAttribute('data-value')) || 0;
  el.setAttribute('data-value', toValue);
  const finalText = toValue.toFixed(decimals) + suffix;

  if (!duration) {
    el.textContent = finalText;
    return;
  }
  let settled = false;
  let start = null;
  function step(ts) {
    if (settled) return;
    if (start === null) start = ts;
    const t = Math.min(1, (ts - start) / duration);
    const eased = 1 - Math.pow(1 - t, 2);
    const v = fromValue + (toValue - fromValue) * eased;
    el.textContent = v.toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  setTimeout(() => { settled = true; el.textContent = finalText; }, duration + 120);
}
