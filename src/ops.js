'use strict';

import {
  BAND_ORDER, ROW_CLASS,
  bandVarColor, bandBadge, tweenNumber,
  manilaHourLabel, formatManilaFull, nowHourIndex,
  competitionRanks, loadDashboardData, loadRainfallData, scrubbedView,
  pillarIndicators
} from './js/data.js';
import {
  ensureAnnotationPluginRegistered, sparklineSvg,
  buildCurveChart, updateCurvePlayhead, buildRankedChart, buildElevationChart, buildDistributionChart
} from './js/charts.js';
import { applyMapTileTheme, createBaseMap, createMarkers, updateMarkerBands, highlightMarker, renderMapLegend } from './js/map.js';
import { initDrawer, openDrawer, openFromHash } from './js/drawer.js';
import { initScrubber } from './js/scrubber.js';
import { initThemeToggle, initFreshnessChip, initPeakChip, setFooterUpdated, renderNav } from './js/chrome.js';

let lastData = null;
let referenceByName = {};
let citySeries = null;
let map = null;
let markersByName = {};
let rankMode = 'current';
// Rainfall is daily, not hourly — loaded independently of the scrubbed
// heat data and merged into the table by barangay name. Empty until (or
// unless) rainfall-latest.json loads; the table shows "NO DATA" per row
// until then rather than blocking on it.
let rainfallByName = {};
const chartInstances = {};

function destroyChart(key) {
  if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
}

// ---------------------------------------------------------------------
// ESG scorecard — the E/S/G tiles' pending-lists and live/pending border
// come entirely from MVP_INDICATORS (data.js) via pillarIndicators, not
// hardcoded here. Doesn't depend on the scrubbed view, so it renders once
// at boot rather than on every hourchange.
// ---------------------------------------------------------------------
function renderScorecardCompleteness() {
  ['E', 'S', 'G'].forEach((pillar) => {
    const items = pillarIndicators(pillar);
    const anyLive = items.some((i) => i.live);
    const key = pillar.toLowerCase();

    document.getElementById('tile-' + key).classList.toggle('tile-pending', !anyLive);

    // heat_index's live value has its own dedicated #e-metric/#e-detail
    // slot (see renderScorecard) — the S/G tiles have no such per-item
    // slot, so they just get a compact "N of M live" summary instead of
    // the static "NO DATA / PENDING" tag once at least one item is live.
    if (pillar !== 'E') {
      const metricEl = document.getElementById(key + '-metric');
      const liveCount = items.filter((i) => i.live).length;
      metricEl.innerHTML = anyLive
        ? '<span class="live-pill">' + liveCount + ' OF ' + items.length + ' LIVE</span>'
        : '<span class="pending-tag">NO DATA / PENDING</span>';
    }

    const list = document.getElementById('pending-list-' + key);
    list.innerHTML = items.filter((i) => !i.live).map((item) =>
      '<li>' + item.label + ' — <span class="pending-tag">NO DATA / PENDING</span><br>' +
      '<span class="owner">owning office: ' + item.office + '</span></li>'
    ).join('');
  });
}

function renderScorecard(view) {
  const barangays = view.barangays;
  const hottest = barangays.reduce((a, b) => (b.current.value > a.current.value ? b : a));
  const coolest = barangays.reduce((a, b) => (b.current.value < a.current.value ? b : a));
  const bandCounts = {};
  barangays.forEach((b) => { bandCounts[b.current.band] = (bandCounts[b.current.band] || 0) + 1; });

  tweenNumber(document.getElementById('e-metric'), hottest.current.value, { suffix: '°C' });
  const parts = BAND_ORDER.filter((b) => bandCounts[b]).map((b) => bandCounts[b] + ' ' + b);
  document.getElementById('e-detail').textContent =
    'Heat index, ' + barangays.length + ' of 44 barangays reporting — ' + parts.join(', ') +
    '. Range ' + coolest.current.value.toFixed(1) + '–' + hottest.current.value.toFixed(1) + '°C.';
}

// ---------------------------------------------------------------------
// Hero — all tied leaders, never a single arbitrary winner
// ---------------------------------------------------------------------
function renderHero(view) {
  const barangays = view.barangays;
  const maxValue = Math.max(...barangays.map((b) => b.current.value));
  const leaders = barangays.filter((b) => b.current.value === maxValue);

  document.getElementById('hero-names').textContent = leaders.map((b) => b.name).join(', ');
  document.getElementById('hero-count-suffix').textContent = leaders.length > 1 ? ' (' + leaders.length + ' tied)' : '';
  tweenNumber(document.getElementById('hero-value'), maxValue, { suffix: '°C' });
  const bandEl = document.getElementById('hero-band');
  bandEl.innerHTML = '';
  bandEl.appendChild(bandBadge(leaders[0].current.band));
  document.getElementById('hero-time').textContent = formatManilaFull(new Date(leaders[0].current.date_time));
}

// ---------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------
const tableSortState = { key: 'current', dir: 'desc' };

