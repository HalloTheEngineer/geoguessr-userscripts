// @ts-nocheck
import { clamp, normalizeLng, polygonContains } from "./geo.js";
import { centerDistance, centerHeatWeight, heatmapFootprint } from "./heatmap.js";

export function weightedPick(items, rng) {
  let total = 0;
  for (const item of items) total += item.weight;
  if (total <= 0) return items[0] || null;
  let value = rng() * total;
  for (const item of items) {
    value -= item.weight;
    if (value <= 0) return item;
  }
  return items[items.length - 1];
}

export function randomWeightedPoint(center, halfLat, halfLng, bias, rng, sample) {
  let fallback = null;
  let fallbackWeight = -1;
  for (let attempt = 0; attempt < 256; attempt++) {
    const point = sample(rng);
    if (!point) break;
    const weight = centerHeatWeight(centerDistance(point, center, halfLat, halfLng), bias);
    if (weight > fallbackWeight) {
      fallback = point;
      fallbackWeight = weight;
    }
    if (rng() < weight) return point;
  }
  return fallback;
}

export function randomPointInPolygon(polygon, rng) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const lat = polygon.minLat + rng() * (polygon.maxLat - polygon.minLat);
    const lng = normalizeLng(polygon.minLng + rng() * (polygon.maxLng - polygon.minLng));
    if (polygonContains(lat, lng, polygon.rings)) return { lat, lng };
  }
  const vertex =
    polygon.rings[0][Math.floor(rng() * polygon.rings[0].length)] || polygon.rings[0][0];
  return { lat: vertex[1], lng: normalizeLng(vertex[0]) };
}

export function randomPointAnywhereInCountry(country, rng) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const polygon = weightedPick(country.polygons, rng);
    if (!polygon) break;
    const lat = polygon.minLat + rng() * (polygon.maxLat - polygon.minLat);
    const lng = normalizeLng(polygon.minLng + rng() * (polygon.maxLng - polygon.minLng));
    if (polygonContains(lat, lng, polygon.rings)) return { lat, lng };
  }
  const polygon = country.polygons.reduce(
    (a, b) => (a.area >= b.area ? a : b),
    country.polygons[0],
  );
  const vertex =
    polygon.rings[0][Math.floor(rng() * polygon.rings[0].length)] || polygon.rings[0][0];
  return { lat: vertex[1], lng: normalizeLng(vertex[0]) };
}

export function randomPointInCountry(country, rng = Math.random, centerBias = 0) {
  if (!country?.polygons.length) return null;
  const bias = clamp(Number(centerBias) || 0, 0, 1);
  if (bias <= 0) return randomPointAnywhereInCountry(country, rng);
  const footprint = heatmapFootprint(country);
  if (!footprint) return randomPointAnywhereInCountry(country, rng);
  if (bias >= 1) return { ...footprint.center };
  return randomWeightedPoint(
    footprint.center,
    footprint.halfLat,
    footprint.halfLng,
    bias,
    rng,
    (random) => randomPointAnywhereInCountry(country, random),
  );
}

export function shouldSkipAnimation(centerBias) {
  return clamp(Number(centerBias) || 0, 0, 1) >= 1;
}

export function buildAnimationPoints(country, count, rng = Math.random, centerBias = 0) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const point = randomPointInCountry(country, rng, centerBias);
    if (point) points.push(point);
  }
  return points;
}

export function easeOutCubic(value) {
  const progress = clamp(value, 0, 1);
  return 1 - (1 - progress) ** 3;
}

export function buildSchedule(durationMs, startIntervalMs, endIntervalMs) {
  const duration = Math.max(100, Number(durationMs) || 2800);
  const start = Math.max(10, Number(startIntervalMs) || 45);
  const end = Math.max(start, Number(endIntervalMs) || 320);
  const ticks = [];
  let elapsed = 0;
  while (true) {
    const progress = clamp(elapsed / duration, 0, 1);
    ticks.push({ at: elapsed, progress });
    if (elapsed >= duration) break;
    const interval = start + (end - start) * easeOutCubic(progress);
    elapsed = Math.min(duration, elapsed + interval);
  }
  if (ticks.length === 1) ticks.push({ at: duration, progress: 1 });
  return ticks;
}
