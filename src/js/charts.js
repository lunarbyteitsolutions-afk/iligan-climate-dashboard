'use strict';

/**
 * Chart builders + shared Chart.js theming. Every function here takes the
 * data it needs as arguments — nothing in this file assumes which page
 * it's running on. Chart.js and its annotation plugin are expected to
 * already be loaded as globals (pinned from cdnjs in each page's <head>).
 */

import { getCssVar, bandVarColor, manilaHourLabel, CAUTION_MIN_C, EXTREME_CAUTION_MIN_C, DANGER_MIN_C } from './data.js';

export function ensureAnnotationPluginRegistered() {
  if (window.Chart && window['chartjs-plugin-annotation'] && !Chart.registry.plugins.get('annotation')) {
    Chart.register(window['chartjs-plugin-annotation']);
  }
}

/** Common theme tokens read fresh each call, so a theme toggle just needs a re-render, not new logic. */
export function chartTheme() {
  return {
    text: getCssVar('--text'),
    muted: getCssVar('--text-muted'),
    border: getCssVar('--border'),
    accent: getCssVar('--accent'),
    amber: getCssVar('--accent-amber'),
    surface: getCssVar('--surface'),
    fontMono: getCssVar('--font-mono'),
    fontUi: getCssVar('--font-ui')
  };
}

// -----------------------------------------------------------------------
// Inline SVG sparkline for a barangay's 24h trend — always the real full
// day, independent of any scrubber. Not Chart.js (too many instances would
// be needed for a 44-row table), but still "a chart", so it lives here.
// -----------------------------------------------------------------------
export function sparklineSvg(hourly, peakIso, opts) {
  opts = opts || {};
  const w = opts.width || 90, h = opts.height || 26, pad = 3;
  const values = hourly.map((hh) => hh.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  const peakIdx = hourly.findIndex((hh) => hh.date_time === peakIso);
  const peakX = pad + peakIdx * stepX;
  const peakY = pad + (1 - (values[peakIdx] - min) / range) * (h - pad * 2);
  const peakColor = bandVarColor(hourly[peakIdx].band);

  return (
    '<svg class="sparkline" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
    '<polyline points="' + points + '" fill="none" stroke="currentColor" stroke-width="1.25" />' +
    '<circle cx="' + peakX.toFixed(1) + '" cy="' + peakY.toFixed(1) + '" r="1.8" fill="' + peakColor + '" />' +
    '</svg>'
  );
}

// -----------------------------------------------------------------------
// Today's heat curve — city min-max band + median, with peak window,
// band-threshold lines, a "now" marker, and a scrub playhead.
// -----------------------------------------------------------------------
export function buildCurveChart(canvasId, citySeries, scrubIndex) {
  const t = chartTheme();
  const peakStart = citySeries.labels.indexOf('12:00');
  const peakEnd = citySeries.labels.indexOf('15:00');
  const nowFrac = Math.max(0, Math.min(citySeries.labels.length - 1, scrubIndex));

  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: citySeries.labels,
      datasets: [
        { label: 'City max', data: citySeries.maxSeries, borderColor: 'transparent', pointRadius: 0, fill: false, order: 2 },
        { label: 'City min–max range', data: citySeries.minSeries, borderColor: 'transparent', backgroundColor: t.accent + '26', pointRadius: 0, fill: '-1', order: 2 },
        { label: 'City median', data: citySeries.medianSeries, borderColor: t.accent, backgroundColor: t.accent, borderWidth: 2, pointRadius: 0, fill: false, order: 1 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: t.text, font: { family: t.fontMono, size: 10 } } },
        tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + c.parsed.y.toFixed(1) + '°C' } },
        annotation: {
          annotations: Object.assign(
            (peakStart >= 0 && peakEnd >= 0) ? {
              peakWindow: {
                type: 'box', xMin: peakStart, xMax: peakEnd, backgroundColor: t.amber + '14', borderWidth: 0,
                label: { display: true, content: 'Peak window', position: 'start', color: t.amber, font: { size: 10, family: t.fontMono } }
              }
            } : {},
            {
              extremeCautionLine: {
                type: 'line', yMin: EXTREME_CAUTION_MIN_C, yMax: EXTREME_CAUTION_MIN_C,
                borderColor: bandVarColor('Extreme Caution'), borderWidth: 1, borderDash: [4, 4],
                label: { display: true, content: 'Extreme Caution ' + EXTREME_CAUTION_MIN_C.toFixed(1) + '°C', position: 'end', color: bandVarColor('Extreme Caution'), font: { size: 10, family: t.fontMono }, backgroundColor: 'transparent' }
              },
              dangerLine: {
                type: 'line', yMin: DANGER_MIN_C, yMax: DANGER_MIN_C,
                borderColor: bandVarColor('Danger'), borderWidth: 1, borderDash: [4, 4],
                label: { display: true, content: 'Danger ' + DANGER_MIN_C.toFixed(1) + '°C', position: 'end', color: bandVarColor('Danger'), font: { size: 10, family: t.fontMono }, backgroundColor: 'transparent' }
              },
              playhead: {
                type: 'line', xMin: nowFrac, xMax: nowFrac, borderColor: t.amber, borderWidth: 2,
                label: { display: true, content: 'VIEW', position: 'end', yAdjust: 6, color: t.amber, font: { size: 9, family: t.fontMono }, backgroundColor: 'transparent' }
              }
            }
          )
        }
      },
      scales: {
        x: { ticks: { color: t.muted, font: { family: t.fontMono }, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 }, grid: { color: t.border } },
        y: { ticks: { color: t.muted, font: { family: t.fontMono }, callback: (v) => v + '°C' }, grid: { color: t.border } }
      }
    }
  });
}

