'use strict';

/**
 * Time scrubber. Knows nothing about charts, maps, tables or which page
 * it's on — it just manages play/pause/range/keyboard for a 24-hour day
 * and publishes a window "hourchange" CustomEvent ({ detail: { index } })
 * whenever the selected hour changes. Callers listen for that event and
 * update whatever they own.
 */

import { reduceMotionPreferred, manilaHourLabel, nowHourIndex } from './data.js';

const SCRUB_HOURS = 24;
const AUTOPLAY_MS_PER_HOUR = 250; // 24 hours in ~6s

const state = { index: 0, playing: false, rafId: null, lastTick: 0, hourly: null };

function emit(index) {
  window.dispatchEvent(new CustomEvent('hourchange', { detail: { index } }));
}

function updateReadout() {
  const el = document.getElementById('scrubber-readout');
  if (el && state.hourly) el.textContent = manilaHourLabel(state.hourly[state.index].date_time);
}

function setIndex(i, opts) {
  state.index = Math.max(0, Math.min(SCRUB_HOURS - 1, i));
  const range = document.getElementById('scrubber-range');
  if (range) range.value = state.index;
  updateReadout();
  if (!opts || opts.emit !== false) emit(state.index);
}

function stopAutoplay() {
  state.playing = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  const btn = document.getElementById('scrubber-play');
  if (btn) { btn.innerHTML = '&#9654;'; btn.setAttribute('aria-label', 'Play 24-hour animation'); }
}

function startAutoplay() {
  if (reduceMotionPreferred()) return; // scrubber stays fully usable, just no autoplay
  state.playing = true;
  state.lastTick = performance.now();
  const btn = document.getElementById('scrubber-play');
  if (btn) { btn.innerHTML = '&#10074;&#10074;'; btn.setAttribute('aria-label', 'Pause 24-hour animation'); }

  function loop(ts) {
    if (!state.playing) return;
    if (ts - state.lastTick >= AUTOPLAY_MS_PER_HOUR) {
      state.lastTick = ts;
      let next = state.index + 1;
      if (next >= SCRUB_HOURS) next = 0;
      setIndex(next);
    }
    state.rafId = requestAnimationFrame(loop);
  }
  state.rafId = requestAnimationFrame(loop);
}

/**
 * @param {Array} hourly - one barangay's hourly array, used only to label
 *   the readout with real timestamps (any barangay's hours share the same
 *   24 UTC instants).
 * @param {object} [opts] - opts.startAtNow (default true)
 */
export function initScrubber(hourly, opts) {
  opts = opts || {};
  state.hourly = hourly;
  state.index = (opts.startAtNow === false) ? 0 : nowHourIndex(hourly.length);

  const range = document.getElementById('scrubber-range');
  if (range) {
    range.max = SCRUB_HOURS - 1;
    range.value = state.index;
    range.addEventListener('input', () => { stopAutoplay(); setIndex(Number(range.value)); });
  }

  const playBtn = document.getElementById('scrubber-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => { if (state.playing) stopAutoplay(); else startAutoplay(); });
  }

  const returnBtn = document.getElementById('return-to-now');
  if (returnBtn) {
    returnBtn.addEventListener('click', () => { stopAutoplay(); setIndex(nowHourIndex(hourly.length)); });
  }

  document.addEventListener('keydown', (e) => {
    if (document.activeElement && ['INPUT', 'TEXTAREA'].indexOf(document.activeElement.tagName) !== -1 && document.activeElement !== range) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (state.playing) stopAutoplay(); else startAutoplay();
    }
  });

  updateReadout();
  emit(state.index);
}

export function getScrubIndex() { return state.index; }
export function isAtNow(hourCount) { return state.index === nowHourIndex(hourCount); }
export function returnToNow(hourCount) { stopAutoplay(); setIndex(nowHourIndex(hourCount)); }
