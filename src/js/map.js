'use strict';

/**
 * Leaflet setup, markers, band coloring. Does not know which page it is
 * on — callers pass the container id, the points, and any callbacks
 * (click, hover) they want wired up.
 */

import { getCssVar, bandVarColor } from './data.js';

/** True when the current theme is dark (reads the same source as CSS). */
function isDarkTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit) return explicit === 'dark';
  return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
}

/**
 * Inverts standard OSM tiles to a dark palette in dark theme; plain in
 * light theme. Standard OpenStreetMap tiles, not a key-gated dark basemap
 * provider — CARTO's and Stadia's free dark tiles both now require an API
 * key tied to one person's account (verified: CARTO serves an "API KEY
 * REQUIRED" placeholder image at HTTP 200; Stadia returns 401), which
 * conflicts with this project's "no dependency on one person's account"
 * rule. The dark look comes from a CSS filter on the tile pane instead —
 * fully client-side, no server-side dependency beyond OSM itself.
 */
export function applyMapTileTheme(containerId) {
  const pane = document.querySelector('#' + containerId + ' .leaflet-tile-pane');
  if (!pane) return;
  pane.style.filter = isDarkTheme()
    ? 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.92) saturate(0.9)'
    : 'none';
}

/**
 * Creates a Leaflet map fitted to the given [lat,lng] points, with a
 * hard maxBounds so panning can't wander into neighboring provinces.
 * IMPORTANT: only call this once the container is actually visible (not
 * inside a `hidden` ancestor) — fitBounds() computes against the
 * container's current size, and a hidden (display:none) container has
 * zero size, silently zooming to the wrong level.
 */
export function createBaseMap(containerId, points, opts) {
  opts = opts || {};
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const map = L.map(containerId, {
    dragging: !isTouch,
    tap: !isTouch,
    scrollWheelZoom: false,
    zoomControl: opts.zoomControl !== false,
    // Leaflet's default zoomSnap (1) forces fitBounds onto whole zoom
    // levels, rounding DOWN to guarantee full containment — for a
    // ~35km-wide, oddly-shaped area like Iligan's barangays that wastes
    // up to a full zoom level (~2x too much visible area), rendering
    // Iligan tiny in the middle of three neighboring provinces. A small
    // fractional snap lets it hug the real bounds (verified against the
    // map's actual computed zoom/bounds, not assumed).
    zoomSnap: 0.1,
    zoomDelta: 0.5
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19
  }).addTo(map);
  applyMapTileTheme(containerId);

  const bounds = L.latLngBounds(points);
  map.fitBounds(bounds, { padding: opts.padding || [16, 16] });
  map.setMinZoom(map.getZoom());
  // Padded wider than the strict data bounds so panning to the very edge
  // barangay doesn't feel like hitting a wall, but still far short of the
  // neighboring provinces the old (zoomSnap:1) zoom was showing.
  map.setMaxBounds(bounds.pad(0.15));

  if (isTouch) {
    const wrap = document.getElementById(containerId).parentElement;
    const hint = document.createElement('div');
    hint.className = 'map-touch-hint';
    hint.textContent = 'Tap to interact';
    wrap.appendChild(hint);
    hint.addEventListener('touchstart', () => {
      map.dragging.enable();
      if (map.tap) map.tap.enable();
      hint.remove();
    }, { once: true });
  }

  return map;
}

/**
 * Creates one circle marker per barangay and returns a { name: marker }
 * map for later updates/highlighting.
 *
 * opts.glow: adds a pulsing glow class (public-view style) instead of the
 *   ops-view's plain hover-ring style.
 * opts.onClick(name), opts.onHover(name, isHovering): caller-supplied
 *   callbacks — this module never assumes what "clicking a marker" means
 *   on the page it's used from.
 */