function renderTable(view) {
  const barangays = view.barangays;
  const rankOf = competitionRanks(barangays);

  function draw() {
    const rows = barangays.slice();
    rows.sort((a, b) => {
      const dir = tableSortState.dir === 'asc' ? 1 : -1;
      if (tableSortState.key === 'name') return a.name.localeCompare(b.name) * dir;
      if (tableSortState.key === 'peak') return (a.today_peak.value - b.today_peak.value) * dir;
      if (tableSortState.key === 'rain7') {
        const ra = rainfallByName[a.name], rb = rainfallByName[b.name];
        return ((ra ? ra.rainfall_7day_mm : -1) - (rb ? rb.rainfall_7day_mm : -1)) * dir;
      }
      if (tableSortState.key === 'dryStreak') {
        const ra = rainfallByName[a.name], rb = rainfallByName[b.name];
        return ((ra ? ra.consecutive_dry_days : -1) - (rb ? rb.consecutive_dry_days : -1)) * dir;
      }
      return (a.current.value - b.current.value) * dir;
    });

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    rows.forEach((b) => {
      const tr = document.createElement('tr');
      tr.className = ROW_CLASS[b.current.band] || '';
      tr.setAttribute('data-barangay', b.name);
      tr.tabIndex = 0;

      const tdRank = document.createElement('td');
      tdRank.className = 'rank-cell';
      tdRank.textContent = '#' + rankOf[b.name];
      tr.appendChild(tdRank);

      const tdName = document.createElement('td');
      tdName.textContent = b.name;
      tr.appendChild(tdName);

      const tdCurrent = document.createElement('td');
      tdCurrent.className = 'value-cell';
      tdCurrent.textContent = b.current.value.toFixed(1);
      tr.appendChild(tdCurrent);

      const tdBand = document.createElement('td');
      tdBand.appendChild(bandBadge(b.current.band));
      tr.appendChild(tdBand);

      const tdPeak = document.createElement('td');
      tdPeak.className = 'value-cell';
      tdPeak.textContent = b.today_peak.value.toFixed(1);
      tr.appendChild(tdPeak);

      const tdPeakTime = document.createElement('td');
      tdPeakTime.className = 'peak-time-cell';
      tdPeakTime.textContent = manilaHourLabel(b.today_peak.date_time);
      tr.appendChild(tdPeakTime);

      const tdSpark = document.createElement('td');
      tdSpark.innerHTML = sparklineSvg(b.hourly, b.today_peak.date_time);
      tr.appendChild(tdSpark);

      const rainfall = rainfallByName[b.name];
      const tdRain7 = document.createElement('td');
      tdRain7.className = 'value-cell';
      tdRain7.textContent = rainfall ? rainfall.rainfall_7day_mm.toFixed(1) : 'NO DATA';
      tr.appendChild(tdRain7);

      const tdDryStreak = document.createElement('td');
      tdDryStreak.className = 'value-cell';
      tdDryStreak.textContent = rainfall ? rainfall.consecutive_dry_days : 'NO DATA';
      tr.appendChild(tdDryStreak);

      tr.addEventListener('click', () => openDrawer(b.name));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(b.name); } });
      tr.addEventListener('mouseenter', () => highlightMarker(markersByName, b.name, true));
      tr.addEventListener('mouseleave', () => highlightMarker(markersByName, b.name, false));

      tbody.appendChild(tr);
    });
  }

  draw();
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    function activate() {
      const key = th.getAttribute('data-sort');
      if (tableSortState.key === key) {
        tableSortState.dir = tableSortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        tableSortState.key = key;
        tableSortState.dir = key === 'name' ? 'asc' : 'desc';
      }
      draw();
    }
    th.onclick = activate;
    th.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } };
  });
}

function highlightRow(name, on) {
  const row = document.querySelector('tr[data-barangay="' + CSS.escape(name) + '"]');
  if (row) row.classList.toggle('is-highlighted', on);
}

// ---------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------
function renderAllCharts(view) {
  destroyChart('curve');
  chartInstances.curve = buildCurveChart('chart-curve', citySeries, currentScrubIndex);

  destroyChart('ranked');
  const basisKey = rankMode === 'peak' ? 'today_peak' : 'current';
  const top = view.barangays.slice().sort((a, b) => b[basisKey].value - a[basisKey].value).slice(0, 15);
  chartInstances.ranked = buildRankedChart('chart-ranked', top, basisKey, (name) => openDrawer(name));

  destroyChart('elevation');
  const barangays = view.barangays;
  const maxElev = barangays.reduce((a, b) => (b.elevation_m > a.elevation_m ? b : a));
  const maxCurrent = Math.max(...barangays.map((b) => b.current.value));
  const hottestLowland = barangays.filter((b) => b.current.value === maxCurrent).reduce((a, b) => (b.elevation_m < a.elevation_m ? b : a));
  const labelPoints = maxElev.name === hottestLowland.name ? [maxElev] : [maxElev, hottestLowland];
  chartInstances.elevation = buildElevationChart('chart-elevation', barangays, (name) => openDrawer(name), labelPoints);

  destroyChart('distribution');
  chartInstances.distribution = buildDistributionChart('chart-distribution', view.barangays, BAND_ORDER);
}

