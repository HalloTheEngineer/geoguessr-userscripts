// @ts-nocheck
import { DEG } from "./constants.js";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeLng(lng) {
  let value = lng;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

export function unwrapLng(lng, reference) {
  let value = lng;
  while (value - reference > 180) value -= 360;
  while (value - reference < -180) value += 360;
  return value;
}

export function ringArea(ring) {
  if (!ring.length) return 0;
  const reference = ring[0][0];
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = unwrapLng(ring[i][0], reference);
    const xj = unwrapLng(ring[j][0], reference);
    area += xj * ring[i][1] - xi * ring[j][1];
  }
  return Math.abs(area / 2);
}

export function ringContains(lat, lng, ring) {
  if (!ring.length) return false;
  const reference = ring[0][0];
  const x = unwrapLng(lng, reference);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = unwrapLng(ring[i][0], reference);
    const yi = ring[i][1];
    const xj = unwrapLng(ring[j][0], reference);
    const yj = ring[j][1];
    const intersects = yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonContains(lat, lng, rings) {
  if (!rings.length || !ringContains(lat, lng, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (ringContains(lat, lng, rings[i])) return false;
  }
  return true;
}

export function polygonMeta(rings) {
  const outer = rings[0];
  const reference = outer[0][0];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of outer) {
    const x = unwrapLng(lng, reference);
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  let area = ringArea(outer);
  for (let i = 1; i < rings.length; i++) area -= ringArea(rings[i]);
  area = Math.max(0, area);
  const midLat = (minLat + maxLat) / 2;
  const weight = area * Math.max(0.05, Math.cos(midLat * DEG));
  return { rings, minLng, maxLng, minLat, maxLat, area, weight };
}

export function ringIntervalsAtLat(ring, lat, reference) {
  const crossings = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = unwrapLng(ring[i][0], reference);
    const yi = ring[i][1];
    const xj = unwrapLng(ring[j][0], reference);
    const yj = ring[j][1];
    if (yi > lat === yj > lat) continue;
    crossings.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
  }
  crossings.sort((a, b) => a - b);
  const intervals = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    intervals.push([crossings[i], crossings[i + 1]]);
  }
  return intervals;
}

export function subtractIntervals(intervals, holes) {
  let result = intervals;
  for (const [holeMin, holeMax] of holes) {
    const next = [];
    for (const [min, max] of result) {
      if (max <= holeMin || min >= holeMax) {
        next.push([min, max]);
        continue;
      }
      if (min < holeMin) next.push([min, holeMin]);
      if (holeMax < max) next.push([holeMax, max]);
    }
    result = next;
  }
  return result.filter(([min, max]) => max > min);
}

export function polygonIntervalsAtLat(polygon, lat) {
  if (!polygon?.rings.length) return [];
  const reference = polygon.rings[0][0][0];
  const outer = ringIntervalsAtLat(polygon.rings[0], lat, reference);
  const holes = [];
  for (let i = 1; i < polygon.rings.length; i++)
    holes.push(...ringIntervalsAtLat(polygon.rings[i], lat, reference));
  return subtractIntervals(outer, holes);
}

export function nearestLngInInterval(interval, centerLng) {
  const [min, max] = interval;
  const width = max - min;
  if (width <= 1e-9) return null;
  const pad = Math.min(width * 0.005, 0.002);
  const low = min + pad;
  const high = max - pad;
  if (low > high) return (min + max) / 2;
  return clamp(centerLng, low, high);
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const values = [lat1, lng1, lat2, lng2].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return Infinity;
  const [aLat, aLng, bLat, bLng] = values;
  const toRadians = Math.PI / 180;
  const dLat = (bLat - aLat) * toRadians;
  const dLng = (bLng - aLng) * toRadians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRadians) * Math.cos(bLat * toRadians) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(lat1, lng1, lat2, lng2) {
  const values = [lat1, lng1, lat2, lng2].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return NaN;
  const [aLat, aLng, bLat, bLng] = values;
  const toRadians = Math.PI / 180;
  const phi1 = aLat * toRadians;
  const phi2 = bLat * toRadians;
  const delta = (bLng - aLng) * toRadians;
  const y = Math.sin(delta) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(delta);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function compassDirection(bearing) {
  const value = Number(bearing);
  if (!Number.isFinite(value)) return "";
  const directions = [
    "north",
    "northeast",
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
  ];
  return directions[Math.round((((value % 360) + 360) % 360) / 45) % 8];
}