export function updateCurvePlayhead(chart, scrubIndex) {
  if (!chart) return;
  const ann = chart.options.plugins.annotation.annotations;
  if (ann.playhead) { ann.playhead.xMin = scrubIndex; ann.playhead.xMax = scrubIndex; }
  chart.update('none');
}

function barEndLabelsPlugin() {
  return {
    id: 'barEndLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const meta = chart.getDatasetMeta(0);
      const t = chartTheme();
      ctx.save();
      ctx.fillStyle = t.text;
      ctx.font = '600 11px ' + t.fontMono;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      meta.data.forEach((bar, i) => {
        const value = chart.data.datasets[0].data[i];
        ctx.fillText(value.toFixed(1) + '°C', bar.x + 6, bar.y);
      });
      ctx.restore();
    }
  };
}

// -----------------------------------------------------------------------
// Ranked barangays — top 15 horizontal bars. Ported as-is from the
// mission-control build: this chart is not scaled to the 25-45°C band
// range, so bars for close values (e.g. 30.9 vs 32.1°C) render nearly
// identical lengths. Known, not fixed in this refactor (no behaviour
// change) — see the ops-view backlog.
// -----------------------------------------------------------------------
export function buildRankedChart(canvasId, barangaysTop, valueKey, onBarClick) {
  const t = chartTheme();
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: barangaysTop.map((b) => b.name),
      datasets: [{
        data: barangaysTop.map((b) => b[valueKey].value),
        backgroundColor: barangaysTop.map((b) => bandVarColor(b[valueKey].band)),
        borderRadius: 0,
        maxBarThickness: 16
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      onClick: (evt, elements) => { if (elements.length && onBarClick) onBarClick(barangaysTop[elements[0].index].name); },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.parsed.x.toFixed(1) + '°C' } } },
      scales: {
        x: { ticks: { color: t.muted, font: { family: t.fontMono } }, grid: { color: t.border } },
        y: { ticks: { color: t.text, font: { family: t.fontMono, size: 10 } }, grid: { display: false } }
      }
    },
    plugins: [barEndLabelsPlugin()]
  });
}

