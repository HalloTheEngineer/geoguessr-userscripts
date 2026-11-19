#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KoppenLookup } from "koppen-climate-lookup";
import { COUNTRY_DATA } from "../src/core/countries.generated.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache");
const OUT = path.join(ROOT, "src", "core");
const NE_PATH = path.join(CACHE, "ne_110m_admin_0_countries.geojson");
const MLEDOZE_PATH = path.join(CACHE, "mledoze-countries.json");
const FACTBOOK_TREE_PATH = path.join(CACHE, "factbook-tree.json");
const FACTBOOK_CACHE = path.join(CACHE, "factbook");
const CITIES_PATH = path.join(CACHE, "ne_50m_populated_places_simple.geojson");
const ELEVATION_FALLBACK_PATH = path.join(CACHE, "country-elevation.json");
const LANGUAGE_TRAITS_PATH = path.join(ROOT, "scripts", "data", "language-traits.json");
const DATA_SOURCES_PATH = path.join(OUT, "hint-data-sources.generated.js");

const MLEDOZE_URL = "https://raw.githubusercontent.com/mledoze/countries/master/countries.json";
const FACTBOOK_TREE_URL =
  "https://api.github.com/repos/factbook/factbook.json/git/trees/master?recursive=1";
const FACTBOOK_RAW = "https://raw.githubusercontent.com/factbook/factbook.json/master";
const CITIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson";
const ELEVATION_FALLBACK_URL =
  "https://raw.githubusercontent.com/samayo/country-json/master/src/country-by-elevation.json";

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(FACTBOOK_CACHE, { recursive: true });

