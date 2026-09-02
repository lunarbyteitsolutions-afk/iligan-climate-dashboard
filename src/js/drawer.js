'use strict';

/**
 * Barangay detail drawer. Page-agnostic: it holds no assumption about
 * which page opened it, just a reference to the loaded data (set once via
 * initDrawer) and the standard drawer DOM ids every page includes.
 */

import { getCssVar, bandVarColor, bandBadge, manilaHourLabel, PENDING_INDICATORS, reduceMotionPreferred } from './data.js';
import { buildDrawerChart } from './charts.js';

let _data = null;
let _referenceData = [];
let _drawerChart = null;
let _onOpen = null;

export function initDrawer(data, referenceData, opts) {
  _data = data;
  _referenceData = referenceData;
  _onOpen = (opts && opts.onOpen) || null;

  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('drawer').classList.contains('is-open')) closeDrawer();
  });
}

export function openDrawer(name) {
  const b = _data.barangays.find((x) => x.name === name);
  if (!b) return;
  const ref = _referenceData.find((x) => x.name === name);

  document.getElementById('drawer-title').textContent = b.name;
  document.getElementById('drawer-basics').innerHTML =
    '<dt>PSGC</dt><dd>' + (ref ? ref.psgc_code_9 : '—') + '</dd>' +
    '<dt>Coordinates</dt><dd>' + b.latitude.toFixed(5) + ', ' + b.longitude.toFixed(5) + '</dd>' +
    '<dt>Elevation</dt><dd>' + b.elevation_m + ' m</dd>';

  document.getElementById('drawer-current').innerHTML =
    '<dt>Now</dt><dd>' + b.current.value.toFixed(1) + '°C</dd>' +
    '<dt>Band</dt><dd id="drawer-band-slot"></dd>' +
    '<dt>Today\'s Peak</dt><dd>' + b.today_peak.value.toFixed(1) + '°C</dd>' +
    '<dt>Peak Time</dt><dd>' + manilaHourLabel(b.today_peak.date_time) + '</dd>';
  document.getElementById('drawer-band-slot').appendChild(bandBadge(b.current.band));

  if (_drawerChart) { _drawerChart.destroy(); _drawerChart = null; }
  _drawerChart = buildDrawerChart('drawer-chart', b);

  const timeline = document.getElementById('drawer-timeline');
  timeline.innerHTML = '';
  b.hourly.forEach((h) => {
    const seg = document.createElement('div');
    seg.className = 'band-timeline-seg';
    seg.style.background = bandVarColor(h.band);
    seg.title = manilaHourLabel(h.date_time) + ' — ' + h.band;
    timeline.appendChild(seg);
  });

  const owed = document.getElementById('drawer-owed');
  owed.innerHTML = '';
  ['E', 'S', 'G'].forEach((pillar) => {
    PENDING_INDICATORS[pillar].forEach((item) => {
      const li = document.createElement('li');
      li.innerHTML = '<strong>' + item.label + '</strong> — <span class="owner">owning office: ' + item.office + '</span>';
      owed.appendChild(li);
    });
  });

  const prov = document.getElementById('drawer-provenance');
  if (ref) {
    const confClass = ref.coordinate_confidence === 'low' ? ' class="confidence-low"' : '';
    prov.innerHTML =
      '<dt>Method</dt><dd>' + ref.coordinate_method + '</dd>' +
      '<dt>Source</dt><dd>' + ref.coordinate_source + '</dd>' +
      '<dt>Confidence</dt><dd' + confClass + '>' + ref.coordinate_confidence.toUpperCase() + (ref.coordinate_confidence === 'low' ? ' — treat as indicative only' : '') + '</dd>' +
      '<dt>Status</dt><dd>' + ref.coordinate_status + '</dd>';
  } else {
    prov.innerHTML = '<dt>Provenance</dt><dd>Not found in barangay_reference_points.json</dd>';
  }

  document.getElementById('drawer').hidden = false;
  requestAnimationFrame(() => {
    document.getElementById('drawer').classList.add('is-open');
    document.getElementById('drawer-backdrop').classList.add('is-open');
  });

  if (_onOpen) _onOpen(name);
}

export function closeDrawer() {
  const drawer = document.getElementById('drawer');
  drawer.classList.remove('is-open');
  document.getElementById('drawer-backdrop').classList.remove('is-open');
  setTimeout(() => { drawer.hidden = true; }, reduceMotionPreferred() ? 0 : 200);
}