// -----------------------------------------------------------------------
// Heat vs elevation scatter — fixed Y floor at the real Caution threshold
// (not a rounded guess) with a labeled line, so the chart always shows
// where Caution itself begins rather than auto-scaling to whatever
// range the data happens to occupy that day. `labelPoints` (optional) are
// specific barangays to annotate, e.g. the hottest/coolest of the day.
// -----------------------------------------------------------------------
export function buildElevationChart(canvasId, barangays, onPointClick, labelPoints) {
  const t = chartTheme();
  labelPoints = labelPoints || [];

  const elevExtent = [Math.min(...barangays.map((b) => b.elevation_m)), Math.max(...barangays.map((b) => b.elevation_m))];
  const valueExtent = [Math.min(...barangays.map((b) => b.current.value)), Math.max(...barangays.map((b) => b.current.value))];
  function labelAdjust(b) {
    const xRatio = (b.elevation_m - elevExtent[0]) / (elevExtent[1] - elevExtent[0] || 1);
    const yRatio = (b.current.value - valueExtent[0]) / (valueExtent[1] - valueExtent[0] || 1);
    return { xAdjust: xRatio > 0.6 ? -55 : 55, yAdjust: yRatio > 0.6 ? 22 : -22 };
  }

  const annotations = {
    cautionLine: {
      type: 'line', yMin: CAUTION_MIN_C, yMax: CAUTION_MIN_C,
      borderColor: bandVarColor('Caution'), borderWidth: 1, borderDash: [4, 4],
      label: {
        display: true, content: 'Caution ' + CAUTION_MIN_C.toFixed(1) + '°C', position: 'end',
        color: bandVarColor('Caution'), font: { size: 10, family: t.fontMono }, backgroundColor: t.surface
      }
    }
  };
  labelPoints.forEach((b, i) => {
    const adjust = labelAdjust(b);
    annotations['point' + i] = {
      type: 'label', xValue: b.elevation_m, yValue: b.current.value,
      content: [b.name, b.elevation_m + 'm, ' + b.current.value.toFixed(1) + '°C'],
      color: t.text, font: { size: 10, family: t.fontMono },
      xAdjust: adjust.xAdjust, yAdjust: adjust.yAdjust, backgroundColor: t.surface + 'cc'
    };
  });

  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        data: barangays.map((b) => ({ x: b.elevation_m, y: b.current.value, name: b.name, band: b.current.band })),
        backgroundColor: barangays.map((b) => bandVarColor(b.current.band)),
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { left: 6, top: 4, bottom: 2, right: 10 } },
      onClick: (evt, elements) => { if (elements.length && onPointClick) onPointClick(barangays[elements[0].index].name); },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => c.raw.name + ': ' + c.raw.y.toFixed(1) + '°C at ' + c.raw.x + 'm (' + c.raw.band + ')' } },
        annotation: { annotations }
      },
      scales: {
        x: { title: { display: true, text: 'Elevation (m)', color: t.muted, font: { family: t.fontMono }, padding: { top: 8 } }, ticks: { color: t.muted, font: { family: t.fontMono } }, grid: { color: t.border } },
        y: { min: 26, title: { display: true, text: 'Heat index (°C)', color: t.muted, font: { family: t.fontMono }, padding: { bottom: 8 } }, ticks: { color: t.muted, font: { family: t.fontMono } }, grid: { color: t.border } }
      }
    }
  });
}

// -----------------------------------------------------------------------
// Band distribution — single horizontal stacked bar, small summary strip.
// -----------------------------------------------------------------------
export function buildDistributionChart(canvasId, barangays, bandOrder) {
  const t = chartTheme();
  const counts = {};
  barangays.forEach((b) => { counts[b.current.band] = (counts[b.current.band] || 0) + 1; });

  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['All 44 barangays'],
      datasets: bandOrder.filter((b) => counts[b]).map((b) => ({
        label: b + ' (' + counts[b] + ')', data: [counts[b]], backgroundColor: bandVarColor(b), stack: 'bands'
      }))
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: t.text, font: { family: t.fontMono, size: 11 }, boxWidth: 12 } },
        tooltip: { enabled: true }
      },
      scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false } }
    }
  });
}

// -----------------------------------------------------------------------
// Drawer's own 24h curve, with the day's peak marked.
// -----------------------------------------------------------------------
export function buildDrawerChart(canvasId, barangay) {
  const t = chartTheme();
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: barangay.hourly.map((h) => manilaHourLabel(h.date_time)),
      datasets: [{ data: barangay.hourly.map((h) => h.value), borderColor: t.accent, backgroundColor: t.accent, borderWidth: 2, pointRadius: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            peak: {
              type: 'point',
              xValue: barangay.hourly.findIndex((h) => h.date_time === barangay.today_peak.date_time),
              yValue: barangay.today_peak.value,
              backgroundColor: t.amber, radius: 4
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: t.muted, font: { family: t.fontMono, size: 9 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 10 }, grid: { display: false } },
        y: { ticks: { color: t.muted, font: { family: t.fontMono, size: 9 } }, grid: { color: t.border } }
      }
    }
  });
}