async function readCached(url, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status}`);
  const text = await response.text();
  fs.writeFileSync(file, text);
  return text;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|republic|country|of|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseElevation(text) {
  const match = String(text || "").match(/-?[\d,]+/);
  if (!match) return null;
  const value = Number(match[0].replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

function isoOfProperties(properties) {
  for (const key of ["ISO_A2", "ISO_A2_EH", "WB_A2"]) {
    const value = String(properties?.[key] ?? "")
      .trim()
      .toLowerCase();
    if (/^[a-z]{2}$/.test(value)) return value;
  }
  return null;
}

function climateCategory(code) {
  if (!code) return 0;
  if (code.startsWith("A")) return 1;
  if (code.startsWith("B")) return 2;
  if (code.startsWith("E")) return 8;
  if (code.startsWith("C")) {
    if (code.startsWith("Cs")) return 3;
    if (code === "Cfb" || code === "Cfc") return 5;
    return 4;
  }
  if (code.startsWith("D")) {
    if (/^Df[cd]$|^D[wd]c$|^Ds[cd]$/.test(code)) return 7;
    return 6;
  }
  return 0;
}

function buildClimateGrid() {
  const lookup = new KoppenLookup();
  const width = 180;
  const height = 90;
  const bytes = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const lat = -89 + row * 2;
    for (let column = 0; column < width; column++) {
      const lng = -179 + column * 2;
      const result = lookup.findNearest(lat, lng, 180);
      bytes[row * width + column] = climateCategory(result?.koppenClass);
    }
  }
  return {
    width,
    height,
    data: Buffer.from(bytes).toString("base64"),
  };
}

async function loadFactbookElevations() {
  const tree = JSON.parse(await readCached(FACTBOOK_TREE_URL, FACTBOOK_TREE_PATH));
  const paths = tree.tree
    .map((entry) => entry.path)
    .filter((entry) => /^[^/]+\/[a-z]{2}\.json$/.test(entry));
  const entries = [];
  let next = 0;
  const workers = Array.from({ length: 10 }, async () => {
    while (true) {
      const index = next++;
      if (index >= paths.length) return;
      const sourcePath = paths[index];
      const cachePath = path.join(FACTBOOK_CACHE, sourcePath.replace("/", "__"));
      try {
        const text = await readCached(`${FACTBOOK_RAW}/${sourcePath}`, cachePath);
        const json = JSON.parse(text);
        const countryName = json.Government?.["Country name"] ?? {};
        const short = countryName["conventional short form"]?.text ?? countryName.text ?? "";
        const elevationText = json.Geography?.Elevation?.["mean elevation"]?.text ?? "";
        entries.push({
          name: String(short)
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .trim(),
          elevation: parseElevation(elevationText),
        });
      } catch (error) {
        console.warn(`Skipping factbook ${sourcePath}: ${error.message}`);
      }
    }
  });
  await Promise.all(workers);
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const countryData = COUNTRY_DATA;
  const ne = JSON.parse(fs.readFileSync(NE_PATH, "utf8"));
  const mledoze = JSON.parse(await readCached(MLEDOZE_URL, MLEDOZE_PATH));
  const languageTraits = JSON.parse(fs.readFileSync(LANGUAGE_TRAITS_PATH, "utf8"));
  const factbookEntries = await loadFactbookElevations();
  const elevationFallback = JSON.parse(
    await readCached(ELEVATION_FALLBACK_URL, ELEVATION_FALLBACK_PATH),
  );
  const citiesGeojson = JSON.parse(await readCached(CITIES_URL, CITIES_PATH));

  const isos = new Set(countryData.map((country) => country.iso));
  const neByIso = new Map();
  for (const feature of ne.features || []) {
    const iso = isoOfProperties(feature.properties);
    if (iso) neByIso.set(iso, feature.properties);
  }
  const mledozeByIso = new Map(
    mledoze.map((country) => [String(country.cca2).toLowerCase(), country]),
  );
  const aliases = new Map();
  for (const country of mledoze) {
    for (const name of [
      country.name?.common,
      country.name?.official,
      ...(country.altSpellings || []),
    ]) {
      const key = normalizeName(name);
      if (key && !aliases.has(key)) aliases.set(key, String(country.cca2).toLowerCase());
    }
  }
  const factbookByIso = new Map();
  for (const entry of factbookEntries) {
    let iso = aliases.get(normalizeName(entry.name));
    if (!iso) {
      const key = normalizeName(entry.name);
      let best = "";
      for (const [alias, candidate] of aliases) {
        if (alias.length > best.length && (key.includes(alias) || alias.includes(key))) {
          best = alias;
          iso = candidate;
        }
      }
    }
    if (!iso || !isos.has(iso)) continue;
    const previous = factbookByIso.get(iso);
    if (!previous || (previous.elevation == null && entry.elevation != null)) {
      factbookByIso.set(iso, entry);
    }
  }
  const fallbackByIso = new Map();
  for (const entry of elevationFallback) {
    const iso = aliases.get(normalizeName(entry.country));
    if (iso && isos.has(iso) && entry.elevation != null) fallbackByIso.set(iso, entry.elevation);
  }

  const traits = {};
  let missingElevation = 0;
  let missingMledoze = 0;
  for (const country of countryData) {
    const iso = country.iso;
    const md = mledozeByIso.get(iso);
    const properties = neByIso.get(iso) || {};
    if (!md) missingMledoze++;
    const languageCodes = Object.keys(md?.languages || {});
    const scripts = new Set();
    const families = new Set();
    for (const code of languageCodes) {
      const trait = languageTraits[code];
      if (trait?.script) scripts.add(trait.script);
      if (trait?.family) families.add(trait.family);
    }
    const currencyCode = Object.keys(md?.currencies || {})[0] || null;
    const currency = currencyCode ? md.currencies[currencyCode] : null;
    const elevationMean = factbookByIso.get(iso)?.elevation ?? fallbackByIso.get(iso) ?? null;
    if (elevationMean == null) missingElevation++;
    const landlocked = md?.landlocked === true;
    const borders = Array.isArray(md?.borders)
      ? md.borders.map((border) => border.toLowerCase())
      : [];
    const population = Number(properties.POP_EST);
    const area = Number(md?.area);
    traits[iso] = {
      continent: properties.CONTINENT || null,
      subregion: md?.subregion || null,
      landlocked,
      island: !landlocked && borders.length === 0,
      scripts: [...scripts],
      languageFamilies: [...families],
      currency: currencyCode,
      currencyName: currency?.name || null,
      tld: Array.isArray(md?.tld) ? md.tld[0] || null : null,
      density:
        Number.isFinite(population) && Number.isFinite(area) && area > 0 ? population / area : null,
      elevationMean,
    };
  }

  const familyCounts = new Map();
  const scriptCounts = new Map();
  for (const trait of Object.values(traits)) {
    for (const family of trait.languageFamilies || []) {
      familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
    }
    for (const script of trait.scripts || []) {
      scriptCounts.set(script, (scriptCounts.get(script) || 0) + 1);
    }
  }
  for (const trait of Object.values(traits)) {
    let broadest = null;
    let broadestCount = 0;
    for (const family of trait.languageFamilies || []) {
      const count = familyCounts.get(family) || 0;
      if (count > broadestCount) {
        broadest = family;
        broadestCount = count;
      }
    }
    trait.languageFamily = broadestCount >= 4 ? broadest : null;
    let broadestScript = null;
    let broadestScriptCount = 0;
    for (const script of trait.scripts || []) {
      const count = scriptCounts.get(script) || 0;
      if (count > broadestScriptCount) {
        broadestScript = script;
        broadestScriptCount = count;
      }
    }
    trait.script = broadestScriptCount >= 4 ? broadestScript : null;
    delete trait.languageFamilies;
    delete trait.scripts;
  }

  const cities = [];
  for (const feature of citiesGeojson.features || []) {
    const properties = feature.properties || {};
    const iso = String(properties.iso_a2 || "").toLowerCase();
    if (!isos.has(iso)) continue;
    const population = Number(properties.pop_max) || 0;
    if (population < 200000 && !properties.adm0cap && !properties.worldcity && !properties.megacity)
      continue;
    const [lng, lat] = feature.geometry?.coordinates || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    cities.push([properties.nameascii || properties.name, lat, lng, iso, population]);
  }

  const climate = buildClimateGrid();
  fs.writeFileSync(
    path.join(OUT, "country-traits.generated.js"),
    `// Generated by scripts/generate-hint-data.mjs. Do not edit.\nexport const COUNTRY_TRAITS = ${JSON.stringify(traits, null, 0)};\n`,
  );
  fs.writeFileSync(
    path.join(OUT, "cities.generated.js"),
    `// Generated by scripts/generate-hint-data.mjs. Do not edit.\n// [name, latitude, longitude, iso2, population]\nexport const MAJOR_CITIES = ${JSON.stringify(cities)};\n`,
  );
  fs.writeFileSync(
    path.join(OUT, "climate-grid.generated.js"),
    `// Generated by scripts/generate-hint-data.mjs. Do not edit.\nexport const CLIMATE_GRID_WIDTH = ${climate.width};\nexport const CLIMATE_GRID_HEIGHT = ${climate.height};\nexport const CLIMATE_GRID_BASE64 = ${JSON.stringify(climate.data)};\n`,
  );
  fs.writeFileSync(
    DATA_SOURCES_PATH,
    `export const HINT_DATA_SOURCES = ${JSON.stringify(
      {
        sources: [
          {
            name: "Natural Earth Admin 0 Countries and Populated Places",
            license: "Public domain",
            url: "https://www.naturalearthdata.com/",
          },
          {
            name: "mledoze/countries",
            license: "ODbL 1.0",
            url: "https://github.com/mledoze/countries",
          },
          {
            name: "CIA World Factbook country profiles",
            license: "Public domain",
            url: "https://github.com/factbook/factbook.json",
          },
          {
            name: "Koppen-Geiger climate classification lookup",
            license: "ISC package; data citation: Kottek et al. 2006 and Rubel et al. 2017",
            url: "https://koeppen-geiger.vu-wien.ac.at/present.htm",
          },
        ],
      },
      null,
      2,
    )};\n`,
  );
  console.log(`Traits: ${Object.keys(traits).length}, cities: ${cities.length}`);
  console.log(`Missing mledoze: ${missingMledoze}, missing elevation: ${missingElevation}`);
  console.log(
    `Climate grid: ${climate.width}x${climate.height}, ${climate.data.length} base64 chars`,
  );
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
