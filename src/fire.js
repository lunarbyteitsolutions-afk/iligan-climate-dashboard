'use strict';

import { loadFireHotspotsData, formatManilaFull } from './js/data.js';
import { applyMapTileTheme, createBaseMap, createHotspotMarkers } from './js/map.js';
import { initThemeToggle, initFreshnessChip, setFooterUpdated, renderNav, initScrollReveal } from './js/chrome.js';

let map = null;

// ---------------------------------------------------------------------
// Count + zero state
// ---------------------------------------------------------------------
function renderCount(data) {
  document.getElementById('hotspot-count-value').textContent = data.count_7day;
  document.getElementById('hotspot-zero-state').hidden = data.count_7day !== 0;
}

// ---------------------------------------------------------------------
// Timeline — plain CSS bars, no chart library needed for 7 numbers
// ---------------------------------------------------------------------
function renderTimeline(data) {
  const maxCount = Math.max(1, ...data.by_day.map((d) => d.count));
  const wrap = document.getElementById('hotspot-timeline');
  wrap.innerHTML = '';
  data.by_day.forEach((d) => {
    const col = document.createElement('div');
    col.className = 'hotspot-timeline-day';

    const countEl = document.createElement('div');
    countEl.className = 'hotspot-timeline-count';
    countEl.textContent = d.count;
    col.appendChild(countEl);

    const bar = document.createElement('div');
    bar.className = 'hotspot-timeline-bar';
    bar.style.height = (d.count === 0 ? 3 : Math.max(3, (d.count / maxCount) * 60)) + 'px';
    col.appendChild(bar);

    const label = document.createElement('div');
    label.className = 'hotspot-timeline-label';
    const dt = new Date(d.date + 'T00:00:00Z');
    label.textContent = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    col.appendChild(label);

    wrap.appendChild(col);
  });
}

// ---------------------------------------------------------------------
// Map — fit to the same bounding box the fetch script filtered against,
// then plot each hotspot as a distinct-shaped (triangle) marker.
// ---------------------------------------------------------------------
function renderMap(data) {
  const bbox = data.bounding_box;
  const corners = [
    [bbox.lat_min, bbox.lon_min], [bbox.lat_max, bbox.lon_max],
    [bbox.lat_min, bbox.lon_max], [bbox.lat_max, bbox.lon_min]
  ];
  map = createBaseMap('map', corners, { padding: [12, 12] });
  createHotspotMarkers(map, data.hotspots, { formatDateTime: (iso) => formatManilaFull(new Date(iso)) });

  const legend = document.getElementById('hotspot-map-legend');
  legend.innerHTML = '<span class="map-legend-item"><span class="map-legend-swatch hotspot-swatch"></span>Thermal anomaly detection (event, not a place)</span>';
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
renderNav('site-nav', 'fire');
initThemeToggle('theme-toggle', 'theme-toggle-label', () => { if (map) applyMapTileTheme('map'); });

loadFireHotspotsData()
  .then((data) => {
    initFreshnessChip('freshness-chip', data.generated_at);
    renderCount(data);
    renderTimeline(data);
    renderMap(data);
    setFooterUpdated('footer-updated', data.generated_at);
    initScrollReveal(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  })
  .catch((err) => {
    document.getElementById('hotspot-count-value').textContent = 'NO DATA';
    document.getElementById('hotspot-zero-state').hidden = false;
    document.getElementById('hotspot-zero-state').textContent =
      'Could not load satellite hotspot data (' + err.message + '). Run scripts/fetch/fetch-fire-hotspots.js, then reload.';
  });