function initRankModeToggle() {
  document.querySelectorAll('.segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.segmented-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      rankMode = btn.getAttribute('data-rank-mode');
      renderAllCharts(currentView());
    });
  });
}

// ---------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------
function initMap(data) {
  const points = data.barangays.map((b) => [b.latitude, b.longitude]);
  map = createBaseMap('map', points, { padding: [16, 16] });
  markersByName = createMarkers(map, data.barangays, referenceByName, {
    onClick: (name) => openDrawer(name),
    onHover: (name, on) => highlightRow(name, on)
  });
  renderMapLegend('map-legend', BAND_ORDER);
}

// ---------------------------------------------------------------------
// Scrubber-driven state
// ---------------------------------------------------------------------
let currentScrubIndex = 0;

function currentView() {
  return scrubbedView(lastData, currentScrubIndex);
}

function updateScrubReadoutHeader() {
  const thNow = document.getElementById('th-now');
  const isNow = currentScrubIndex === nowHourIndex(lastData.barangays[0].hourly.length);
  thNow.firstChild.textContent = isNow ? 'Now (°C) ' : manilaHourLabel(lastData.barangays[0].hourly[currentScrubIndex].date_time) + ' (°C) ';
}

function updateViewingBanner() {
  const banner = document.getElementById('viewing-banner');
  const nowIdx = nowHourIndex(lastData.barangays[0].hourly.length);
  const isNow = currentScrubIndex === nowIdx;
  banner.hidden = isNow;
  if (!isNow) {
    const timeLabel = manilaHourLabel(lastData.barangays[0].hourly[currentScrubIndex].date_time);
    document.getElementById('viewing-banner-text').textContent = 'VIEWING ' + timeLabel + ' — NOT CURRENT';
  }
}

function onHourChange(index) {
  currentScrubIndex = index;
  const view = currentView();
  renderScorecard(view);
  renderHero(view);
  renderTable(view);
  renderAllCharts(view);
  updateMarkerBands(markersByName, view.barangays, referenceByName);
  updateCurvePlayhead(chartInstances.curve, currentScrubIndex);
  updateViewingBanner();
  updateScrubReadoutHeader();
}

// ---------------------------------------------------------------------
// Entrance choreography
// ---------------------------------------------------------------------
function runEntranceAnimation() {
  const groups = {};
  document.querySelectorAll('.stagger').forEach((el) => {
    el.classList.add('will-enter');
    const g = el.getAttribute('data-stagger') || '0';
    (groups[g] = groups[g] || []).push(el);
  });
  Object.keys(groups).sort((a, b) => a - b).forEach((g, i) => {
    setTimeout(() => { groups[g].forEach((el) => el.classList.add('is-in')); }, i * 80);
  });
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
renderNav('site-nav', 'ops');
renderScorecardCompleteness();
ensureAnnotationPluginRegistered();

initThemeToggle('theme-toggle', 'theme-toggle-label', () => {
  renderAllCharts(currentView());
  applyMapTileTheme('map');
});

window.addEventListener('hourchange', (e) => onHourChange(e.detail.index));

// Loads independently of the heat data — a late or failed rainfall fetch
// never blocks the heat table; it just re-renders the table once (or if)
// rainfall-latest.json resolves, filling in the two rainfall columns.
loadRainfallData()
  .then((rainfallData) => {
    rainfallByName = {};
    rainfallData.barangays.forEach((b) => { rainfallByName[b.name] = b; });
    if (lastData) renderTable(currentView());
  })
  .catch(() => { /* table already shows NO DATA for these columns */ });

loadDashboardData()
  .then((result) => {
    lastData = result.data;
    referenceByName = result.referenceByName;
    citySeries = result.citySeries;
    currentScrubIndex = nowHourIndex(lastData.barangays[0].hourly.length);

    initFreshnessChip('freshness-chip', lastData.generated_at);
    initPeakChip('peak-chip', citySeries);

    const view = currentView();
    renderScorecard(view);
    renderHero(view);
    renderTable(view);
    renderAllCharts(view);
    initRankModeToggle();
    initDrawer(lastData, result.referenceData);
    updateViewingBanner();

    setFooterUpdated('footer-updated', lastData.generated_at);

    document.getElementById('load-state').hidden = true;
    document.getElementById('app').hidden = false;

    // See map.js's createBaseMap doc comment: must run after #app is
    // visible, or fitBounds computes against a zero-size container.
    initMap(lastData);
    initScrubber(lastData.barangays[0].hourly);
    updateScrubReadoutHeader();
    runEntranceAnimation();
    openFromHash();
  })
  .catch((err) => {
    const el = document.getElementById('load-state');
    el.textContent = 'Could not load dashboard data (' + err.message + '). Run scripts/fetch/fetch-heat-index.js, then reload.';
    el.className = 'load-state error';
  });
