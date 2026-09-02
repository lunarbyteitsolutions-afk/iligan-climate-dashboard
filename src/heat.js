'use strict';

import {
  BAND_ORDER, bandVarColor, bandBadge, buildTiers, loadDashboardData, scrubbedView
} from './js/data.js';
import { ensureAnnotationPluginRegistered, sparklineSvg, buildElevationChart } from './js/charts.js';
import { applyMapTileTheme, createBaseMap, createMarkers, updateMarkerBands, renderMapLegend } from './js/map.js';
import { initDrawer, openDrawer, openFromHash } from './js/drawer.js';
import { initScrubber } from './js/scrubber.js';
import { initThemeToggle, initFreshnessChip, setFooterUpdated, renderNav } from './js/chrome.js';

let lastData = null;
let referenceByName = {};
let map = null;
let markersByName = {};

// ---------------------------------------------------------------------
// Heat tier cards
// ---------------------------------------------------------------------
const CHIP_COLLAPSE_THRESHOLD = 6;

function renderTierChips(container, barangays) {
  container.innerHTML = '';
  const collapse = barangays.length > CHIP_COLLAPSE_THRESHOLD;
  const visible = collapse ? barangays.slice(0, CHIP_COLLAPSE_THRESHOLD) : barangays;
  const hidden = collapse ? barangays.slice(CHIP_COLLAPSE_THRESHOLD) : [];

  function makeChip(b) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tier-chip';
    chip.textContent = b.name;
    chip.addEventListener('click', (e) => { e.stopPropagation(); openDrawer(b.name); });
    return chip;
  }

  visible.forEach((b) => container.appendChild(makeChip(b)));

  if (hidden.length) {
    const hiddenWrap = document.createElement('span');
    hiddenWrap.hidden = true;
    hidden.forEach((b) => hiddenWrap.appendChild(makeChip(b)));

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'tier-chip-more';
    moreBtn.textContent = 'Show all ' + barangays.length;
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hiddenWrap.hidden = false;
      Array.from(hiddenWrap.children).forEach((chip) => container.insertBefore(chip, moreBtn));
      moreBtn.remove();
    });
    container.appendChild(hiddenWrap);
    container.appendChild(moreBtn);
  }
}

function renderHeatTiers(data) {
  const tiers = buildTiers(data.barangays).slice(0, 5);
  const maxCount = Math.max(...tiers.map((t) => t.barangays.length));

  const wrap = document.getElementById('tier-cards');
  wrap.innerHTML = '';
  tiers.forEach((tier) => {
    const count = tier.barangays.length;
    const rep = tier.barangays[0];

    const card = document.createElement('article');
    card.className = 'tier-card';
    card.style.setProperty('--card-band', bandVarColor(tier.band));

    card.innerHTML =
      '<div class="tier-card-value">' + tier.value.toFixed(1) + '°C</div>' +
      '<div class="tier-card-count">' + count + (count === 1 ? ' barangay' : ' barangays') + '</div>' +
      '<div class="tier-count-bar"><div class="tier-count-bar-fill" style="width:' + Math.round((count / maxCount) * 100) + '%"></div></div>' +
      '<div class="tier-card-spark">' + sparklineSvg(rep.hourly, rep.today_peak.date_time, { width: 180, height: 36 }) + '</div>';

    const bandSlot = document.createElement('span');
    bandSlot.appendChild(bandBadge(tier.band));
    card.appendChild(bandSlot);

    const chips = document.createElement('div');
    chips.className = 'tier-chips';
    card.appendChild(chips);
    renderTierChips(chips, tier.barangays);

    wrap.appendChild(card);
  });
}

// ---------------------------------------------------------------------
// Map (glowing, gently pulsing points; scrubber scoped to the map only)
// ---------------------------------------------------------------------
function initMap(data) {
  const points = data.barangays.map((b) => [b.latitude, b.longitude]);
  map = createBaseMap('public-map', points, { padding: [24, 24] });
  markersByName = createMarkers(map, data.barangays, referenceByName, {
    glow: true,
    onClick: (name) => openDrawer(name)
  });
  renderMapLegend('map-legend', BAND_ORDER);
}

function updateMapForScrub(index) {
  const view = scrubbedView(lastData, index);
  updateMarkerBands(markersByName, view.barangays, referenceByName);
}

// ---------------------------------------------------------------------
// Elevation story
// ---------------------------------------------------------------------
function renderElevationSentence(data) {
  const barangays = data.barangays;
  const maxValue = Math.max(...barangays.map((b) => b.current.value));
  const hottestLeaders = barangays.filter((b) => b.current.value === maxValue);
  const hotBarangay = hottestLeaders.reduce((a, b) => (b.elevation_m < a.elevation_m ? b : a));
  const coolestElevationBarangay = barangays.reduce((a, b) => (b.elevation_m > a.elevation_m ? b : a));
  const diff = Math.round(hotBarangay.current.value - coolestElevationBarangay.current.value);
  const lowPhrase = hotBarangay.elevation_m <= 5 ? 'at sea level' : ('near ' + hotBarangay.elevation_m + 'm elevation');

  document.getElementById('elevation-sentence').textContent =
    'Iligan’s heat risk sits on the coast. Barangays ' + lowPhrase + ' today run about ' + diff +
    '°C hotter than ' + coolestElevationBarangay.name + ' at ' + coolestElevationBarangay.elevation_m + ' metres.';
}

// ---------------------------------------------------------------------
// Scroll reveal
// ---------------------------------------------------------------------
function initScrollReveal(reduceMotion) {
  if (reduceMotion || !window.IntersectionObserver) return;
  const sections = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.15 });
  sections.forEach((el) => { el.classList.add('will-reveal'); io.observe(el); });
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
renderNav('site-nav', 'heat');
ensureAnnotationPluginRegistered();

initThemeToggle('theme-toggle', 'theme-toggle-label', () => applyMapTileTheme('public-map'));

window.addEventListener('hourchange', (e) => updateMapForScrub(e.detail.index));

loadDashboardData()
  .then((result) => {
    lastData = result.data;
    referenceByName = result.referenceByName;

    initFreshnessChip('freshness-chip', lastData.generated_at);
    renderHeatTiers(lastData);
    renderElevationSentence(lastData);
    setFooterUpdated('footer-updated', lastData.generated_at);

    initDrawer(lastData, result.referenceData);

    document.getElementById('load-state').hidden = true;
    document.getElementById('app').hidden = false;

    // See map.js's createBaseMap doc comment: must run after #app is
    // visible, or fitBounds computes against a zero-size container.
    initMap(lastData);
    buildElevationChart('chart-elevation', lastData.barangays, (name) => openDrawer(name));
    initScrubber(lastData.barangays[0].hourly);
    initScrollReveal(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    openFromHash();
  })
  .catch((err) => {
    const el = document.getElementById('load-state');
    el.textContent = 'Could not load dashboard data (' + err.message + '). Run scripts/fetch/fetch-heat-index.js, then reload.';
    el.className = 'load-state error';
  });
