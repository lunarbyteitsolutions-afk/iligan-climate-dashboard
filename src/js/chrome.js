'use strict';

/**
 * Header, nav, theme toggle, freshness chip, footer. Also the shared
 * inline-SVG icon set (presentational, not data, but used across every
 * page's chrome and content).
 */

import { STALE_HOURS, formatManilaClock, formatManilaFull, manilaHourLabel } from './data.js';

const THEME_KEY = 'iligan-dashboard-theme';

// -----------------------------------------------------------------------
// Icons — line-drawn, 1.5px stroke, currentColor, no icon font or CDN
// pack. One per concept, reused everywhere that concept appears.
// -----------------------------------------------------------------------
const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICONS = {
  environmental: '<svg ' + ICON_ATTRS + '><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  social: '<svg ' + ICON_ATTRS + '><circle cx="8.5" cy="8" r="2.6"/><circle cx="16" cy="9" r="2.2"/><path d="M3 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13.5 14.3c2.6.2 4.5 2 4.5 4.7"/></svg>',
  governance: '<svg ' + ICON_ATTRS + '><path d="M12 3l8 4v2H4V7l8-4z"/><path d="M5 9v9M9 9v9M15 9v9M19 9v9M3 20h18"/></svg>',
  rainfall: '<svg ' + ICON_ATTRS + '><path d="M12 3c2.8 3.6 4.5 6.2 4.5 8.5a4.5 4.5 0 1 1-9 0C7.5 9.2 9.2 6.6 12 3z"/></svg>',
  water: '<svg ' + ICON_ATTRS + '><path d="M3 16c1.2-1.3 2.4-1.3 3.6 0s2.4 1.3 3.6 0 2.4-1.3 3.6 0 2.4 1.3 3.6 0M3 11c1.2-1.3 2.4-1.3 3.6 0s2.4 1.3 3.6 0 2.4-1.3 3.6 0 2.4 1.3 3.6 0"/></svg>',
  fire: '<svg ' + ICON_ATTRS + '><path d="M12 2s3 4 3 6.5c0 .8-.3 1.5-.8 2 1.7-1 2.8-2.8 2.3-5.5C19 7 20.5 10 20.5 13c0 4.7-3.8 8.5-8.5 8.5S3.5 17.7 3.5 13c0-3.5 2-6 4-8 .3 2 1.2 3.2 2.5 4C9.5 6.5 10.5 4 12 2z"/></svg>',
  farms: '<svg ' + ICON_ATTRS + '><path d="M12 21V9M12 9C12 5 9 3 9 3s0 3 3 6zM12 9c0-4 3-6 3-6s0 3-3 6zM7 21c0-3 2-5 5-5s5 2 5 5"/></svg>',
  health: '<svg ' + ICON_ATTRS + '><path d="M20.5 8.5c0 5-8.5 11-8.5 11s-8.5-6-8.5-11a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2z"/><path d="M9 9.5h2l1-2 1 3 1-1.5h1.5"/></svg>'
};

export function icon(name) { return ICONS[name] || ''; }

// -----------------------------------------------------------------------
// Attribution & disclaimer copy — written once here, identical on every
// page. See CLAUDE.md's "Who we are" and non-negotiable #2: this project
// is a City Government of Iligan initiative (CDIIS, via the Digital
// Creatives Hub, in collaboration with DEVCON Iligan), so every figure on
// it reads as official — which makes the modelled-vs-authoritative and
// monitoring-tool-not-advisory distinctions MORE important, not less.
// Never re-type any of these strings inline; import them from here.
// -----------------------------------------------------------------------
export const FOOTER_ATTRIBUTION_FULL =
  'An initiative of the Center for Digital Iligan, Innovation and Sustainability (CDIIS), ' +
  'City Government of Iligan, through its Digital Creatives Hub, in collaboration with ' +
  'DEVCON Iligan — Developers Connect Philippines, Iligan Chapter.';

export const FOOTER_ATTRIBUTION_COMPACT = 'CDIIS · City Government of Iligan × DEVCON Iligan';

export const DERIVED_DISCLAIMER =
  'Heat index values shown here are computed from Open-Meteo model data. PAGASA — iHeatMAP, ' +
  'the Heat Index page, AWS readings and ENSO advisories — remains the authoritative reference ' +
  'for official heat index values and El Niño declarations. Values marked derived are modelled, not observed.';

export const MONITORING_TOOL_NOTICE =
  'This is a monitoring tool, not an advisory. Official heat and El Niño advisories for Iligan ' +
  'are issued by PAGASA and by the City Government of Iligan through its authorized offices.';

export const HEADER_CHIP_TEXT = 'DERIVED · MODELLED FROM OPEN-METEO · PAGASA IS AUTHORITATIVE';

/**
 * Fills in the standard header derived-chip and footer disclosure copy.
 * Every page calls this once at boot rather than hand-typing any of the
 * strings above. `#derived-chip` and the three footer element ids are
 * optional per page (a page just omits the ones it doesn't have), so this
 * is safe to call unconditionally.
 */
export function renderDisclosureCopy() {
  const chip = document.getElementById('derived-chip');
  if (chip) {
    chip.textContent = HEADER_CHIP_TEXT;
    chip.title = DERIVED_DISCLAIMER;
  }

  const attribution = document.getElementById('footer-attribution');
  if (attribution) {
    attribution.innerHTML =
      '<span class="attribution-full">' + FOOTER_ATTRIBUTION_FULL + '</span>' +
      '<span class="attribution-compact">' + FOOTER_ATTRIBUTION_COMPACT + '</span>';
  }

  const derivedNote = document.getElementById('footer-derived-note');
  if (derivedNote) derivedNote.textContent = DERIVED_DISCLAIMER;

  const monitoringNotice = document.getElementById('footer-monitoring-notice');
  if (monitoringNotice) monitoringNotice.textContent = MONITORING_TOOL_NOTICE;
}

