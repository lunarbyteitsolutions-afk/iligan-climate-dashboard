'use strict';

/**
 * Pure rainfall math — no network, no filesystem. See fetch-rainfall.js for
 * the Open-Meteo call and file writing.
 *
 * PAGASA is the authoritative source for rainfall in the Philippines. This
 * module (and the Open-Meteo data it summarizes) is a supplementary, clearly
 * labeled derived indicator only — see CLAUDE.md. Never call this "drought"
 * or a "rainfall deficit" (that needs a climatological normal this project
 * does not have); only "7-day accumulated rainfall" and "consecutive dry
 * days" are used, here and in the UI.
 */

// A day counts as "dry" below this accumulation. Stated wherever a dry-day
// count appears in the UI. Must match src/js/data.js's DRY_DAY_THRESHOLD_MM.
const DRY_DAY_THRESHOLD_MM = 1.0;

function isDryDay(precipitationMm) {
  return precipitationMm < DRY_DAY_THRESHOLD_MM;
}

/**
 * @param {number[]} dailyPrecipMm - precipitation_sum in mm, oldest first,
 *   today last (Open-Meteo's `daily.precipitation_sum` with past_days=7 and
 *   forecast_days=1 returns exactly this: 8 entries, today last).
 * @returns {{rainfall_today_mm:number, rainfall_7day_mm:number, dry_days_7:number, consecutive_dry_days:number, window_days:number}}
 */
function summarizeDaily(dailyPrecipMm) {
  if (!Array.isArray(dailyPrecipMm) || dailyPrecipMm.length === 0) {
    throw new Error('summarizeDaily requires a non-empty array of daily precipitation values');
  }

  const today = dailyPrecipMm[dailyPrecipMm.length - 1];
  const trailing7 = dailyPrecipMm.slice(-7);
  const rainfall7day = trailing7.reduce((sum, v) => sum + v, 0);
  const dryDays7 = trailing7.filter(isDryDay).length;

  let consecutiveDryDays = 0;
  for (let i = dailyPrecipMm.length - 1; i >= 0; i--) {
    if (!isDryDay(dailyPrecipMm[i])) break;
    consecutiveDryDays++;
  }

  return {
    rainfall_today_mm: Number(today.toFixed(1)),
    rainfall_7day_mm: Number(rainfall7day.toFixed(1)),
    dry_days_7: dryDays7,
    consecutive_dry_days: consecutiveDryDays,
    window_days: trailing7.length
  };
}

module.exports = { DRY_DAY_THRESHOLD_MM, isDryDay, summarizeDaily };
