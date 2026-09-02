'use strict';

(function () {
  var THEME_KEY = 'iligan-dashboard-theme';
  var STALE_HOURS = 3;

  // Same NWS/Rothfusz band boundaries used server-side in scripts/fetch/heat-index.js's
  // band() function, expressed in Celsius for the chart's threshold lines.
  var EXTREME_CAUTION_MIN_C = ((90 - 32) * 5) / 9; // 32.2
  var DANGER_MIN_C = ((105 - 32) * 5) / 9; // 40.6

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

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function bandVarColor(bandName) {
    var key = bandName.toLowerCase().replace(/\s+/g, '-');
    return getCssVar('--band-' + key + '-bg');
  }

  // ---------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------
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
      }
    } catch (e) { /* localStorage unavailable; fall back to system preference */ }
  }

  function updateThemeLabel() {
    var label = document.getElementById('theme-toggle-label');
    label.textContent = currentTheme() === 'dark' ? 'Light theme' : 'Dark theme';
  }

  function initThemeToggle(onChange) {
    applyStoredTheme();
    updateThemeLabel();
    document.getElementById('theme-toggle').addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      updateThemeLabel();
      onChange();
    });
  }

  // ---------------------------------------------------------------------
  // Time formatting (Asia/Manila)
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Freshness chip
  // ---------------------------------------------------------------------
  function updateFreshnessChip(generatedAtIso) {
    var chip = document.getElementById('freshness-chip');
    var generated = new Date(generatedAtIso);
    var ageHours = (Date.now() - generated.getTime()) / 3600000;

    chip.classList.remove('chip-fresh', 'chip-stale');
    if (ageHours > STALE_HOURS) {
      chip.textContent = 'STALE — last updated ' + Math.floor(ageHours) + 'h ago';
      chip.classList.add('chip-stale');
    } else {
      chip.textContent = 'UPDATED ' + formatManilaClock(generated) + ' PHT';
      chip.classList.add('chip-fresh');
    }
  }

  // ---------------------------------------------------------------------
  // Band badge element
  // ---------------------------------------------------------------------
  function bandBadge(bandName) {
    var span = document.createElement('span');
    span.className = 'band-badge ' + (BAND_CLASS[bandName] || '');
    span.textContent = bandName;
    return span;
  }

  // ---------------------------------------------------------------------
  // ESG scorecard (E tile only — S/G are static pending markup in the HTML)
  // ---------------------------------------------------------------------
  function renderScorecard(data) {
    var barangays = data.barangays;
    var hottest = barangays.reduce(function (a, b) { return b.current.value > a.current.value ? b : a; });
    var coolest = barangays.reduce(function (a, b) { return b.current.value < a.current.value ? b : a; });
    var bandCounts = {};
    barangays.forEach(function (b) { bandCounts[b.current.band] = (bandCounts[b.current.band] || 0) + 1; });

    document.getElementById('e-metric').textContent = hottest.current.value.toFixed(1) + '°C';
    var parts = BAND_ORDER.filter(function (b) { return bandCounts[b]; })
      .map(function (b) { return bandCounts[b] + ' ' + b; });
    document.getElementById('e-detail').textContent =
      'Heat index, ' + barangays.length + ' of 44 barangays reporting — ' + parts.join(', ') +
      '. Range ' + coolest.current.value.toFixed(1) + '–' + hottest.current.value.toFixed(1) + '°C.';
  }

  // ---------------------------------------------------------------------
  // Hero — all tied leaders, never a single arbitrary winner
  // ---------------------------------------------------------------------
  function renderHero(data) {
    var barangays = data.barangays;
    var maxValue = Math.max.apply(null, barangays.map(function (b) { return b.current.value; }));
    var leaders = barangays.filter(function (b) { return b.current.value === maxValue; });

    document.getElementById('hero-names').textContent = leaders.map(function (b) { return b.name; }).join(', ');
    document.getElementById('hero-count-suffix').textContent = leaders.length > 1 ? ' (' + leaders.length + ' tied)' : '';
    document.getElementById('hero-value').textContent = maxValue.toFixed(1) + '°C';
    var bandEl = document.getElementById('hero-band');
    bandEl.innerHTML = '';
    bandEl.appendChild(bandBadge(leaders[0].current.band));
    document.getElementById('hero-time').textContent = formatManilaFull(new Date(leaders[0].current.date_time));
  }

  // ---------------------------------------------------------------------
  // Competition ranking: equal (displayed, rounded) values share a rank;
  // the next distinct value's rank is its position, not rank+1.
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Inline SVG sparkline for the 24h trend column
  // ---------------------------------------------------------------------
  function sparklineSvg(hourly, peakIso) {
    var w = 90, h = 26, pad = 3;
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

  // ---------------------------------------------------------------------
  // Table
  // ---------------------------------------------------------------------
  var tableSortState = { key: 'current', dir: 'desc' };

  function renderTable(data) {
    var barangays = data.barangays;
    var rankOf = competitionRanks(barangays);

    function draw() {
      var rows = barangays.slice();
      rows.sort(function (a, b) {
        var dir = tableSortState.dir === 'asc' ? 1 : -1;
        if (tableSortState.key === 'name') return a.name.localeCompare(b.name) * dir;
        if (tableSortState.key === 'peak') return (a.today_peak.value - b.today_peak.value) * dir;
        return (a.current.value - b.current.value) * dir;
      });

      var tbody = document.getElementById('table-body');
      tbody.innerHTML = '';
      rows.forEach(function (b) {
        var tr = document.createElement('tr');
        tr.className = ROW_CLASS[b.current.band] || '';

        var tdRank = document.createElement('td');
        tdRank.className = 'rank-cell';
        tdRank.textContent = '#' + rankOf[b.name];
        tr.appendChild(tdRank);

        var tdName = document.createElement('td');
        tdName.textContent = b.name;
        tr.appendChild(tdName);

        var tdCurrent = document.createElement('td');
        tdCurrent.className = 'value-cell';
        tdCurrent.textContent = b.current.value.toFixed(1);
        tr.appendChild(tdCurrent);

        var tdBand = document.createElement('td');
        tdBand.appendChild(bandBadge(b.current.band));
        tr.appendChild(tdBand);

        var tdPeak = document.createElement('td');
        tdPeak.className = 'value-cell';
        tdPeak.textContent = b.today_peak.value.toFixed(1);
        tr.appendChild(tdPeak);

        var tdPeakTime = document.createElement('td');
        tdPeakTime.className = 'peak-time-cell';
        tdPeakTime.textContent = manilaHourLabel(b.today_peak.date_time);
        tr.appendChild(tdPeakTime);

        var tdSpark = document.createElement('td');
        tdSpark.innerHTML = sparklineSvg(b.hourly, b.today_peak.date_time);
        tr.appendChild(tdSpark);

        tbody.appendChild(tr);
      });
    }

    draw();
    document.querySelectorAll('th[data-sort]').forEach(function (th) {
      function activate() {
        var key = th.getAttribute('data-sort');
        if (tableSortState.key === key) {
          tableSortState.dir = tableSortState.dir === 'asc' ? 'desc' : 'asc';
        } else {
          tableSortState.key = key;
          tableSortState.dir = key === 'name' ? 'asc' : 'desc';
        }
        draw();
      }
      th.addEventListener('click', activate);
      th.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    });
  }

  // ---------------------------------------------------------------------
  // Charts
  // ---------------------------------------------------------------------
  var chartInstances = {};

  function destroyChart(key) {
    if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
  }

  function median(values) {
    var s = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function renderCurveChart(data) {
    destroyChart('curve');
    var barangays = data.barangays;
    var hourCount = barangays[0].hourly.length;
    var labels = barangays[0].hourly.map(function (h) { return manilaHourLabel(h.date_time); });

    var minSeries = [], maxSeries = [], medianSeries = [];
    for (var i = 0; i < hourCount; i++) {
      var valuesAtHour = barangays.map(function (b) { return b.hourly[i].value; });
      minSeries.push(Math.min.apply(null, valuesAtHour));
      maxSeries.push(Math.max.apply(null, valuesAtHour));
      medianSeries.push(Number(median(valuesAtHour).toFixed(1)));
    }

    var text = getCssVar('--text');
    var muted = getCssVar('--text-muted');
    var border = getCssVar('--border');
    var accent = getCssVar('--accent');

    var peakStart = labels.indexOf('12:00');
    var peakEnd = labels.indexOf('15:00');

    var ctx = document.getElementById('chart-curve').getContext('2d');
    chartInstances.curve = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'City max',
            data: maxSeries,
            borderColor: 'transparent',
            pointRadius: 0,
            fill: false,
            order: 2
          },
          {
            label: 'City min–max range',
            data: minSeries,
            borderColor: 'transparent',
            backgroundColor: accent + '26',
            pointRadius: 0,
            fill: '-1',
            order: 2
          },
          {
            label: 'City median',
            data: medianSeries,
            borderColor: accent,
            backgroundColor: accent,
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: text, font: { family: getCssVar('--font-ui') } } },
          tooltip: {
            callbacks: {
              label: function (ctx2) { return ctx2.dataset.label + ': ' + ctx2.parsed.y.toFixed(1) + '°C'; }
            }
          },
          annotation: (peakStart >= 0 && peakEnd >= 0) ? {
            annotations: {
              peakWindow: {
                type: 'box',
                xMin: peakStart, xMax: peakEnd,
                backgroundColor: accent + '14',
                borderWidth: 0,
                label: {
                  display: true, content: 'Peak window', position: 'start',
                  color: muted, font: { size: 10, family: getCssVar('--font-mono') }
                }
              },
              extremeCautionLine: {
                type: 'line', yMin: EXTREME_CAUTION_MIN_C, yMax: EXTREME_CAUTION_MIN_C,
                borderColor: getCssVar('--band-extreme-caution-bg'), borderWidth: 1, borderDash: [4, 4],
                label: {
                  display: true, content: 'Extreme Caution ' + EXTREME_CAUTION_MIN_C.toFixed(1) + '°C',
                  position: 'end', color: getCssVar('--band-extreme-caution-bg'),
                  font: { size: 10, family: getCssVar('--font-mono') }, backgroundColor: 'transparent'
                }
              },
              dangerLine: {
                type: 'line', yMin: DANGER_MIN_C, yMax: DANGER_MIN_C,
                borderColor: getCssVar('--band-danger-bg'), borderWidth: 1, borderDash: [4, 4],
                label: {
                  display: true, content: 'Danger ' + DANGER_MIN_C.toFixed(1) + '°C',
                  position: 'end', color: getCssVar('--band-danger-bg'),
                  font: { size: 10, family: getCssVar('--font-mono') }, backgroundColor: 'transparent'
                }
              }
            }
          } : {}
        },
        scales: {
          x: { ticks: { color: muted, font: { family: getCssVar('--font-mono') }, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 }, grid: { color: border } },
          y: { ticks: { color: muted, font: { family: getCssVar('--font-mono') }, callback: function (v) { return v + '°C'; } }, grid: { color: border } }
        }
      }
    });
  }

  var rankMode = 'current';

  function barEndLabelsPlugin() {
    return {
      id: 'barEndLabels',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx;
        var meta = chart.getDatasetMeta(0);
        var text = getCssVar('--text');
        var font = getCssVar('--font-mono');
        ctx.save();
        ctx.fillStyle = text;
        ctx.font = '600 11px ' + font;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        meta.data.forEach(function (bar, i) {
          var value = chart.data.datasets[0].data[i];
          ctx.fillText(value.toFixed(1) + '°C', bar.x + 6, bar.y);
        });
        ctx.restore();
      }
    };
  }

  function renderRankedChart(data) {
    destroyChart('ranked');
    var basisKey = rankMode === 'peak' ? 'today_peak' : 'current';
    var top = data.barangays.slice()
      .sort(function (a, b) { return b[basisKey].value - a[basisKey].value; })
      .slice(0, 15);

    var muted = getCssVar('--text-muted');
    var border = getCssVar('--border');
    var text = getCssVar('--text');

    var ctx = document.getElementById('chart-ranked').getContext('2d');
    chartInstances.ranked = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top.map(function (b) { return b.name; }),
        datasets: [{
          data: top.map(function (b) { return b[basisKey].value; }),
          backgroundColor: top.map(function (b) { return bandVarColor(b[basisKey].band); }),
          borderRadius: 3,
          maxBarThickness: 18
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.parsed.x.toFixed(1) + '°C'; } } } },
        scales: {
          x: { ticks: { color: muted, font: { family: getCssVar('--font-mono') } }, grid: { color: border } },
          y: { ticks: { color: text, font: { family: getCssVar('--font-ui'), size: 11 } }, grid: { display: false } }
        }
      },
      plugins: [barEndLabelsPlugin()]
    });
  }

  function renderElevationChart(data) {
    destroyChart('elevation');
    var barangays = data.barangays;
    var muted = getCssVar('--text-muted');
    var border = getCssVar('--border');

    var maxElev = barangays.reduce(function (a, b) { return b.elevation_m > a.elevation_m ? b : a; });
    var maxCurrent = Math.max.apply(null, barangays.map(function (b) { return b.current.value; }));
    var hottestLowland = barangays.filter(function (b) { return b.current.value === maxCurrent; })
      .reduce(function (a, b) { return b.elevation_m < a.elevation_m ? b : a; });
    var labeled = { };
    labeled[maxElev.name] = true;
    labeled[hottestLowland.name] = true;

    // Push each label away from whichever chart edge its point sits nearest,
    // so it stays inside the (clipped) plot area instead of running off the
    // top/right when the point itself sits near an axis extreme.
    var elevExtent = [Math.min.apply(null, barangays.map(function (b) { return b.elevation_m; })), Math.max.apply(null, barangays.map(function (b) { return b.elevation_m; }))];
    var valueExtent = [Math.min.apply(null, barangays.map(function (b) { return b.current.value; })), Math.max.apply(null, barangays.map(function (b) { return b.current.value; }))];
    function labelAdjust(b) {
      var xRatio = (b.elevation_m - elevExtent[0]) / (elevExtent[1] - elevExtent[0] || 1);
      var yRatio = (b.current.value - valueExtent[0]) / (valueExtent[1] - valueExtent[0] || 1);
      return { xAdjust: xRatio > 0.6 ? -55 : 55, yAdjust: yRatio > 0.6 ? 22 : -22 };
    }

    var ctx = document.getElementById('chart-elevation').getContext('2d');
    chartInstances.elevation = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          data: barangays.map(function (b) { return { x: b.elevation_m, y: b.current.value, name: b.name, band: b.current.band }; }),
          backgroundColor: barangays.map(function (b) { return bandVarColor(b.current.band); }),
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.raw.name + ': ' + c.raw.y.toFixed(1) + '°C at ' + c.raw.x + 'm (' + c.raw.band + ')'; } } },
          annotation: {
            annotations: barangays.filter(function (b) { return labeled[b.name]; }).reduce(function (acc, b, i) {
              var adjust = labelAdjust(b);
              acc['label' + i] = {
                type: 'label',
                xValue: b.elevation_m, yValue: b.current.value,
                content: [b.name, b.elevation_m + 'm, ' + b.current.value.toFixed(1) + '°C'],
                color: getCssVar('--text'),
                font: { size: 10, family: getCssVar('--font-mono') },
                xAdjust: adjust.xAdjust,
                yAdjust: adjust.yAdjust,
                backgroundColor: getCssVar('--surface') + 'cc'
              };
              return acc;
            }, {})
          }
        },
        scales: {
          x: { title: { display: true, text: 'Elevation (m)', color: muted, font: { family: getCssVar('--font-ui') } }, ticks: { color: muted, font: { family: getCssVar('--font-mono') } }, grid: { color: border } },
          y: { title: { display: true, text: 'Heat index (°C)', color: muted, font: { family: getCssVar('--font-ui') } }, ticks: { color: muted, font: { family: getCssVar('--font-mono') } }, grid: { color: border } }
        }
      }
    });
  }

  function renderDistributionChart(data) {
    destroyChart('distribution');
    var counts = {};
    data.barangays.forEach(function (b) { counts[b.current.band] = (counts[b.current.band] || 0) + 1; });

    var muted = getCssVar('--text-muted');
    var text = getCssVar('--text');

    var ctx = document.getElementById('chart-distribution').getContext('2d');
    chartInstances.distribution = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['All 44 barangays'],
        datasets: BAND_ORDER.filter(function (b) { return counts[b]; }).map(function (b) {
          return {
            label: b + ' (' + counts[b] + ')',
            data: [counts[b]],
            backgroundColor: bandVarColor(b),
            stack: 'bands'
          };
        })
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: text, font: { family: getCssVar('--font-mono'), size: 11 }, boxWidth: 12 } },
          tooltip: { enabled: true }
        },
        scales: {
          x: { stacked: true, display: false },
          y: { stacked: true, display: false }
        }
      }
    });
  }

  function renderAllCharts(data) {
    renderCurveChart(data);
    renderRankedChart(data);
    renderElevationChart(data);
    renderDistributionChart(data);
  }

  function initRankModeToggle(data) {
    document.querySelectorAll('.segmented-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.segmented-btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        rankMode = btn.getAttribute('data-rank-mode');
        renderRankedChart(data);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  var lastData = null;

  if (window.Chart && window['chartjs-plugin-annotation'] && !Chart.registry.plugins.get('annotation')) {
    Chart.register(window['chartjs-plugin-annotation']);
  }

  initThemeToggle(function () { if (lastData) renderAllCharts(lastData); });

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
      if (!document.documentElement.getAttribute('data-theme') && lastData) renderAllCharts(lastData);
    });
  }

  fetch('../data/heat-index-latest.json')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data.barangays || !data.barangays.length) throw new Error('No barangays in heat-index-latest.json');
      lastData = data;

      // Wait for the webfonts to finish loading before the first chart paint.
      // A font swap mid-render can reflow the canvas's container after
      // Chart.js has already measured it, leaving charts partially drawn.
      var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      return fontsReady.then(function () {
        updateFreshnessChip(data.generated_at);
        renderScorecard(data);
        renderHero(data);
        renderTable(data);
        renderAllCharts(data);
        initRankModeToggle(data);
        document.getElementById('footer-updated').textContent = formatManilaFull(new Date(data.generated_at));

        document.getElementById('load-state').hidden = true;
        document.getElementById('app').hidden = false;
      });
    })
    .catch(function (err) {
      var el = document.getElementById('load-state');
      el.textContent = 'Could not load data/heat-index-latest.json (' + err.message + '). Run scripts/fetch/fetch-heat-index.js, then reload.';
      el.className = 'load-state error';
    });
})();