export function createMarkers(map, barangays, referenceByName, opts) {
  opts = opts || {};
  const markersByName = {};

  barangays.forEach((b) => {
    const ref = referenceByName[b.name];
    const lowConfidence = ref && ref.coordinate_confidence === 'low';
    const marker = L.circleMarker([b.latitude, b.longitude], {
      radius: opts.glow ? 7 : 6,
      className: opts.glow ? 'pulse-marker map-glow-marker' : '',
      color: lowConfidence ? bandVarColor(b.current.band) : 'transparent',
      weight: 2,
      dashArray: lowConfidence ? '2,2' : null,
      fillColor: bandVarColor(b.current.band),
      fillOpacity: lowConfidence ? 0.15 : (opts.glow ? 0.85 : 0.9),
      opacity: lowConfidence ? 1 : (opts.glow ? 1 : 0)
    });
    // Stored so mouseout/highlightMarker can restore the correct resting
    // ring without reverse-engineering it from the DOM.
    marker._lowConfidence = lowConfidence;

    if (!opts.glow) {
      marker.on('mouseover', () => { marker.setStyle({ color: getCssVar('--accent'), weight: 2, opacity: 1 }); if (opts.onHover) opts.onHover(b.name, true); });
      marker.on('mouseout', () => { resetMarkerRing(marker); if (opts.onHover) opts.onHover(b.name, false); });
    }
    marker.on('click', () => { if (opts.onClick) opts.onClick(b.name); });
    marker.bindTooltip(b.name, { direction: 'top' });
    marker.addTo(map);
    markersByName[b.name] = marker;
  });

  return markersByName;
}

/** Update every marker's fill/ring to match a (possibly scrubbed) view. */
export function updateMarkerBands(markersByName, barangays, referenceByName) {
  barangays.forEach((b) => {
    const marker = markersByName[b.name];
    if (!marker) return;
    const ref = referenceByName[b.name];
    const lowConfidence = ref && ref.coordinate_confidence === 'low';
    marker._lowConfidence = lowConfidence;
    marker.setStyle({
      fillColor: bandVarColor(b.current.band),
      fillOpacity: lowConfidence ? 0.15 : marker.options.fillOpacity,
      dashArray: lowConfidence ? '2,2' : null,
      color: lowConfidence ? bandVarColor(b.current.band) : 'transparent',
      opacity: lowConfidence ? 1 : (marker.options.opacity || 0)
    });
  });
}

/** Restore a marker's resting (non-hovered) ring style. */
function resetMarkerRing(marker) {
  const fillColor = marker.options.fillColor;
  marker.setStyle({
    color: marker._lowConfidence ? fillColor : 'transparent',
    weight: 2,
    opacity: marker._lowConfidence ? 1 : 0
  });
}

export function highlightMarker(markersByName, name, on) {
  const marker = markersByName[name];
  if (!marker) return;
  if (on) marker.setStyle({ color: getCssVar('--accent'), weight: 2, opacity: 1 });
  else resetMarkerRing(marker);
}

/**
 * Plots satellite thermal-anomaly detections as a distinct marker shape
 * (a triangle) — deliberately not the circleMarker used for barangay
 * reference points, since a hotspot is a one-off event, not a place.
 * Returns the array of markers (callers don't need to look these up by
 * name the way barangay markers are).
 */
export function createHotspotMarkers(map, hotspots, opts) {
  opts = opts || {};
  const icon = L.divIcon({
    className: 'hotspot-marker-icon',
    html: '<span class="hotspot-marker-shape" aria-hidden="true"></span>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  return hotspots.map((h) => {
    const marker = L.marker([h.latitude, h.longitude], { icon });
    const when = opts.formatDateTime ? opts.formatDateTime(h.date_time) : h.date_time;
    marker.bindPopup(
      '<strong>Satellite thermal anomaly</strong> — not a confirmed fire incident<br>' +
      when + '<br>' +
      'Confidence: ' + h.confidence + ' &middot; FRP: ' + h.frp + 'MW<br>' +
      'Detected by: ' + h.satellites.join(', ') + '<br>' +
      'Nearest reference point: ' + h.nearest_barangay + ' (' + h.distance_km + 'km)'
    );
    marker.addTo(map);
    return marker;
  });
}

/** Renders the standard 4-band + low-confidence legend into a container. */
export function renderMapLegend(containerId, bandOrder) {
  const legend = document.getElementById(containerId);
  legend.innerHTML = '';
  bandOrder.forEach((band) => {
    const item = document.createElement('span');
    item.className = 'map-legend-item';
    item.innerHTML = '<span class="map-legend-swatch" style="background:' + bandVarColor(band) + '"></span>' + band;
    legend.appendChild(item);
  });
  const lowItem = document.createElement('span');
  lowItem.className = 'map-legend-item';
  lowItem.innerHTML = '<span class="map-legend-swatch low-confidence"></span>Low-confidence coordinate (e.g. Tambacan)';
  legend.appendChild(lowItem);
}
