'use strict';

import {
  BAND_ORDER, ROW_CLASS,
  bandVarColor, bandBadge, tweenNumber,
  manilaHourLabel, formatManilaFull, nowHourIndex,
  competitionRanks, loadDashboardData, scrubbedView
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
const chartInstances = {};

function destroyChart(key) {
  if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
}

// ---------------------------------------------------------------------
// ESG scorecard (E metric is real; S/G pending content is static markup)
// ---------------------------------------------------------------------
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
ensureAnnotationPluginRegistered();

initThemeToggle('theme-toggle', 'theme-toggle-label', () => {
  renderAllCharts(currentView());
  applyMapTileTheme('map');
});

window.addEventListener('hourchange', (e) => onHourChange(e.detail.index));

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
