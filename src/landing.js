'use strict';

import {
  BAND_ORDER, BAND_CLASS, HERO_BAND_COLORS,
  bandVarColor, bandBadge, tweenNumber,
  manilaHourLabel, reduceMotionPreferred,
  buildTiers, loadDashboardData, scrubbedView
} from './js/data.js';
import { ensureAnnotationPluginRegistered, sparklineSvg, buildElevationChart } from './js/charts.js';
import { applyMapTileTheme, createBaseMap, createMarkers, updateMarkerBands, renderMapLegend } from './js/map.js';
import { initDrawer, openDrawer } from './js/drawer.js';
import { initScrubber, getScrubIndex } from './js/scrubber.js';
import { initThemeToggle, currentTheme, initFreshnessChip, setFooterUpdated, icon } from './js/chrome.js';

let lastData = null;
let referenceByName = {};
let citySeries = null;
let map = null;
let markersByName = {};

// ---------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------
function renderHero(data) {
  const barangays = data.barangays;
  const maxValue = Math.max(...barangays.map((b) => b.current.value));
  const leaders = barangays.filter((b) => b.current.value === maxValue);
  const band = leaders[0].current.band;

  tweenNumber(document.getElementById('hero-number'), maxValue, { suffix: '°C', duration: 900 });

  const pill = document.getElementById('hero-band-pill');
  pill.textContent = band;
  pill.className = 'hero-band-pill ' + (BAND_CLASS[band] || '');

  const colors = HERO_BAND_COLORS[band] || HERO_BAND_COLORS['Caution'];
  document.getElementById('hero-gradient').style.setProperty('--hero-c1', colors[0]);
  document.getElementById('hero-gradient').style.setProperty('--hero-c2', colors[1]);

  const dot = document.getElementById('wordmark-dot');
  dot.className = 'wordmark-dot ' + (BAND_CLASS[band] || '');

  const names = leaders.map((b) => b.name);
  const tieListEl = document.getElementById('hero-tie-list');
  let sentence;
  if (names.length === 1) {
    sentence = names[0] + ' is the city’s hottest barangay right now.';
    tieListEl.style.display = 'none';
  } else {
    sentence = names.length + ' of ' + barangays.length + ' barangays are tied at the city’s hottest right now.';
    tieListEl.style.display = '';
    tieListEl.open = false;
    document.getElementById('hero-tie-summary').textContent = 'See all ' + names.length;
    const chipsWrap = document.getElementById('hero-tie-chips');
    chipsWrap.innerHTML = '';
    leaders.forEach((b) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tier-chip';
      chip.textContent = b.name;
      chip.addEventListener('click', (e) => { e.stopPropagation(); openDrawer(b.name); });
      chipsWrap.appendChild(chip);
    });
  }
  document.getElementById('hero-sentence').textContent = sentence;
}

function tickHeroPeak() {
  const peakDate = new Date(citySeries.hourly[citySeries.peakIndex].date_time);
  // City MAXIMUM at peak hour — compared like-for-like against the hero
  // number above, which is also the city maximum (right now). Comparing
  // a max to a median made it read as "about to cool down" when it wasn't.
  const peakValue = citySeries.maxSeries[citySeries.peakIndex];
  const peakTimeLabel = manilaHourLabel(citySeries.hourly[citySeries.peakIndex].date_time);
  const diffMs = peakDate.getTime() - Date.now();
  const peakEl = document.getElementById('hero-peak');
  const detailEl = document.getElementById('hero-peak-detail');

  if (diffMs <= 0) {
    peakEl.textContent = 'PEAK PASSED ' + peakTimeLabel;
    detailEl.textContent = peakValue.toFixed(1) + '°C city maximum';
    return;
  }
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  peakEl.textContent = 'PEAK IN ' + h + 'H ' + m + 'M';
  detailEl.textContent = peakTimeLabel + ' PHT · ' + peakValue.toFixed(1) + '°C expected (city maximum)';
}

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
// Map (public: glowing, gently pulsing points; scrubber scoped to the map
// only — the hero/cards/story above stay pinned to the true current
// reading so the landing narrative never reads as ambiguous)
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
// Elevation story (Section 4)
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
// ESG reframe (Section 5)
// ---------------------------------------------------------------------
function renderReframe(data) {
  const barangays = data.barangays;
  const hottest = barangays.reduce((a, b) => (b.current.value > a.current.value ? b : a));
  document.getElementById('reframe-e-value').textContent = hottest.current.value.toFixed(1) + '°C';

  document.getElementById('icon-e').innerHTML = icon('environmental');
  document.getElementById('icon-s').innerHTML = icon('social');
  document.getElementById('icon-g').innerHTML = icon('governance');
  document.getElementById('icon-rainfall').innerHTML = icon('rainfall');
  document.getElementById('icon-water').innerHTML = icon('water');
  document.getElementById('icon-fire').innerHTML = icon('fire');
  document.getElementById('icon-social-1').innerHTML = icon('social');
  document.getElementById('icon-health').innerHTML = icon('health');
  document.getElementById('icon-farms').innerHTML = icon('farms');
  document.getElementById('icon-gov').innerHTML = icon('governance');
}

// ---------------------------------------------------------------------
// Viewing banner shared with the map's scrubber (map-only scope, so this
// banner reflects the map/scrubber state, not the hero which stays "now")
// ---------------------------------------------------------------------
function updateScrubUi(index) {
  updateMapForScrub(index);
}

// ---------------------------------------------------------------------
// Scroll reveal — visible by default; IntersectionObserver adds
// .will-reveal + .is-revealed only once a section nears the viewport.
// ---------------------------------------------------------------------
function initScrollReveal() {
  if (reduceMotionPreferred() || !window.IntersectionObserver) return;
  const sections = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  sections.forEach((el) => { el.classList.add('will-reveal'); io.observe(el); });
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
ensureAnnotationPluginRegistered();

let elevationChart = null;

initThemeToggle('theme-toggle', 'theme-toggle-label', () => {
  applyMapTileTheme('public-map');
  if (lastData) renderHero(lastData); // refresh gradient/pill colors against new theme tokens
});

window.addEventListener('hourchange', (e) => updateScrubUi(e.detail.index));

loadDashboardData()
  .then((result) => {
    lastData = result.data;
    referenceByName = result.referenceByName;
    citySeries = result.citySeries;

    initFreshnessChip('freshness-chip', lastData.generated_at);
    tickHeroPeak();
    setInterval(tickHeroPeak, 1000);

    renderHero(lastData);
    renderHeatTiers(lastData);
    renderElevationSentence(lastData);
    renderReframe(lastData);
    setFooterUpdated('footer-updated', lastData.generated_at);

    initDrawer(lastData, result.referenceData);

    document.getElementById('load-state').hidden = true;
    document.getElementById('app').hidden = false;

    // See map.js's createBaseMap doc comment: must run after #app is
    // visible, or fitBounds computes against a zero-size container.
    initMap(lastData);
    elevationChart = buildElevationChart(
      'chart-elevation', lastData.barangays, (name) => openDrawer(name)
    );
    initScrubber(lastData.barangays[0].hourly);
    initScrollReveal();
  })
  .catch((err) => {
    const el = document.getElementById('load-state');
    el.textContent = 'Could not load dashboard data (' + err.message + '). Run scripts/fetch/fetch-heat-index.js, then reload.';
    el.className = 'load-state error';
  });
