#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache", "site-build.json");

async function main() {
  const response = await fetch("https://www.geoguessr.com/", {
    headers: { "user-agent": "geoguessr-userscripts-build-check/1.0" },
  });
  if (!response.ok) throw new Error(`GeoGuessr returned ${response.status}`);
  const html = await response.text();
  const buildId = html.match(/"buildId":"([^"]+)"/)?.[1] || null;
  let previous = null;
  try {
    previous = JSON.parse(await fs.readFile(CACHE, "utf8"));
  } catch {
    // first run
  }
  await fs.mkdir(path.dirname(CACHE), { recursive: true });
  await fs.writeFile(
    CACHE,
    `${JSON.stringify({ buildId, checkedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`GeoGuessr build: ${buildId || "unknown"}`);
  if (previous?.buildId && previous.buildId !== buildId) {
    console.log(`Build changed since ${previous.checkedAt}: ${previous.buildId} -> ${buildId}`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
