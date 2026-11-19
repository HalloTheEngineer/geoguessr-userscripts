#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  matchingExclusion,
  readExclusions,
  renderModuleBlock,
  writeBlock,
} from "./country-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "src", "core", "countries.generated.js");
const CACHE = path.join(ROOT, ".cache", "ne_110m_admin_0_countries.geojson");
const DEFAULT_SOURCE = "/tmp/opencode/ne110b.geojson";
const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const EXCLUSIONS_PATH = path.join(ROOT, "scripts", "data", "polygon-exclusions.json");
const MIN_POLYGON_AREA = 0.005;
const MAIN_ONLY_EXCEPTIONS = new Set(["id", "ph", "gr"]);

function parseSourceArg() {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith("--source="));
  if (inline) return inline.slice("--source=".length);
  const index = args.indexOf("--source");
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return null;
}

async function loadSource() {
  const requested = parseSourceArg();
  if (requested) {
    if (/^https?:\/\//i.test(requested)) return fetchSource(requested);
    return fs.readFileSync(requested, "utf8");
  }
  if (fs.existsSync(DEFAULT_SOURCE)) return fs.readFileSync(DEFAULT_SOURCE, "utf8");
  if (fs.existsSync(CACHE)) return fs.readFileSync(CACHE, "utf8");
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const text = await fetchSource(SOURCE_URL);
  fs.writeFileSync(CACHE, text);
  return text;
}

async function fetchSource(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Unable to download ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function cleanRing(ring) {
  if (!Array.isArray(ring)) return [];
  const out = [];
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lng = round(Number(point[0]));
    const lat = round(Number(point[1]));
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const previous = out[out.length - 1];
    if (previous && previous[0] === lng && previous[1] === lat) continue;
    out.push([lng, lat]);
  }
  if (out.length >= 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  }
  return out.length >= 4 ? out : [];
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(area / 2);
}

function cleanPolygon(polygon) {
  if (!Array.isArray(polygon) || !polygon.length) return null;
  const rings = [];
  for (const ring of polygon) {
    const cleaned = cleanRing(ring);
    if (cleaned.length) rings.push(cleaned);
  }
  if (!rings.length) return null;
  if (ringArea(rings[0]) < MIN_POLYGON_AREA) return null;
  return rings;
}

function pickIso(properties) {
  const candidates = [properties.ISO_A2, properties.ISO_A2_EH, properties.WB_A2];
  for (const candidate of candidates) {
    const value = String(candidate ?? "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{2}$/.test(value)) return value;
  }
  return null;
}

function normalizeFeature(feature, exclusions) {
  const properties = feature?.properties ?? {};
  const iso = pickIso(properties);
  if (!iso) return { skipped: properties.ADMIN ?? properties.NAME ?? "unknown" };
  const geometry = feature.geometry;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    return { skipped: properties.ADMIN ?? properties.NAME ?? iso };
  }
  const rawPolygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const polygons = [];
  const dropped = [];
  for (const polygon of rawPolygons) {
    const cleaned = cleanPolygon(polygon);
    if (!cleaned) continue;
    const excluded = matchingExclusion(cleaned, exclusions[iso.toLowerCase()]);
    if (excluded) {
      dropped.push(`${iso.toLowerCase()} ${excluded.name || "polygon"}`);
      continue;
    }
    polygons.push(cleaned);
  }
  if (!polygons.length) return { skipped: properties.ADMIN ?? properties.NAME ?? iso };
  return {
    iso: iso.toLowerCase(),
    name: properties.ADMIN || properties.NAME || iso,
    polygons,
    mainOnly: !MAIN_ONLY_EXCEPTIONS.has(iso.toLowerCase()),
    dropped,
  };
}

function buildData(geojson, exclusions) {
  const countries = new Map();
  const skipped = [];
  const dropped = [];
  for (const feature of geojson.features ?? []) {
    const normalized = normalizeFeature(feature, exclusions);
    if (normalized.skipped) {
      skipped.push(normalized.skipped);
      continue;
    }
    dropped.push(...normalized.dropped);
    delete normalized.dropped;
    const existing = countries.get(normalized.iso);
    if (existing) {
      existing.polygons.push(...normalized.polygons);
    } else {
      countries.set(normalized.iso, normalized);
    }
  }
  return {
    countries: [...countries.values()].sort((a, b) => a.name.localeCompare(b.name)),
    skipped,
    dropped,
  };
}

function writeGeneratedModule(block) {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  if (!fs.existsSync(TARGET)) {
    fs.writeFileSync(TARGET, `${block}\n`);
    return;
  }
  const text = fs.readFileSync(TARGET, "utf8");
  fs.writeFileSync(TARGET, writeBlock(text, block));
}

async function main() {
  const source = await loadSource();
  const exclusions = readExclusions(EXCLUSIONS_PATH);
  const geojson = JSON.parse(source);
  const { countries, skipped, dropped } = buildData(geojson, exclusions);
  const block = renderModuleBlock(countries);
  writeGeneratedModule(block);
  const polygons = countries.reduce((total, country) => total + country.polygons.length, 0);
  console.log(
    `Generated ${countries.length} countries, ${polygons} polygons, ${block.length} bytes`,
  );
  if (skipped.length) console.log(`Skipped: ${skipped.join(", ")}`);
  if (dropped.length) console.log(`Excluded polygons: ${dropped.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
