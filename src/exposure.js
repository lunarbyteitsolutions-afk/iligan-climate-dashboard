'use strict';

import {
  BAND_ORDER, bandVarColor, bandBadge, manilaHourLabel, nowHourIndex,
  loadDashboardData, loadPopulationData, computeExposureByBand, scrubbedView
} from './js/data.js';
import { initThemeToggle, initFreshnessChip, setFooterUpdated, renderNav, initScrollReveal, renderDisclosureCopy } from './js/chrome.js';
import { initScrubber } from './js/scrubber.js';

let lastData = null;
let populationData = null;
let citySeries = null;
let currentScrubIndex = 0;

// ---------------------------------------------------------------------
// Population-by-band split — one row per band, a bar scaled to that
// band's share of the (disputed, see the caveat block) population total.
// ---------------------------------------------------------------------
function renderBandSplit(containerId, exposure) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const total = exposure.totalPopulation;

  BAND_ORDER.forEach((band) => {
    const pop = exposure.byBand[band] || 0;
    const pct = total ? (pop / total) * 100 : 0;

    const row = document.createElement('div');
    row.className = 'exposure-band-row';

    const label = document.createElement('div');
    label.appendChild(bandBadge(band));
    row.appendChild(label);

    const track = document.createElement('div');
    track.className = 'exposure-band-bar-track';
    const fill = document.createElement('div');
    fill.className = 'exposure-band-bar-fill';
    fill.style.width = pct + '%';
    fill.style.background = bandVarColor(band);
    track.appendChild(fill);
    row.appendChild(track);

    const value = document.createElement('div');
    value.className = 'exposure-band-value';
    value.textContent = pop.toLocaleString('en-US') + ' (' + pct.toFixed(0) + '%)';
    row.appendChild(value);

    container.appendChild(row);
  });
}

/**
 * The one headline claim: which band holds the most people right now.
 * "In these conditions" phrasing only — never "affected" or a health
 * outcome (see the caveat block and CLAUDE.md).
 */
function renderSentence(exposure) {
  const dominant = BAND_ORDER.slice().sort((a, b) => exposure.byBand[b] - exposure.byBand[a])[0];
  const pop = exposure.byBand[dominant];
  const total = exposure.totalPopulation;
  const pct = total ? Math.round((pop / total) * 100) : 0;
  document.getElementById('exposure-sentence').innerHTML =
    '<strong>' + pop.toLocaleString('en-US') + ' of ' + total.toLocaleString('en-US') + '</strong> Iliganons' +
    (pct ? ' (' + pct + '%)' : '') + ' are in <strong>' + dominant + '</strong> heat conditions right now.';
}

function renderPeakSubtitle() {
  const peakValue = citySeries.maxSeries[citySeries.peakIndex];
  const peakTimeLabel = manilaHourLabel(citySeries.hourly[citySeries.peakIndex].date_time);
  const peakDate = new Date(citySeries.hourly[citySeries.peakIndex].date_time);
  const passed = peakDate.getTime() <= Date.now();
  document.getElementById('peak-subtitle').textContent =
    (passed ? 'Peak passed ' : 'Peak expected ') + peakTimeLabel + ' PHT · ' + peakValue.toFixed(1) + '°C city maximum.';
}

// ---------------------------------------------------------------------
// Scrubber-driven recompute
// ---------------------------------------------------------------------
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
  const view = scrubbedView(lastData, currentScrubIndex);
  const exposure = computeExposureByBand(view.barangays, populationData);
  renderSentence(exposure);
  renderBandSplit('exposure-bands-current', exposure);
  updateViewingBanner();
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
renderNav('site-nav', 'exposure');
renderDisclosureCopy();
initThemeToggle('theme-toggle', 'theme-toggle-label', () => {});

window.addEventListener('hourchange', (e) => onHourChange(e.detail.index));

Promise.all([loadDashboardData(), loadPopulationData()])
  .then(([result, popData]) => {
    lastData = result.data;
    citySeries = result.citySeries;
    populationData = popData;
    currentScrubIndex = nowHourIndex(lastData.barangays[0].hourly.length);

    initFreshnessChip('freshness-chip', lastData.generated_at);

    const currentExposure = computeExposureByBand(lastData.barangays, populationData);
    renderSentence(currentExposure);
    renderBandSplit('exposure-bands-current', currentExposure);

    const peakView = scrubbedView(lastData, citySeries.peakIndex);
    const peakExposure = computeExposureByBand(peakView.barangays, populationData);
    renderPeakSubtitle();
    renderBandSplit('exposure-bands-peak', peakExposure);

    setFooterUpdated('footer-updated', lastData.generated_at);

    document.getElementById('load-state').hidden = true;
    document.getElementById('app').hidden = false;

    initScrubber(lastData.barangays[0].hourly);
    updateViewingBanner();
    initScrollReveal(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  })
  .catch((err) => {
    const el = document.getElementById('load-state');
    el.textContent = 'Could not load population exposure data (' + err.message + '). Run scripts/fetch/fetch-heat-index.js, then reload.';
    el.className = 'load-state error';
  });
