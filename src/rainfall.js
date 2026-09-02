'use strict';

import { DRY_DAY_THRESHOLD_MM, loadRainfallData } from './js/data.js';
import { initThemeToggle, initFreshnessChip, setFooterUpdated, renderNav, initScrollReveal, renderDisclosureCopy } from './js/chrome.js';

// ---------------------------------------------------------------------
// "Right now" summary — tie-safe, same pattern as the heat hero: all
// barangays sharing the longest streak are named, never an arbitrary one.
// ---------------------------------------------------------------------
function renderSummary(data) {
  const barangays = data.barangays;

  const maxStreak = Math.max(...barangays.map((b) => b.consecutive_dry_days));
  const streakLeaders = barangays.filter((b) => b.consecutive_dry_days === maxStreak);
  document.getElementById('dry-streak-names').textContent = streakLeaders.map((b) => b.name).join(', ');
  document.getElementById('dry-streak-count-suffix').textContent =
    streakLeaders.length > 1 ? ' (' + streakLeaders.length + ' tied)' : '';
  document.getElementById('dry-streak-value').textContent =
    maxStreak + (maxStreak === 1 ? ' day' : ' days');

  const weekValues = barangays.map((b) => b.rainfall_7day_mm);
  const minWeek = Math.min(...weekValues);
  const maxWeek = Math.max(...weekValues);
  document.getElementById('rainfall-range-value').textContent = minWeek.toFixed(1) + '–' + maxWeek.toFixed(1) + 'mm';
  document.getElementById('rainfall-range-detail').textContent = 'across 44 barangays, trailing 7 days';

  const dryCount = barangays.filter((b) => b.consecutive_dry_days >= 3).length;
  document.getElementById('dry-count-value').textContent = dryCount;
}

// ---------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------
const tableSortState = { key: 'streak', dir: 'desc' };

function renderTable(data) {
  const barangays = data.barangays;

  function draw() {
    const rows = barangays.slice();
    rows.sort((a, b) => {
      const dir = tableSortState.dir === 'asc' ? 1 : -1;
      switch (tableSortState.key) {
        case 'name': return a.name.localeCompare(b.name) * dir;
        case 'today': return (a.rainfall_today_mm - b.rainfall_today_mm) * dir;
        case 'week': return (a.rainfall_7day_mm - b.rainfall_7day_mm) * dir;
        case 'dryDays': return (a.dry_days_7 - b.dry_days_7) * dir;
        default: return (a.consecutive_dry_days - b.consecutive_dry_days) * dir;
      }
    });

    const tbody = document.getElementById('rainfall-table-body');
    tbody.innerHTML = '';
    rows.forEach((b) => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = b.name;
      tr.appendChild(tdName);

      const tdToday = document.createElement('td');
      tdToday.className = 'value-cell';
      tdToday.textContent = b.rainfall_today_mm.toFixed(1);
      tr.appendChild(tdToday);

      const tdWeek = document.createElement('td');
      tdWeek.className = 'value-cell';
      tdWeek.textContent = b.rainfall_7day_mm.toFixed(1);
      tr.appendChild(tdWeek);

      const tdDryDays = document.createElement('td');
      tdDryDays.className = 'value-cell';
      tdDryDays.textContent = b.dry_days_7 + ' of ' + b.window_days;
      tr.appendChild(tdDryDays);

      const tdStreak = document.createElement('td');
      tdStreak.className = 'value-cell';
      tdStreak.textContent = b.consecutive_dry_days;
      tr.appendChild(tdStreak);

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

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
renderNav('site-nav', 'rainfall');
renderDisclosureCopy();
initThemeToggle('theme-toggle', 'theme-toggle-label', () => {});
document.getElementById('dry-threshold-text').textContent = DRY_DAY_THRESHOLD_MM.toFixed(1) + 'mm';

loadRainfallData()
  .then((data) => {
    initFreshnessChip('freshness-chip', data.generated_at);
    renderSummary(data);
    renderTable(data);
    setFooterUpdated('footer-updated', data.generated_at);

    document.getElementById('load-state').hidden = true;
    document.getElementById('app').hidden = false;

    initScrollReveal(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  })
  .catch((err) => {
    const el = document.getElementById('load-state');
    el.textContent = 'Could not load rainfall data (' + err.message + '). Run scripts/fetch/fetch-rainfall.js, then reload.';
    el.className = 'load-state error';
  });
