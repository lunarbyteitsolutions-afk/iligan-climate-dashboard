'use strict';

/**
 * Shared boot for the "pending" data-request pages (rainfall, fire,
 * exposure, water, agri, response before their own step ships): nav,
 * theme toggle, and the freshness/footer timestamp every view must show
 * per CLAUDE.md, even a page with no data of its own to show yet.
 */

import { initThemeToggle, initFreshnessChip, setFooterUpdated, renderNav } from './chrome.js';

export function initPendingPage(pageId) {
  renderNav('site-nav', pageId);
  initThemeToggle('theme-toggle', 'theme-toggle-label', () => {});

  fetch('data/heat-index-latest.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      initFreshnessChip('freshness-chip', data.generated_at);
      setFooterUpdated('footer-updated', data.generated_at);
    })
    .catch(() => { /* last-updated timestamp just stays blank if this fails */ });
}
