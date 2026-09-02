'use strict';

(function () {
  var S = window.Shared;

  var HERO_COLORS = {
    'Caution': ['#0f5f52', '#08312b'],
    'Extreme Caution': ['#7a4a00', '#4a0e12'],
    'Danger': ['#7a2600', '#3a0000'],
    'Extreme Danger': ['#5c0010', '#210005']
  };

  var lastData = null;
  var referenceData = [];
  var referenceByName = {};
  var citySeries = null;
  var drawerChart = null;
  var map = null;
  var markersByName = {};

  var scrubState = { index: 0, playing: false, rafId: null, lastTick: 0 };
  var SCRUB_HOURS = 24;
  var AUTOPLAY_MS_PER_HOUR = 250;

  function nowIndex() {
    return Math.round(Math.max(0, Math.min(SCRUB_HOURS - 1, S.manilaNowFraction())));
  }

  // -----------------------------------------------------------------------
  // Hero
  // -----------------------------------------------------------------------
  function renderHero(data) {
    var barangays = data.barangays;
    var maxValue = Math.max.apply(null, barangays.map(function (b) { return b.current.value; }));
    var leaders = barangays.filter(function (b) { return b.current.value === maxValue; });
    var band = leaders[0].current.band;

    S.tweenNumber(document.getElementById('hero-number'), maxValue, { suffix: '°C', duration: 900 });

    var pill = document.getElementById('hero-band-pill');
    pill.textContent = band;
    pill.className = 'hero-band-pill ' + (S.BAND_CLASS[band] || '');

    var colors = HERO_COLORS[band] || HERO_COLORS['Caution'];
    document.getElementById('hero-gradient').style.setProperty('--hero-c1', colors[0]);
    document.getElementById('hero-gradient').style.setProperty('--hero-c2', colors[1]);

    var dot = document.getElementById('wordmark-dot');
    dot.className = 'wordmark-dot ' + (S.BAND_CLASS[band] || '');

    var names = leaders.map(function (b) { return b.name; });
    var tieListEl = document.getElementById('hero-tie-list');
    var sentence;
    if (names.length === 1) {
      sentence = names[0] + ' is the city’s hottest barangay right now.';
      tieListEl.style.display = 'none';
    } else {
      // Lead with the sentence, not a wall of names — the names stay in the
      // DOM (so screen readers always have them) behind a native <details>
      // disclosure that's visually collapsed until the reader opts in.
      sentence = names.length + ' of ' + barangays.length + ' barangays are tied at the city’s hottest right now.';
      tieListEl.style.display = '';
      tieListEl.open = false;
      document.getElementById('hero-tie-summary').textContent = 'See all ' + names.length;
      var chipsWrap = document.getElementById('hero-tie-chips');
      chipsWrap.innerHTML = '';
      leaders.forEach(function (b) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tier-chip';
        chip.textContent = b.name;
        chip.addEventListener('click', function (e) { e.stopPropagation(); openDrawer(b.name); });
        chipsWrap.appendChild(chip);
      });
    }
    document.getElementById('hero-sentence').textContent = sentence;
  }

  function tickHeroPeak() {
    var peakDate = new Date(citySeries.hourly[citySeries.peakIndex].date_time);
    // City MAXIMUM at peak hour — compared like-for-like against the hero
    // number above, which is also the city maximum (right now). Comparing
    // a max to a median made it read as "about to cool down" when it wasn't.
    var peakValue = citySeries.maxSeries[citySeries.peakIndex];
    var peakTimeLabel = S.manilaHourLabel(citySeries.hourly[citySeries.peakIndex].date_time);
    var diffMs = peakDate.getTime() - Date.now();
    var peakEl = document.getElementById('hero-peak');
    var detailEl = document.getElementById('hero-peak-detail');

    if (diffMs <= 0) {
      peakEl.textContent = 'PEAK PASSED ' + peakTimeLabel;
      detailEl.textContent = peakValue.toFixed(1) + '°C city maximum';
      return;
    }
    var totalMin = Math.floor(diffMs / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    peakEl.textContent = 'PEAK IN ' + h + 'H ' + m + 'M';
    detailEl.textContent = peakTimeLabel + ' PHT · ' + peakValue.toFixed(1) + '°C expected (city maximum)';
  }

  // -----------------------------------------------------------------------
  // Heat tier cards — one card per distinct heat-index value (not an
  // arbitrary "top 5 barangays"), hottest first, up to 5 tiers.
  // -----------------------------------------------------------------------
  var CHIP_COLLAPSE_THRESHOLD = 6;

  function buildTiers(barangays) {
    var groups = {};
    var order = [];
    barangays.forEach(function (b) {
      var key = b.current.value.toFixed(1);
      if (!groups[key]) { groups[key] = { value: b.current.value, band: b.current.band, barangays: [] }; order.push(key); }
      groups[key].barangays.push(b);
    });
    return order.map(function (k) { return groups[k]; }).sort(function (a, b) { return b.value - a.value; });
  }

  function renderTierChips(container, barangays) {
    container.innerHTML = '';
    var collapse = barangays.length > CHIP_COLLAPSE_THRESHOLD;
    var visible = collapse ? barangays.slice(0, CHIP_COLLAPSE_THRESHOLD) : barangays;
    var hidden = collapse ? barangays.slice(CHIP_COLLAPSE_THRESHOLD) : [];

    function makeChip(b) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tier-chip';
      chip.textContent = b.name;
      chip.addEventListener('click', function (e) { e.stopPropagation(); openDrawer(b.name); });
      return chip;
    }

    visible.forEach(function (b) { container.appendChild(makeChip(b)); });

    if (hidden.length) {
      var hiddenWrap = document.createElement('span');
      hiddenWrap.hidden = true;
      hidden.forEach(function (b) { hiddenWrap.appendChild(makeChip(b)); });

      var moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'tier-chip-more';
      moreBtn.textContent = 'Show all ' + barangays.length;
      moreBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        hiddenWrap.hidden = false;
        Array.from(hiddenWrap.children).forEach(function (chip) { container.insertBefore(chip, moreBtn); });
        moreBtn.remove();
      });
      container.appendChild(hiddenWrap);
      container.appendChild(moreBtn);
    }
  }

  function renderHeatTiers(data) {
    var tiers = buildTiers(data.barangays).slice(0, 5);
    var maxCount = Math.max.apply(null, tiers.map(function (t) { return t.barangays.length; }));

    var wrap = document.getElementById('tier-cards');
    wrap.innerHTML = '';
    tiers.forEach(function (tier) {
      var count = tier.barangays.length;
      var rep = tier.barangays[0];

      var card = document.createElement('article');
      card.className = 'tier-card';
      card.style.setProperty('--card-band', S.bandVarColor(tier.band));

      card.innerHTML =
        '<div class="tier-card-value">' + tier.value.toFixed(1) + '°C</div>' +
        '<div class="tier-card-count">' + count + (count === 1 ? ' barangay' : ' barangays') + '</div>' +
        '<div class="tier-count-bar"><div class="tier-count-bar-fill" style="width:' + Math.round((count / maxCount) * 100) + '%"></div></div>' +
        '<div class="tier-card-spark">' + S.sparklineSvg(rep.hourly, rep.today_peak.date_time, { width: 180, height: 36 }) + '</div>';

      var bandSlot = document.createElement('span');
      bandSlot.appendChild(S.bandBadge(tier.band));
      card.appendChild(bandSlot);

      var chips = document.createElement('div');
      chips.className = 'tier-chips';
      card.appendChild(chips);
      renderTierChips(chips, tier.barangays);

      wrap.appendChild(card);
    });
  }

  // -----------------------------------------------------------------------
  // Map (public: glowing, gently pulsing points; scrubber scoped to the map
  // only — the hero/cards/story above stay pinned to the true current
  // reading so the landing narrative never reads as ambiguous)
  // -----------------------------------------------------------------------
  function initMap(data) {
    var points = data.barangays.map(function (b) { return [b.latitude, b.longitude]; });
    map = S.createBaseMap('public-map', points, { padding: [24, 24] });

    data.barangays.forEach(function (b) {
      var ref = referenceByName[b.name];
      var lowConfidence = ref && ref.coordinate_confidence === 'low';
      var marker = L.circleMarker([b.latitude, b.longitude], {
        radius: 7,
        className: S.reduceMotion ? '' : 'pulse-marker map-glow-marker',
        color: lowConfidence ? S.bandVarColor(b.current.band) : 'transparent',
        weight: 2,
        dashArray: lowConfidence ? '2,2' : null,
        fillColor: S.bandVarColor(b.current.band),
        fillOpacity: lowConfidence ? 0.15 : 0.85
      });
      marker.bindTooltip(b.name, { direction: 'top' });
      marker.on('click', function () { openDrawer(b.name); });
      marker.addTo(map);
      markersByName[b.name] = marker;
    });

    S.BAND_ORDER.forEach(function (band) {
      var item = document.createElement('span');
      item.className = 'map-legend-item';
      item.innerHTML = '<span class="map-legend-swatch" style="background:' + S.bandVarColor(band) + '"></span>' + band;
      document.getElementById('map-legend').appendChild(item);
    });
    var lowItem = document.createElement('span');
    lowItem.className = 'map-legend-item';
    lowItem.innerHTML = '<span class="map-legend-swatch low-confidence"></span>Low-confidence coordinate (e.g. Tambacan)';
    document.getElementById('map-legend').appendChild(lowItem);
  }

  function updateMapForScrub() {
    var view = S.scrubbedView(lastData, scrubState.index);
    view.barangays.forEach(function (b) {
      var marker = markersByName[b.name];
      if (!marker) return;
      var ref = referenceByName[b.name];
      var lowConfidence = ref && ref.coordinate_confidence === 'low';
      marker.setStyle({
        fillColor: S.bandVarColor(b.current.band),
        color: lowConfidence ? S.bandVarColor(b.current.band) : 'transparent'
      });
    });
    document.getElementById('scrubber-readout').textContent = S.manilaHourLabel(lastData.barangays[0].hourly[scrubState.index].date_time);
  }

  function setScrubIndex(i) {
    scrubState.index = Math.max(0, Math.min(SCRUB_HOURS - 1, i));
    document.getElementById('scrubber-range').value = scrubState.index;
    updateMapForScrub();
  }

  function stopAutoplay() {
    scrubState.playing = false;
    if (scrubState.rafId) cancelAnimationFrame(scrubState.rafId);
    document.getElementById('scrubber-play').innerHTML = '&#9654;';
  }

  function startAutoplay() {
    if (S.reduceMotion) return;
    scrubState.playing = true;
    scrubState.lastTick = performance.now();
    document.getElementById('scrubber-play').innerHTML = '&#10074;&#10074;';
    function loop(ts) {
      if (!scrubState.playing) return;
      if (ts - scrubState.lastTick >= AUTOPLAY_MS_PER_HOUR) {
        scrubState.lastTick = ts;
        var next = scrubState.index + 1;
        if (next >= SCRUB_HOURS) next = 0;
        setScrubIndex(next);
      }
      scrubState.rafId = requestAnimationFrame(loop);
    }
    scrubState.rafId = requestAnimationFrame(loop);
  }

  function initScrubber() {
    var range = document.getElementById('scrubber-range');
    range.addEventListener('input', function () { stopAutoplay(); setScrubIndex(Number(range.value)); });
    document.getElementById('scrubber-play').addEventListener('click', function () {
      if (scrubState.playing) stopAutoplay(); else startAutoplay();
    });
  }

  // -----------------------------------------------------------------------
  // Elevation story (Section 4) — fixed left padding so the rotated Y-axis
  // title never clips against the canvas edge.
  // -----------------------------------------------------------------------
  var elevationChart = null;

  function renderElevationSentence(data) {
    var barangays = data.barangays;
    var maxValue = Math.max.apply(null, barangays.map(function (b) { return b.current.value; }));
    var hottestLeaders = barangays.filter(function (b) { return b.current.value === maxValue; });
    var hotBarangay = hottestLeaders.reduce(function (a, b) { return b.elevation_m < a.elevation_m ? b : a; });
    var coolestElevationBarangay = barangays.reduce(function (a, b) { return b.elevation_m > a.elevation_m ? b : a; });
    var diff = Math.round(hotBarangay.current.value - coolestElevationBarangay.current.value);
    var lowPhrase = hotBarangay.elevation_m <= 5 ? 'at sea level' : ('near ' + hotBarangay.elevation_m + 'm elevation');

    document.getElementById('elevation-sentence').textContent =
      'Iligan’s heat risk sits on the coast. Barangays ' + lowPhrase + ' today run about ' + diff +
      '°C hotter than ' + coolestElevationBarangay.name + ' at ' + coolestElevationBarangay.elevation_m + ' metres.';
  }

  function renderElevationChart(data) {
    var barangays = data.barangays;
    var muted = S.getCssVar('--text-muted');
    var border = S.getCssVar('--border');

    var ctx = document.getElementById('chart-elevation').getContext('2d');
    elevationChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          data: barangays.map(function (b) { return { x: b.elevation_m, y: b.current.value, name: b.name, band: b.current.band }; }),
          backgroundColor: barangays.map(function (b) { return S.bandVarColor(b.current.band); }),
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { left: 6, top: 4, bottom: 2, right: 10 } },
        onClick: function (evt, elements) { if (elements.length) openDrawer(barangays[elements[0].index].name); },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.raw.name + ': ' + c.raw.y.toFixed(1) + '°C at ' + c.raw.x + 'm (' + c.raw.band + ')'; } } },
          // Auto-scaling to the data range (today: ~31-40°C) hid where the
          // Caution band itself starts. Extending the floor down to it and
          // drawing the real threshold (not a rounded guess) gives the
          // chart a fixed, honest frame instead of one that stretches
          // day to day.
          annotation: {
            annotations: {
              cautionLine: {
                type: 'line', yMin: S.CAUTION_MIN_C, yMax: S.CAUTION_MIN_C,
                borderColor: S.bandVarColor('Caution'), borderWidth: 1, borderDash: [4, 4],
                label: {
                  display: true, content: 'Caution ' + S.CAUTION_MIN_C.toFixed(1) + '°C', position: 'end',
                  color: S.bandVarColor('Caution'), font: { size: 10, family: S.getCssVar('--font-mono') },
                  backgroundColor: S.getCssVar('--surface')
                }
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Elevation (m)', color: muted, font: { family: S.getCssVar('--font-mono') }, padding: { top: 8 } },
            ticks: { color: muted, font: { family: S.getCssVar('--font-mono') } }, grid: { color: border }
          },
          y: {
            min: 26,
            title: { display: true, text: 'Heat index (°C)', color: muted, font: { family: S.getCssVar('--font-mono') }, padding: { bottom: 8 } },
            ticks: { color: muted, font: { family: S.getCssVar('--font-mono') } }, grid: { color: border }
          }
        }
      }
    });
  }

  // -----------------------------------------------------------------------
  // ESG reframe (Section 5)
  // -----------------------------------------------------------------------
  function renderReframe(data) {
    var barangays = data.barangays;
    var hottest = barangays.reduce(function (a, b) { return b.current.value > a.current.value ? b : a; });
    document.getElementById('reframe-e-value').textContent = hottest.current.value.toFixed(1) + '°C';

    document.getElementById('icon-e').innerHTML = S.icon('environmental');
    document.getElementById('icon-s').innerHTML = S.icon('social');
    document.getElementById('icon-g').innerHTML = S.icon('governance');
    document.getElementById('icon-rainfall').innerHTML = S.icon('rainfall');
    document.getElementById('icon-water').innerHTML = S.icon('water');
    document.getElementById('icon-fire').innerHTML = S.icon('fire');
    document.getElementById('icon-social-1').innerHTML = S.icon('social');
    document.getElementById('icon-health').innerHTML = S.icon('health');
    document.getElementById('icon-farms').innerHTML = S.icon('farms');
    document.getElementById('icon-gov').innerHTML = S.icon('governance');
  }

  // -----------------------------------------------------------------------
  // Detail drawer (shared markup/behavior with the ops view; ported here
  // so the public cards/map can open it too)
  // -----------------------------------------------------------------------
  function openDrawer(name) {
    var b = lastData.barangays.find(function (x) { return x.name === name; });
    if (!b) return;
    var ref = referenceByName[name];

    document.getElementById('drawer-title').textContent = b.name;
    document.getElementById('drawer-basics').innerHTML =
      '<dt>PSGC</dt><dd>' + (ref ? ref.psgc_code_9 : '—') + '</dd>' +
      '<dt>Coordinates</dt><dd>' + b.latitude.toFixed(5) + ', ' + b.longitude.toFixed(5) + '</dd>' +
      '<dt>Elevation</dt><dd>' + b.elevation_m + ' m</dd>';

    document.getElementById('drawer-current').innerHTML =
      '<dt>Now</dt><dd>' + b.current.value.toFixed(1) + '°C</dd>' +
      '<dt>Band</dt><dd id="drawer-band-slot"></dd>' +
      '<dt>Today\'s Peak</dt><dd>' + b.today_peak.value.toFixed(1) + '°C</dd>' +
      '<dt>Peak Time</dt><dd>' + S.manilaHourLabel(b.today_peak.date_time) + '</dd>';
    document.getElementById('drawer-band-slot').appendChild(S.bandBadge(b.current.band));

    if (drawerChart) { drawerChart.destroy(); drawerChart = null; }
    var muted = S.getCssVar('--text-muted');
    var accent = S.getCssVar('--accent');
    var ctx = document.getElementById('drawer-chart').getContext('2d');
    drawerChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: b.hourly.map(function (h) { return S.manilaHourLabel(h.date_time); }),
        datasets: [{ data: b.hourly.map(function (h) { return h.value; }), borderColor: accent, backgroundColor: accent, borderWidth: 2, pointRadius: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              peak: {
                type: 'point',
                xValue: b.hourly.findIndex(function (h) { return h.date_time === b.today_peak.date_time; }),
                yValue: b.today_peak.value,
                backgroundColor: S.getCssVar('--accent-amber'), radius: 4
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: muted, font: { family: S.getCssVar('--font-mono'), size: 9 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 10 }, grid: { display: false } },
          y: { ticks: { color: muted, font: { family: S.getCssVar('--font-mono'), size: 9 } }, grid: { color: S.getCssVar('--border') } }
        }
      }
    });

    var timeline = document.getElementById('drawer-timeline');
    timeline.innerHTML = '';
    b.hourly.forEach(function (h) {
      var seg = document.createElement('div');
      seg.className = 'band-timeline-seg';
      seg.style.background = S.bandVarColor(h.band);
      seg.title = S.manilaHourLabel(h.date_time) + ' — ' + h.band;
      timeline.appendChild(seg);
    });

    var owed = document.getElementById('drawer-owed');
    owed.innerHTML = '';
    ['E', 'S', 'G'].forEach(function (pillar) {
      S.PENDING_INDICATORS[pillar].forEach(function (item) {
        var li = document.createElement('li');
        li.innerHTML = '<strong>' + item.label + '</strong> — <span class="owner">owning office: ' + item.office + '</span>';
        owed.appendChild(li);
      });
    });

    var prov = document.getElementById('drawer-provenance');
    if (ref) {
      var confClass = ref.coordinate_confidence === 'low' ? ' class="confidence-low"' : '';
      prov.innerHTML =
        '<dt>Method</dt><dd>' + ref.coordinate_method + '</dd>' +
        '<dt>Source</dt><dd>' + ref.coordinate_source + '</dd>' +
        '<dt>Confidence</dt><dd' + confClass + '>' + ref.coordinate_confidence.toUpperCase() + (ref.coordinate_confidence === 'low' ? ' — treat as indicative only' : '') + '</dd>' +
        '<dt>Status</dt><dd>' + ref.coordinate_status + '</dd>';
    } else {
      prov.innerHTML = '<dt>Provenance</dt><dd>Not found in barangay_reference_points.json</dd>';
    }

    document.getElementById('drawer').hidden = false;
    requestAnimationFrame(function () {
      document.getElementById('drawer').classList.add('is-open');
      document.getElementById('drawer-backdrop').classList.add('is-open');
    });
  }

  function closeDrawer() {
    var drawer = document.getElementById('drawer');
    drawer.classList.remove('is-open');
    document.getElementById('drawer-backdrop').classList.remove('is-open');
    setTimeout(function () { drawer.hidden = true; }, S.reduceMotion ? 0 : 200);
  }

  function initDrawer() {
    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.getElementById('drawer').classList.contains('is-open')) closeDrawer();
    });
  }

  // -----------------------------------------------------------------------
  // Scroll reveal — visible by default; IntersectionObserver adds
  // .will-reveal + .is-revealed only once a section nears the viewport.
  // -----------------------------------------------------------------------
  function initScrollReveal() {
    if (S.reduceMotion || !window.IntersectionObserver) return;
    var sections = document.querySelectorAll('.reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    sections.forEach(function (el) {
      el.classList.add('will-reveal');
      io.observe(el);
    });
  }

  // -----------------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------------
  if (window.Chart && window['chartjs-plugin-annotation'] && !Chart.registry.plugins.get('annotation')) {
    Chart.register(window['chartjs-plugin-annotation']);
  }

  S.initThemeToggle('theme-toggle', 'theme-toggle-label', function () {
    S.applyMapTileTheme('public-map');
    if (lastData) renderHero(lastData); // refresh gradient/pill colors against new theme tokens
  });

  S.loadDashboardData()
    .then(function (result) {
      lastData = result.data;
      referenceData = result.referenceData;
      referenceByName = result.referenceByName;
      citySeries = result.citySeries;
      scrubState.index = nowIndex();

      renderHero(lastData);
      tickHeroPeak();
      setInterval(tickHeroPeak, 1000);

      renderHeatTiers(lastData);
      renderElevationSentence(lastData);
      renderReframe(lastData);

      document.getElementById('footer-updated').textContent = S.formatManilaFull(new Date(lastData.generated_at));
      document.getElementById('scrubber-range').value = scrubState.index;
      document.getElementById('scrubber-readout').textContent = S.manilaHourLabel(lastData.barangays[0].hourly[scrubState.index].date_time);

      initDrawer();

      document.getElementById('load-state').hidden = true;
      document.getElementById('app').hidden = false;

      // See Shared.createBaseMap's doc comment: must run after #app is
      // visible, or fitBounds computes against a zero-size container.
      initMap(lastData);
      renderElevationChart(lastData);
      initScrubber();
      initScrollReveal();
    })
    .catch(function (err) {
      var el = document.getElementById('load-state');
      el.textContent = 'Could not load dashboard data (' + err.message + '). Run scripts/fetch/fetch-heat-index.js, then reload.';
      el.className = 'load-state error';
    });
})();
