// @ts-nocheck
import { CONFIG } from "./constants.js";
import {
  nearestLngInInterval,
  normalizeLng,
  polygonContains,
  polygonIntervalsAtLat,
  polygonMeta,
  unwrapLng,
} from "./geo.js";

export function countryMeta(feature) {
  const polygons = feature.polygons.map(polygonMeta).filter((polygon) => polygon.area > 0);
  let totalWeight = 0;
  for (const polygon of polygons) totalWeight += polygon.weight;
  return {
    iso: feature.iso.toLowerCase(),
    name: feature.name,
    polygons,
    mainOnly: feature.mainOnly !== false,
    totalWeight,
  };
}

export function buildCountryIndex(data, config = CONFIG) {
  const enabled = config.enabledCountries;
  const excluded = new Set(
    (config.excludeCountries || []).map((code) => String(code).toLowerCase()),
  );
  const all = data.map(countryMeta);
  const byIso = new Map(all.map((country) => [country.iso, country]));
  let selected: any;
  if (enabled === "all" || enabled == null) {
    selected = all;
  } else {
    const codes = new Set(
      (Array.isArray(enabled) ? enabled : [enabled]).map((code) => String(code).toLowerCase()),
    );
    selected = all.filter((country) => codes.has(country.iso));
  }
  selected = selected.filter((country) => !excluded.has(country.iso));
  const unknown = [];
  if (enabled !== "all" && enabled != null) {
    const codes = new Set(
      (Array.isArray(enabled) ? enabled : [enabled]).map((code) => String(code).toLowerCase()),
    );
    for (const code of codes) {
      if (!byIso.has(code)) unknown.push(code);
    }
  }
  for (const code of excluded) {
    if (!byIso.has(code)) unknown.push(code);
  }
  return { all, selected, byIso, unknown };
}

export function findCountryAt(lat, lng, index) {
  let best = null;
  for (const country of index.selected) {
    for (const polygon of country.polygons) {
      if (lat < polygon.minLat || lat > polygon.maxLat) continue;
      let inBox = false;
      for (const x of [lng, lng + 360, lng - 360]) {
        if (x >= polygon.minLng && x <= polygon.maxLng) {
          inBox = true;
          break;
        }
      }
      if (!inBox) continue;
      if (!polygonContains(lat, lng, polygon.rings)) continue;
      if (!best || polygon.area < best.polygon.area) best = { country, polygon };
    }
  }
  return best;
}

export function polygonCenter(polygon) {
  if (!polygon?.rings.length) return null;
  if (polygon.center) return polygon.center;
  const centerLat = (polygon.minLat + polygon.maxLat) / 2;
  const centerLng = (polygon.minLng + polygon.maxLng) / 2;
  if (polygonContains(centerLat, normalizeLng(centerLng), polygon.rings)) {
    const center = { lat: centerLat, lng: normalizeLng(centerLng) };
    polygon.center = center;
    return center;
  }
  const halfHeight = (polygon.maxLat - polygon.minLat) / 2 || 1;
  const halfWidth = (polygon.maxLng - polygon.minLng) / 2 || 1;
  let best = null;
  const steps = 129;
  for (let index = 0; index <= steps; index++) {
    const lat = polygon.minLat + (polygon.maxLat - polygon.minLat) * (index / steps);
    const distanceY = Math.abs(lat - centerLat) / halfHeight;
    if (best && distanceY > best.distance) continue;
    for (const interval of polygonIntervalsAtLat(polygon, lat)) {
      const lng = nearestLngInInterval(interval, centerLng);
      if (lng === null) continue;
      const distanceX = Math.abs(lng - centerLng) / halfWidth;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
      if (!best || distance < best.distance) best = { lat, lng, distance };
    }
  }
  if (best) {
    const center = { lat: best.lat, lng: normalizeLng(best.lng) };
    polygon.center = center;
    return center;
  }
  const vertex = polygon.rings[0][Math.floor(polygon.rings[0].length / 2)] || polygon.rings[0][0];
  const center = { lat: vertex[1], lng: normalizeLng(vertex[0]) };
  polygon.center = center;
  return center;
}

export function mainPolygon(country) {
  if (!country?.polygons.length) return null;
  return country.polygons.reduce((a, b) => (a.area >= b.area ? a : b), country.polygons[0]);
}

export function countryCenter(country) {
  if (!country?.polygons.length) return null;
  if (country.center && country.span) return country.center;
  const main = mainPolygon(country);
  const reference = main ? main.rings[0][0][0] : country.polygons[0].rings[0][0][0];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const polygon of country.polygons) {
    for (const [lng, lat] of polygon.rings[0]) {
      const x = unwrapLng(lng, reference);
      if (x < minLng) minLng = x;
      if (x > maxLng) maxLng = x;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  const center = { lat: (minLat + maxLat) / 2, lng: normalizeLng((minLng + maxLng) / 2) };
  country.center = center;
  country.span = { minLat, maxLat, minLng, maxLng };
  return center;
}
