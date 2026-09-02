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