// -----------------------------------------------------------------------
// Shared nav — one list, edited in the step that makes a page live
// (remove `pending: true` from that page's entry), so every page's nav
// bar stays in sync automatically.
// -----------------------------------------------------------------------
export const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', href: 'index.html' },
  { id: 'heat', label: 'Heat', href: 'heat.html' },
  { id: 'rainfall', label: 'Rainfall', href: 'rainfall.html' },
  { id: 'fire', label: 'Fire', href: 'fire.html' },
  { id: 'exposure', label: 'Exposure', href: 'exposure.html' },
  { id: 'water', label: 'Water', href: 'water.html', pending: true },
  { id: 'agri', label: 'Agriculture', href: 'agri.html', pending: true },
  { id: 'response', label: 'Response', href: 'response.html', pending: true },
  { id: 'ops', label: 'Operations', href: 'ops.html' }
];

/** Renders the shared nav into a container, marking the active + pending pages. */
export function renderNav(containerId, activeId) {
  const nav = document.getElementById(containerId);
  if (!nav) return;
  nav.innerHTML = '';
  NAV_ITEMS.forEach((item) => {
    const a = document.createElement('a');
    a.href = item.href;
    a.className = 'nav-link' + (item.id === activeId ? ' is-active' : '') + (item.pending ? ' is-pending' : '');
    if (item.id === activeId) a.setAttribute('aria-current', 'page');
    a.textContent = item.label;
    if (item.pending) {
      const dot = document.createElement('span');
      dot.className = 'nav-pending-dot';
      dot.title = 'Pending — no data yet';
      a.appendChild(dot);
    }
    nav.appendChild(a);
  });
}

// -----------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------
export function currentTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit) return explicit;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
      return;
    }
  } catch (e) { /* localStorage unavailable */ }
  // Dark is the authored default for a first-time visitor: only a stored
  // explicit choice overrides it, never silently the system preference.
  document.documentElement.setAttribute('data-theme', 'dark');
}

/**
 * @param {string} buttonId
 * @param {string} labelId
 * @param {(next: 'light'|'dark') => void} onChange
 */
export function initThemeToggle(buttonId, labelId, onChange) {
  applyStoredTheme();
  const label = document.getElementById(labelId);
  if (label) label.textContent = currentTheme() === 'dark' ? 'Light theme' : 'Dark theme';
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    if (label) label.textContent = next === 'dark' ? 'Light theme' : 'Dark theme';
    onChange(next);
  });
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (!document.documentElement.getAttribute('data-theme')) onChange(currentTheme());
    });
  }
}

// -----------------------------------------------------------------------
// Freshness chip — ticks every second
// -----------------------------------------------------------------------
export function initFreshnessChip(chipId, generatedAtIso) {
  const generated = new Date(generatedAtIso);
  function tick() {
    const chip = document.getElementById(chipId);
    if (!chip) return;
    const ageMs = Date.now() - generated.getTime();
    const ageHours = ageMs / 3600000;
    chip.classList.remove('chip-fresh', 'chip-stale');
    if (ageHours > STALE_HOURS) {
      chip.textContent = 'STALE — last updated ' + Math.floor(ageHours) + 'h ago';
      chip.classList.add('chip-stale');
    } else {
      const ageSec = Math.floor(ageMs / 1000);
      const agoText = ageSec < 60 ? (ageSec + 's ago') : (Math.floor(ageSec / 60) + 'm ago');
      chip.textContent = 'UPDATED ' + formatManilaClock(generated) + ' PHT · ' + agoText;
      chip.classList.add('chip-fresh');
    }
  }
  tick();
  setInterval(tick, 1000);
}

// -----------------------------------------------------------------------
// Peak countdown chip — ticks every second, always the REAL current time
// versus the real computed city peak (independent of any scrubber).
// -----------------------------------------------------------------------
export function initPeakChip(chipId, citySeries) {
  const peakDate = new Date(citySeries.hourly[citySeries.peakIndex].date_time);
  const peakValue = citySeries.maxSeries[citySeries.peakIndex];
  const peakTimeLabel = manilaHourLabel(citySeries.hourly[citySeries.peakIndex].date_time);

  function tick() {
    const chip = document.getElementById(chipId);
    if (!chip) return;
    const diffMs = peakDate.getTime() - Date.now();
    if (diffMs <= 0) {
      chip.textContent = 'PEAK PASSED ' + peakTimeLabel + ' · ' + peakValue.toFixed(1) + '°C';
      chip.classList.add('is-passed');
      return;
    }
    chip.classList.remove('is-passed');
    const totalMin = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    chip.textContent = 'PEAK HEAT IN ' + h + 'H ' + m + 'M · ' + peakTimeLabel + ' PHT · ' + peakValue.toFixed(1) + '°C EXPECTED';
  }
  tick();
  setInterval(tick, 1000);
}

// -----------------------------------------------------------------------
// Footer "last updated"
// -----------------------------------------------------------------------
export function setFooterUpdated(elId, generatedAtIso) {
  const el = document.getElementById(elId);
  if (el) el.textContent = formatManilaFull(new Date(generatedAtIso));
}

// -----------------------------------------------------------------------
// Scroll reveal — fades/slides `.reveal` sections in as they enter view.
// Shared by every page with `.reveal` sections so the animation and its
// IntersectionObserver threshold stay identical everywhere.
// -----------------------------------------------------------------------
export function initScrollReveal(reduceMotion) {
  if (reduceMotion || !window.IntersectionObserver) return;
  const sections = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.15 });
  sections.forEach((el) => { el.classList.add('will-reveal'); io.observe(el); });
}
