'use strict';

import { HERO_BAND_COLORS, BAND_CLASS, tweenNumber, manilaHourLabel, loadDashboardData, loadRainfallData } from './js/data.js';
import { initThemeToggle, initFreshnessChip, setFooterUpdated, icon, renderNav, initScrollReveal } from './js/chrome.js';

let citySeries = null;

// ---------------------------------------------------------------------
// Hero — identical to the committed public-view hero (unchanged per
// instruction: this page is a dashboard, and the hero stays exactly as
// shipped).
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
      const chip = document.createElement('span');
      chip.className = 'tier-chip';
      chip.style.cursor = 'default';
      chip.textContent = b.name;
      chipsWrap.appendChild(chip);
    });
  }
  document.getElementById('hero-sentence').textContent = sentence;
}

function tickHeroPeak() {
  const peakDate = new Date(citySeries.hourly[citySeries.peakIndex].date_time);
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
// Indicator cards — real value where live, NO DATA + owning office where
// not. Fire/water/exposure/agri/response are hardcoded NO DATA here —
// deliberately not a speculative fetch for a file that doesn't exist yet:
// a 404 gets logged to the console by the browser itself regardless of a
// JS try/catch, so "probe and gracefully degrade" isn't actually silent.
// Per docs/ARCHITECTURE.md, the step that ships each indicator's fetch
// script is also the step that updates this card to read the real file.
// ---------------------------------------------------------------------
function cardHtml(opts) {
  return (
    '<div class="indicator-card-head"><span class="icon">' + opts.icon + '</span><span class="indicator-card-name">' + opts.name + '</span></div>' +
    '<div class="indicator-card-value">' + opts.value + '</div>' +
    '<div class="indicator-card-meta">' + opts.meta + '</div>' +
    '<span class="indicator-card-arrow">' + opts.linkLabel + ' &rarr;</span>'
  );
}

/** Rainfall card content — real once rainfall-latest.json has loaded, NO DATA fallback otherwise. */
function rainfallCard(rainfallData) {
  if (!rainfallData) {
    return {
      value: 'NO DATA', meta: 'PAGASA (authoritative); CDRRMO'
    };
  }
  const barangays = rainfallData.barangays;
  const driest = barangays.reduce((a, b) => (b.consecutive_dry_days > a.consecutive_dry_days ? b : a));
  return {
    value: driest.consecutive_dry_days + (driest.consecutive_dry_days === 1 ? ' dry day' : ' dry days'),
    meta: driest.consecutive_dry_days > 0
      ? driest.name + ' · longest current streak · derived'
      : 'No barangay has gone a full day without rain · derived'
  };
}

function renderIndicatorCards(data, rainfallData) {
  const barangays = data.barangays;
  const hottest = barangays.reduce((a, b) => (b.current.value > a.current.value ? b : a));
  const rainfall = rainfallCard(rainfallData);

  const cards = [
    {
      id: 'card-heat', href: 'heat.html', band: hottest.current.band,
      icon: icon('environmental'), name: 'Heat index',
      value: hottest.current.value.toFixed(1) + '°C', meta: hottest.current.band + ' · LIVE',
      linkLabel: 'View heat index'
    },
    {
      id: 'card-rainfall', href: 'rainfall.html',
      icon: icon('rainfall'), name: 'Rainfall',
      value: rainfall.value, meta: rainfall.meta,
      linkLabel: 'View rainfall'
    },
    {
      id: 'card-water-level', href: 'water.html',
      icon: icon('water'), name: 'Water level / availability',
      value: 'NO DATA', meta: 'CDRRMO; Iligan City Water District',
      linkLabel: 'View water'
    },
    {
      id: 'card-fire', href: 'fire.html',
      icon: icon('fire'), name: 'Fire incidents',
      value: 'NO DATA', meta: 'BFP Iligan City; ICENRO',
      linkLabel: 'View fire'
    },
    {
      id: 'card-exposure', href: 'exposure.html',
      icon: icon('social'), name: 'Population exposed',
      value: 'NO DATA', meta: 'owning office: CSWDO',
      linkLabel: 'View exposure'
    },
    {
      id: 'card-water-shortage', href: 'water.html',
      icon: icon('health'), name: 'Households with water shortage',
      value: 'NO DATA', meta: 'owning office: City Health',
      linkLabel: 'View water'
    },
    {
      id: 'card-agri', href: 'agri.html',
      icon: icon('farms'), name: 'Farmers & hectares affected',
      value: 'NO DATA', meta: 'owning office: City Agriculture',
      linkLabel: 'View agriculture'
    },
    {
      id: 'card-response', href: 'response.html',
      icon: icon('governance'), name: 'Government response status',
      value: 'NO DATA', meta: "owning office: City Administrator's Office",
      linkLabel: 'View response'
    }
  ];

  const wrap = document.getElementById('indicator-cards');
  wrap.innerHTML = '';
  cards.forEach((c) => {
    const a = document.createElement('a');
    a.className = 'indicator-card';
    a.id = c.id;
    a.href = c.href;
    if (c.band) a.style.setProperty('--card-band', 'var(--band-' + c.band.toLowerCase().replace(/\s+/g, '-') + '-bg)');
    a.innerHTML = cardHtml(c);
    wrap.appendChild(a);
  });
}

/** Patches just the rainfall card in place, for when rainfall-latest.json resolves after the initial render. */
function upgradeRainfallCard(rainfallData) {
  const card = document.getElementById('card-rainfall');
  if (!card) return;
  const rainfall = rainfallCard(rainfallData);
  card.querySelector('.indicator-card-value').textContent = rainfall.value;
  card.querySelector('.indicator-card-meta').textContent = rainfall.meta;
}

// ---------------------------------------------------------------------
// ESG reframe icons (headline/count stays as committed; step 6 makes the
// fraction data-driven)
// ---------------------------------------------------------------------
function renderReframeIcons() {
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

function renderReframeMetric(data) {
  const hottest = data.barangays.reduce((a, b) => (b.current.value > a.current.value ? b : a));
  document.getElementById('reframe-e-value').textContent = hottest.current.value.toFixed(1) + '°C';
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
renderNav('site-nav', 'overview');
renderReframeIcons();

// Nothing on this page needs to re-render on theme change: the hero's
// band pill/dot are class-driven (CSS resolves the right token) and the
// hero-gradient's colors are fixed per band, not per theme.
initThemeToggle('theme-toggle', 'theme-toggle-label', () => {});

// Rainfall loads independently of heat data — whichever resolves first
// renders with what it has; a late rainfall response upgrades the
// already-rendered card in place rather than blocking on it.
let rainfallDataCache = null;
loadRainfallData()
  .then((rainfallData) => { rainfallDataCache = rainfallData; upgradeRainfallCard(rainfallData); })
  .catch(() => { /* card already shows NO DATA */ });

loadDashboardData()
  .then((result) => {
    const data = result.data;
    citySeries = result.citySeries;

    initFreshnessChip('freshness-chip', data.generated_at);
    tickHeroPeak();
    setInterval(tickHeroPeak, 1000);

    renderHero(data);
    renderIndicatorCards(data, rainfallDataCache);
    renderReframeMetric(data);
    setFooterUpdated('footer-updated', data.generated_at);

    document.getElementById('load-state').hidden = true;
    document.getElementById('app').hidden = false;

    initScrollReveal(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  })
  .catch((err) => {
    const el = document.getElementById('load-state');
    el.textContent = 'Could not load dashboard data (' + err.message + '). Run scripts/fetch/fetch-heat-index.js, then reload.';
    el.className = 'load-state error';
  });
