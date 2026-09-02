'use strict';

/**
 * Shared data + utility layer for both dashboard views (src/index.html, the
 * public landing page, and src/ops.html, the city-management view). Neither
 * page duplicates the fetch or the data logic — both load this file first
 * and call window.Shared.*.
 *
 * Anything here that touches honesty rules (competitionRanks' tie-safety,
 * the derived-indicator label text, PENDING_INDICATORS' office names) is
 * intentionally verbatim from the single-page version — see CLAUDE.md.
 */
(function () {
  var THEME_KEY = 'iligan-dashboard-theme';
  var STALE_HOURS = 3;

  // Same NWS/Rothfusz band boundaries used server-side in
  // scripts/fetch/heat-index.js's band() function, in Celsius.
  var EXTREME_CAUTION_MIN_C = ((90 - 32) * 5) / 9; // 32.2
  var DANGER_MIN_C = ((105 - 32) * 5) / 9; // 40.6
  var EXTREME_DANGER_MIN_C = ((130 - 32) * 5) / 9; // 54.4
  var CAUTION_MIN_C = ((80 - 32) * 5) / 9; // 26.7

  var BAND_CLASS = {
    'Caution': 'band-caution',
    'Extreme Caution': 'band-extreme-caution',
    'Danger': 'band-danger',
    'Extreme Danger': 'band-extreme-danger'
  };
  var ROW_CLASS = {
    'Caution': 'row-caution',
    'Extreme Caution': 'row-extreme-caution',
    'Danger': 'row-danger',
    'Extreme Danger': 'row-extreme-danger'
  };
  var BAND_ORDER = ['Caution', 'Extreme Caution', 'Danger', 'Extreme Danger'];
  var PULSE_BANDS = { 'Danger': true, 'Extreme Danger': true };

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Shared content for the ESG scorecard/reframe AND the drawer's
  // "Data Owed" block — one list so no two views can drift out of sync.
  var PENDING_INDICATORS = {
    E: [
      { label: 'Rainfall', office: 'PAGASA (authoritative); CDRRMO for local rain gauges — pending confirmation with the office' },
      { label: 'Water level / availability', office: 'CDRRMO (river and water-source levels); Iligan City Water District (supply and service interruptions) — pending confirmation with the office' },
      { label: 'Fire incidents', office: 'BFP Iligan City (structural/grass); ICENRO (vegetation/watershed) — pending confirmation with the office' }
    ],
    S: [
      { label: 'Population exposed', office: 'CSWDO' },
      { label: 'Households with water shortage', office: 'City Health' },
      { label: 'Farmers & hectares affected', office: 'City Agriculture' }
    ],
    G: [
      { label: 'Government intervention / response status', office: "City Administrator's Office" }
    ]
  };

  // -----------------------------------------------------------------------
  // Inline SVG icons — line-drawn, 1.5px stroke, currentColor, no icon font
  // or CDN pack. One per concept, reused everywhere that concept appears.
  // -----------------------------------------------------------------------
  var ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var ICONS = {
    environmental: '<svg ' + ICON_ATTRS + '><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
    social: '<svg ' + ICON_ATTRS + '><circle cx="8.5" cy="8" r="2.6"/><circle cx="16" cy="9" r="2.2"/><path d="M3 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13.5 14.3c2.6.2 4.5 2 4.5 4.7"/></svg>',
    governance: '<svg ' + ICON_ATTRS + '><path d="M12 3l8 4v2H4V7l8-4z"/><path d="M5 9v9M9 9v9M15 9v9M19 9v9M3 20h18"/></svg>',
    rainfall: '<svg ' + ICON_ATTRS + '><path d="M12 3c2.8 3.6 4.5 6.2 4.5 8.5a4.5 4.5 0 1 1-9 0C7.5 9.2 9.2 6.6 12 3z"/></svg>',
    water: '<svg ' + ICON_ATTRS + '><path d="M3 16c1.2-1.3 2.4-1.3 3.6 0s2.4 1.3 3.6 0 2.4-1.3 3.6 0 2.4 1.3 3.6 0M3 11c1.2-1.3 2.4-1.3 3.6 0s2.4 1.3 3.6 0 2.4-1.3 3.6 0 2.4 1.3 3.6 0"/></svg>',
    fire: '<svg ' + ICON_ATTRS + '><path d="M12 2s3 4 3 6.5c0 .8-.3 1.5-.8 2 1.7-1 2.8-2.8 2.3-5.5C19 7 20.5 10 20.5 13c0 4.7-3.8 8.5-8.5 8.5S3.5 17.7 3.5 13c0-3.5 2-6 4-8 .3 2 1.2 3.2 2.5 4C9.5 6.5 10.5 4 12 2z"/></svg>',
    farms: '<svg ' + ICON_ATTRS + '><path d="M12 21V9M12 9C12 5 9 3 9 3s0 3 3 6zM12 9c0-4 3-6 3-6s0 3-3 6zM7 21c0-3 2-5 5-5s5 2 5 5"/></svg>',
    health: '<svg ' + ICON_ATTRS + '><path d="M20.5 8.5c0 5-8.5 11-8.5 11s-8.5-6-8.5-11a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2z"/><path d="M9 9.5h2l1-2 1 3 1-1.5h1.5"/></svg>'
  };

  function icon(name) { return ICONS[name] || ''; }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function bandVarColor(bandName) {
    var key = bandName.toLowerCase().replace(/\s+/g, '-');
    return getCssVar('--band-' + key + '-bg');
  }

  // -----------------------------------------------------------------------
  // Theme
  // -----------------------------------------------------------------------
  function currentTheme() {
    var explicit = document.documentElement.getAttribute('data-theme');
    if (explicit) return explicit;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyStoredTheme() {
    try {
      var stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') {
        document.documentElement.setAttribute('data-theme', stored);
      } else {
        // Dark is the authored default for a first-time visitor: only
        // fall back to the system's light preference, never leave the
        // theme unset (which would let a later prefers-color-scheme
        // media query silently decide it instead of this explicit choice).
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  function initThemeToggle(buttonId, labelId, onChange) {
    applyStoredTheme();
    var label = document.getElementById(labelId);
    if (label) label.textContent = currentTheme() === 'dark' ? 'Light theme' : 'Dark theme';
    var btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      if (label) label.textContent = next === 'dark' ? 'Light theme' : 'Dark theme';
      onChange(next);
    });
  }

  // -----------------------------------------------------------------------
  // Time formatting (Asia/Manila)
  // -----------------------------------------------------------------------
  function formatManilaClock(date) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  function formatManilaFull(date) {
    var fmt = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    return fmt.format(date) + ' PHT';
  }

  function manilaHourLabel(isoUtc) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(isoUtc));
  }

  /** Current fractional hour-of-day in Asia/Manila, e.g. 13.75 for 13:45. */
  function manilaNowFraction() {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    var h = Number(parts.find(function (p) { return p.type === 'hour'; }).value);
    var m = Number(parts.find(function (p) { return p.type === 'minute'; }).value);
    return h + m / 60;
  }

  // -----------------------------------------------------------------------
  // Band badge element — pulses for Danger / Extreme Danger
  // -----------------------------------------------------------------------
  function bandBadge(bandName) {
    var span = document.createElement('span');
    span.className = 'band-badge ' + (BAND_CLASS[bandName] || '') + (PULSE_BANDS[bandName] && !reduceMotion ? ' is-pulsing' : '');
    span.textContent = bandName;
    return span;
  }

  // -----------------------------------------------------------------------
  // Number count-up tween. Guarantees the correct final value via a plain
  // timer, independent of how many rAF frames actually get delivered —
  // heavy synchronous work elsewhere (chart/map creation) can starve rAF
  // well past `duration`, and a screenshot or a slow device must never
  // catch a wrong intermediate number.
  // -----------------------------------------------------------------------
  function tweenNumber(el, toValue, opts) {
    opts = opts || {};
    var suffix = opts.suffix || '';
    var decimals = opts.decimals != null ? opts.decimals : 1;
    var duration = reduceMotion ? 0 : (opts.duration || 260);
    var fromValue = Number(el.getAttribute('data-value')) || 0;
    el.setAttribute('data-value', toValue);
    var finalText = toValue.toFixed(decimals) + suffix;

    if (!duration) {
      el.textContent = finalText;
      return;
    }
    var settled = false;
    var start = null;
    function step(ts) {
      if (settled) return;
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - t, 2);
      var v = fromValue + (toValue - fromValue) * eased;
      el.textContent = v.toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    setTimeout(function () { settled = true; el.textContent = finalText; }, duration + 120);
  }

  // -----------------------------------------------------------------------
  // Competition ranking — UNCHANGED tie-safety. Equal (displayed, rounded)
  // values share a rank; the next distinct value's rank is its position,
  // not rank+1.
  // -----------------------------------------------------------------------
  function competitionRanks(barangays) {
    var sorted = barangays.slice().sort(function (a, b) { return b.current.value - a.current.value; });
    var rankOf = {};
    sorted.forEach(function (b, i) {
      if (i === 0) {
        rankOf[b.name] = 1;
      } else {
        var prev = sorted[i - 1];
        rankOf[b.name] = prev.current.value === b.current.value ? rankOf[prev.name] : i + 1;
      }
    });
    return rankOf;
  }

  /** How many barangays share a given rank (for "TIED #1 (+N more)" copy). */
  function rankCounts(rankOf) {
    var counts = {};
    Object.keys(rankOf).forEach(function (name) {
      var r = rankOf[name];
      counts[r] = (counts[r] || 0) + 1;
    });
    return counts;
  }

  // -----------------------------------------------------------------------
  // Inline SVG sparkline for a barangay's 24h trend — always the real full
  // day, independent of any scrubber.
  // -----------------------------------------------------------------------
  function sparklineSvg(hourly, peakIso, opts) {
    opts = opts || {};
    var w = opts.width || 90, h = opts.height || 26, pad = 3;
    var values = hourly.map(function (h) { return h.value; });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var range = max - min || 1;
    var stepX = (w - pad * 2) / (values.length - 1);

    var points = values.map(function (v, i) {
      var x = pad + i * stepX;
      var y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');

    var peakIdx = hourly.findIndex(function (hh) { return hh.date_time === peakIso; });
    var peakX = pad + peakIdx * stepX;
    var peakY = pad + (1 - (values[peakIdx] - min) / range) * (h - pad * 2);
    var peakColor = bandVarColor(hourly[peakIdx].band);

    return (
      '<svg class="sparkline" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline points="' + points + '" fill="none" stroke="currentColor" stroke-width="1.25" />' +
      '<circle cx="' + peakX.toFixed(1) + '" cy="' + peakY.toFixed(1) + '" r="1.8" fill="' + peakColor + '" />' +
      '</svg>'
    );
  }

  // -----------------------------------------------------------------------
  // City-wide hourly series (min/max/median) — one computation shared by
  // any curve chart and any peak countdown, so they always agree.
  // -----------------------------------------------------------------------
  function median(values) {
    var s = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function computeCitySeries(data) {
    var barangays = data.barangays;
    var hourly = barangays[0].hourly;
    var labels = hourly.map(function (h) { return manilaHourLabel(h.date_time); });
    var minSeries = [], maxSeries = [], medianSeries = [];
    for (var i = 0; i < hourly.length; i++) {
      var valuesAtHour = barangays.map(function (b) { return b.hourly[i].value; });
      minSeries.push(Math.min.apply(null, valuesAtHour));
      maxSeries.push(Math.max.apply(null, valuesAtHour));
      medianSeries.push(Number(median(valuesAtHour).toFixed(1)));
    }
    // Peak hour = when the city MAX is highest, not the median. Anything
    // that displays "now" as a city max (the hero, e.g.) must compare it
    // against the city max at peak — comparing a max to a median made it
    // look like the city was about to cool down when it wasn't.
    var peakIndex = 0;
    maxSeries.forEach(function (v, i) { if (v > maxSeries[peakIndex]) peakIndex = i; });
    return { hourly: hourly, labels: labels, minSeries: minSeries, maxSeries: maxSeries, medianSeries: medianSeries, peakIndex: peakIndex };
  }

  /** Swap each barangay's `.current` for its hourly[index] reading. */
  function scrubbedView(data, hourIndex) {
    return {
      barangays: data.barangays.map(function (b) {
        var h = b.hourly[hourIndex];
        return Object.assign({}, b, { current: { date_time: h.date_time, value: h.value, band: h.band } });
      })
    };
  }

  // -----------------------------------------------------------------------
  // Data loading — the one place both pages fetch from.
  // -----------------------------------------------------------------------
  function loadDashboardData() {
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return Promise.all([
      fetch('data/heat-index-latest.json').then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' loading heat-index-latest.json');
        return res.json();
      }),
      fetch('data/barangay_reference_points.json').then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' loading barangay_reference_points.json');
        return res.json();
      }),
      fontsReady
    ]).then(function (results) {
      var data = results[0];
      var refFile = results[1];
      if (!data.barangays || !data.barangays.length) throw new Error('No barangays in heat-index-latest.json');
      var referenceData = refFile.barangays || [];
      var referenceByName = {};
      referenceData.forEach(function (r) { referenceByName[r.name] = r; });
      return {
        data: data,
        referenceData: referenceData,
        referenceByName: referenceByName,
        citySeries: computeCitySeries(data)
      };
    });
  }

  // -----------------------------------------------------------------------
  // Map — tile layer + dark-theme filter, shared by both pages' maps.
  // Standard OpenStreetMap tiles, not a key-gated dark basemap provider:
  // CARTO's and Stadia's free dark tiles both now require an API key tied
  // to one person's account (verified: CARTO serves an "API KEY REQUIRED"
  // placeholder image at HTTP 200; Stadia returns 401), which conflicts
  // with this project's "no dependency on one person's account" rule. The
  // dark look comes from a CSS filter on the tile pane instead — fully
  // client-side, no server-side dependency beyond OSM itself.
  // -----------------------------------------------------------------------
  function applyMapTileTheme(mapContainerId) {
    var pane = document.querySelector('#' + mapContainerId + ' .leaflet-tile-pane');
    if (!pane) return;
    pane.style.filter = currentTheme() === 'dark'
      ? 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.92) saturate(0.9)'
      : 'none';
  }

  /**
   * Creates a Leaflet map fitted to the given [lat,lng] points. Callers add
   * their own markers after this returns. IMPORTANT: only call this once
   * the container is actually visible (not inside a `hidden` ancestor) —
   * Leaflet's fitBounds() computes against the container's current size,
   * and a hidden (display:none) container has zero size, silently zooming
   * to the wrong level.
   */
  function createBaseMap(containerId, points, opts) {
    opts = opts || {};
    var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    var map = L.map(containerId, {
      dragging: !isTouch,
      tap: !isTouch,
      scrollWheelZoom: false,
      zoomControl: opts.zoomControl !== false,
      // Leaflet's default zoomSnap (1) forces fitBounds onto whole zoom
      // levels, rounding DOWN to guarantee full containment — for a
      // ~35km-wide, oddly-shaped area like Iligan's barangays that can
      // waste up to a full zoom level (~2x too much visible area),
      // rendering Iligan tiny in the middle of three neighboring
      // provinces. A small fractional snap lets it hug the real bounds.
      zoomSnap: 0.1,
      zoomDelta: 0.5
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      subdomains: 'abc',
      maxZoom: 19
    }).addTo(map);
    applyMapTileTheme(containerId);

    var bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: opts.padding || [16, 16] });
    map.setMinZoom(map.getZoom());
    // Padded a bit wider than the strict data bounds so panning to the
    // very edge barangay doesn't feel like hitting a wall, but still far
    // short of the neighboring provinces the old zoom was showing.
    map.setMaxBounds(bounds.pad(0.15));

    if (isTouch) {
      var wrap = document.getElementById(containerId).parentElement;
      var hint = document.createElement('div');
      hint.className = 'map-touch-hint';
      hint.textContent = 'Tap to interact';
      wrap.appendChild(hint);
      hint.addEventListener('touchstart', function () {
        map.dragging.enable();
        if (map.tap) map.tap.enable();
        hint.remove();
      }, { once: true });
    }

    return map;
  }

  window.Shared = {
    reduceMotion: reduceMotion,
    BAND_ORDER: BAND_ORDER,
    BAND_CLASS: BAND_CLASS,
    ROW_CLASS: ROW_CLASS,
    PULSE_BANDS: PULSE_BANDS,
    PENDING_INDICATORS: PENDING_INDICATORS,
    CAUTION_MIN_C: CAUTION_MIN_C,
    EXTREME_CAUTION_MIN_C: EXTREME_CAUTION_MIN_C,
    DANGER_MIN_C: DANGER_MIN_C,
    EXTREME_DANGER_MIN_C: EXTREME_DANGER_MIN_C,
    icon: icon,
    getCssVar: getCssVar,
    bandVarColor: bandVarColor,
    currentTheme: currentTheme,
    initThemeToggle: initThemeToggle,
    formatManilaClock: formatManilaClock,
    formatManilaFull: formatManilaFull,
    manilaHourLabel: manilaHourLabel,
    manilaNowFraction: manilaNowFraction,
    bandBadge: bandBadge,
    tweenNumber: tweenNumber,
    competitionRanks: competitionRanks,
    rankCounts: rankCounts,
    sparklineSvg: sparklineSvg,
    median: median,
    computeCitySeries: computeCitySeries,
    scrubbedView: scrubbedView,
    loadDashboardData: loadDashboardData,
    applyMapTileTheme: applyMapTileTheme,
    createBaseMap: createBaseMap
  };
})();
