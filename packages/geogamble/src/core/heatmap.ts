// @ts-nocheck
import { CENTER_BIAS_FALLOFF, HEATMAP_RAMP } from "./constants.js";
import { countryCenter, mainPolygon, polygonCenter } from "./countries.js";
import { clamp, polygonContains, unwrapLng } from "./geo.js";

export function centerHeatWeight(distance, centerBias) {
  const bias = clamp(Number(centerBias) || 0, 0, 1);
  return Math.exp(-CENTER_BIAS_FALLOFF * bias * distance * distance);
}

export function heatmapFootprint(country) {
  if (!country?.polygons.length) return null;
  if (country.mainOnly === false) {
    const center = countryCenter(country);
    const span = country.span;
    if (!center || !span) return null;
    return {
      center,
      halfLat: halfSpan(span.minLat, span.maxLat),
      halfLng: halfSpan(span.minLng, span.maxLng),
    };
  }
  const main = mainPolygon(country);
  const center = main ? polygonCenter(main) : null;
  if (!main || !center) return null;
  return {
    center,
    halfLat: halfSpan(main.minLat, main.maxLat),
    halfLng: halfSpan(main.minLng, main.maxLng),
  };
}

export function heatmapWeightAt(footprint, lat, lng, centerBias) {
  if (!footprint) return 0;
  const distance = centerDistance(
    { lat, lng },
    footprint.center,
    footprint.halfLat,
    footprint.halfLng,
  );
  return centerHeatWeight(distance, centerBias);
}

export function heatmapColor(value) {
  const target = clamp(Number(value) || 0, 0, 1);
  let low = HEATMAP_RAMP[0];
  let high = HEATMAP_RAMP[HEATMAP_RAMP.length - 1];
  for (let index = 1; index < HEATMAP_RAMP.length; index++) {
    if (target <= HEATMAP_RAMP[index][0]) {
      low = HEATMAP_RAMP[index - 1];
      high = HEATMAP_RAMP[index];
      break;
    }
  }
  const span = high[0] - low[0] || 1;
  const ratio = (target - low[0]) / span;
  return low[1].map((channel, index) => channel + (high[1][index] - channel) * ratio);
}

export function buildHeatmapRaster({ polygon, footprint, bias, width, height, pointAt }) {
  const columns = Math.max(1, Math.round(Number(width) || 1));
  const rows = Math.max(1, Math.round(Number(height) || 1));
  const data = new Float32Array(columns * rows);
  if (!polygon || !footprint || typeof pointAt !== "function") {
    return { width: columns, height: rows, data, max: 0 };
  }
  let max = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const point = pointAt(column, row);
      if (!point) continue;
      if (!polygonContains(point.lat, point.lng, polygon.rings)) continue;
      const weight = heatmapWeightAt(footprint, point.lat, point.lng, bias);
      data[row * columns + column] = weight;
      if (weight > max) max = weight;
    }
  }
  return { width: columns, height: rows, data, max };
}

export function halfSpan(min, max) {
  return Math.max((max - min) / 2, 1e-6);
}

export function centerDistance(point, center, halfLat, halfLng) {
  const dx = (unwrapLng(point.lng, center.lng) - center.lng) / halfLng;
  const dy = (point.lat - center.lat) / halfLat;
  return Math.sqrt(dx * dx + dy * dy);
}
