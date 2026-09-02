'use strict';

/**
 * NWS/Rothfusz heat index — NOT Open-Meteo's apparent_temperature.
 * apparent_temperature uses a different formula (adds wind chill and solar
 * radiation terms) and runs ~2-2.6°C high versus NWS HI, which shifts band
 * classification. This project reports PAGASA iHeatMAP as authoritative and
 * this calculation as a supplementary, clearly-labeled derived indicator, so
 * it must match the same Rothfusz regression PAGASA itself uses.
 *
 * Reference: https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml
 */

const CELSIUS_TO_FAHRENHEIT = (c) => (c * 9) / 5 + 32;
const FAHRENHEIT_TO_CELSIUS = (f) => ((f - 32) * 5) / 9;

/**
 * @param {number} temperatureC - Air temperature in degrees Celsius.
 * @param {number} relativeHumidityPct - Relative humidity, 0-100.
 * @returns {number} Heat index in degrees Celsius.
 */
function heatIndexCelsius(temperatureC, relativeHumidityPct) {
  const T = CELSIUS_TO_FAHRENHEIT(temperatureC);
  const RH = relativeHumidityPct;

  // Simple formula (Steadman), used as-is below ~80°F per NWS guidance.
  const simpleHI =
    0.5 * (T + 61.0 + (T - 68.0) * 1.2 + RH * 0.094);

  const averagedWithT = (simpleHI + T) / 2;
  if (averagedWithT < 80) {
    return FAHRENHEIT_TO_CELSIUS(simpleHI);
  }

  // Full Rothfusz regression.
  let HI =
    -42.379 +
    2.04901523 * T +
    10.14333127 * RH -
    0.22475541 * T * RH -
    0.00683783 * T * T -
    0.05481717 * RH * RH +
    0.00122874 * T * T * RH +
    0.00085282 * T * RH * RH -
    0.00000199 * T * T * RH * RH;

  // Low-humidity adjustment: 80°F <= T <= 112°F, RH < 13%.
  if (RH < 13 && T >= 80 && T <= 112) {
    const adjustment =
      ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    HI -= adjustment;
  }

  // High-humidity adjustment: 80°F <= T <= 87°F, RH > 85%.
  if (RH > 85 && T >= 80 && T <= 87) {
    const adjustment = ((RH - 85) / 10) * ((87 - T) / 5);
    HI += adjustment;
  }

  return FAHRENHEIT_TO_CELSIUS(HI);
}

/**
 * @param {number} heatIndexC - Heat index in degrees Celsius.
 * @returns {'Caution'|'Extreme Caution'|'Danger'|'Extreme Danger'}
 */
function band(heatIndexC) {
  const hiF = CELSIUS_TO_FAHRENHEIT(heatIndexC);
  if (hiF >= 130) return 'Extreme Danger';
  if (hiF >= 105) return 'Danger';
  if (hiF >= 90) return 'Extreme Caution';
  return 'Caution';
}

module.exports = { heatIndexCelsius, band, CELSIUS_TO_FAHRENHEIT, FAHRENHEIT_TO_CELSIUS };
