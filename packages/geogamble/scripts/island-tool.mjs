#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  blockStats,
  parseBlock,
  polygonBounds,
  readExclusions,
  renderModuleBlock,
  writeBlock,
} from "./country-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "src", "core", "countries.generated.js");
const EXCLUSIONS = path.join(ROOT, "scripts", "data", "polygon-exclusions.json");
const PAGE = path.join(ROOT, "scripts", "island-tool.html");
const PORT = Number(process.env.PORT) || 4173;
const HOST = "127.0.0.1";

function readTarget() {
  return fs.readFileSync(TARGET, "utf8");
}

function loadState() {
  return { entries: parseBlock(readTarget()), exclusions: readExclusions(EXCLUSIONS) };
}

function countryPayload(entries) {
  return entries.map((country) => ({
    iso: country.iso,
    name: country.name,
    mainOnly: country.mainOnly !== false,
    polygons: country.polygons
      .map((rings, index) => ({ index, rings, ...polygonBounds(rings) }))
      .sort((a, b) => a.minLng - b.minLng || a.minLat - b.minLat),
  }));
}

function applySelection(entries, exclusions, selections) {
  const next = entries.map((country) => ({ ...country, polygons: [...country.polygons] }));
  const byIso = new Map(next.map((country) => [country.iso, country]));
  const nextExclusions = JSON.parse(JSON.stringify(exclusions));
  const removed = [];
  for (const [rawIso, rawIndexes] of Object.entries(selections || {})) {
    const iso = String(rawIso).toLowerCase();
    const country = byIso.get(iso);
    if (!country) throw new Error(`Unknown country: ${iso}`);
    if (!Array.isArray(rawIndexes)) throw new Error(`Invalid selection for ${iso}`);
    const indexes = [...new Set(rawIndexes.map(Number))];
    for (const index of indexes) {
      if (!Number.isInteger(index) || index < 0 || index >= country.polygons.length) {
        throw new Error(`Invalid polygon index ${index} for ${iso}`);
      }
    }
    if (!indexes.length) continue;
    if (indexes.length >= country.polygons.length) {
      throw new Error(`Refusing to remove every polygon of ${iso}`);
    }
    const rects = indexes.map((index) => {
      const bounds = polygonBounds(country.polygons[index]);
      const name = `${country.name} #${index}`;
      removed.push({ iso, name });
      return { name, ...bounds };
    });
    country.polygons = country.polygons.filter((_, index) => !indexes.includes(index));
    const list = Array.isArray(nextExclusions[country.iso])
      ? nextExclusions[country.iso]
      : (nextExclusions[country.iso] = []);
    for (const rect of rects) {
      const duplicate = list.some(
        (existing) =>
          existing.minLat === rect.minLat &&
          existing.maxLat === rect.maxLat &&
          existing.minLng === rect.minLng &&
          existing.maxLng === rect.maxLng,
      );
      if (!duplicate) list.push(rect);
    }
  }
  return { entries: next, exclusions: nextExclusions, removed };
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(fs.readFileSync(PAGE));
    return;
  }
  if (req.method === "GET" && url.pathname === "/data") {
    const { entries, exclusions } = loadState();
    json(res, 200, { countries: countryPayload(entries), exclusions, stats: blockStats(entries) });
    return;
  }
  if (req.method === "POST" && (url.pathname === "/preview" || url.pathname === "/apply")) {
    const body = await readBody(req);
    const { entries, exclusions } = loadState();
    const applied = applySelection(entries, exclusions, body.selections || {});
    const stats = blockStats(applied.entries);
    if (url.pathname === "/apply") {
      const nextText = writeBlock(readTarget(), renderModuleBlock(applied.entries));
      fs.writeFileSync(TARGET, nextText);
      fs.writeFileSync(EXCLUSIONS, `${JSON.stringify(applied.exclusions, null, 2)}\n`);
    }
    json(res, 200, {
      applied: url.pathname === "/apply",
      removed: applied.removed,
      stats,
      exclusions: applied.exclusions,
    });
    return;
  }
  json(res, 404, { error: "not found" });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    json(res, 400, { error: error.message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`GeoGamble island tool: http://${HOST}:${PORT}`);
  console.log(
    `Data: ${path.relative(ROOT, TARGET)} | exclusions: ${path.relative(ROOT, EXCLUSIONS)}`,
  );
});
