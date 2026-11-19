// @ts-nocheck

import { MAJOR_CITIES } from "./cities.generated.js";
import {
  CLIMATE_GRID_BASE64,
  CLIMATE_GRID_HEIGHT,
  CLIMATE_GRID_WIDTH,
} from "./climate-grid.generated.js";
import { COUNTRY_TRAITS } from "./country-traits.generated.js";
import { bearingDeg, compassDirection, haversineKm } from "./geo.js";

export const CLIMATE_CATEGORIES = [
  null,
  "Tropical",
  "Arid / Semi-arid",
  "Mediterranean",
  "Subtropical",
  "Oceanic",
  "Continental",
  "Boreal / Subarctic",
  "Polar / Alpine",
];

let climateGrid = null;

function decodeBase64(text) {
  if (typeof atob === "function") {
    return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
  }
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"));
  return null;
}

function getClimateGrid() {
  if (climateGrid) return climateGrid;
  climateGrid = decodeBase64(CLIMATE_GRID_BASE64);
  return climateGrid;
}

export function countryTraits(iso) {
  if (typeof iso !== "string") return null;
  return COUNTRY_TRAITS[iso.toLowerCase()] || null;
}

export function climateRegionsFor(label) {
  const code = CLIMATE_CATEGORIES.indexOf(label);
  const grid = getClimateGrid();
  if (!grid || code <= 0) return [];
  const regions = [];
  for (let row = 0; row < CLIMATE_GRID_HEIGHT; row++) {
    let column = 0;
    while (column < CLIMATE_GRID_WIDTH) {
      if (grid[row * CLIMATE_GRID_WIDTH + column] !== code) {
        column++;
        continue;
      }
      let end = column + 1;
      while (end < CLIMATE_GRID_WIDTH && grid[row * CLIMATE_GRID_WIDTH + end] === code) end++;
      const south = -90 + row * 2;
      const west = -180 + column * 2;
      regions.push({
        south,
        north: south + 2,
        west,
        east: west + (end - column) * 2,
        area: end - column,
      });
      column = end;
    }
  }
  return regions;
}

export function climateAt(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const grid = getClimateGrid();
  if (!grid) return null;
  const row = Math.min(
    CLIMATE_GRID_HEIGHT - 1,
    Math.max(0, Math.floor((Math.max(-90, Math.min(90, latitude)) + 90) / 2)),
  );
  const column = Math.min(
    CLIMATE_GRID_WIDTH - 1,
    Math.max(0, Math.floor(((((longitude + 180) % 360) + 360) % 360) / 2)),
  );
  const code = grid[row * CLIMATE_GRID_WIDTH + column];
  const label = CLIMATE_CATEGORIES[code];
  return label ? { code, label } : null;
}

export function nearestMajorCity(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  let best = null;
  for (const city of MAJOR_CITIES) {
    const [name, cityLat, cityLng, iso, population] = city;
    const distanceKm = haversineKm(latitude, longitude, cityLat, cityLng);
    if (!Number.isFinite(distanceKm)) continue;
    if (!best || distanceKm < best.distanceKm) {
      const bearing = bearingDeg(cityLat, cityLng, latitude, longitude);
      best = {
        name,
        lat: cityLat,
        lng: cityLng,
        iso,
        population,
        distanceKm,
        bearing,
        direction: compassDirection(bearing),
      };
    }
  }
  return best;
}

export function elevationBand(value) {
  if (value == null) return null;
  const elevation = Number(value);
  if (!Number.isFinite(elevation)) return null;
  if (elevation < 300) return { id: "lowland", label: "Lowland", detail: "below 300 m" };
  if (elevation < 1200) return { id: "upland", label: "Upland", detail: "roughly 300–1200 m" };
  if (elevation < 2500) return { id: "highland", label: "Highland", detail: "roughly 1200–2500 m" };
  return { id: "mountainous", label: "Mountainous", detail: "above 2500 m" };
}

export function densityBand(value) {
  if (value == null) return null;
  const density = Number(value);
  if (!Number.isFinite(density) || density < 0) return null;
  if (density < 10)
    return { id: "sparse", label: "Sparsely Populated", detail: "under 10 people/km²" };
  if (density < 100)
    return { id: "moderate", label: "Moderately Populated", detail: "roughly 10–100 people/km²" };
  if (density < 300)
    return { id: "dense", label: "Densely Populated", detail: "roughly 100–300 people/km²" };
  return { id: "very-dense", label: "Very Densely Populated", detail: "above 300 people/km²" };
}
