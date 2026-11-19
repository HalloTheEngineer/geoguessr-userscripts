import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { listConfigs } from "../tooling/build-userscript.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configs = await listConfigs();

for (const config of configs) {
  test(`${config.name} artifact is installable and versioned`, () => {
    const file = path.join(config.dir, config.outfile);
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /^\/\/ ==UserScript==/);
    assert.match(source, /^\/\/ ==\/UserScript==$/m);
    assert.match(
      source,
      new RegExp(`@version\\s+${config.packageJson.version.replaceAll(".", "\\.")}`),
    );
    assert.match(source, /@name\s+GeoGuessr Toolkit: /);
    assert.match(source, /@version\s+\d{4}\.\d{1,2}\.\d{1,2}(?:\.\d+)?/);
    assert.match(source, /@match\s+https:\/\/www\.geoguessr\.com\/\*/);
    assert.match(
      source,
      /@match\s+https:\/\/hallotheengineer\.github\.io\/geoguessr-userscripts\/\*/,
    );
    assert.match(source, /@run-at\s+document-start/);
    assert.match(
      source,
      /@updateURL\s+https:\/\/hallotheengineer\.github\.io\/geoguessr-userscripts\//,
    );
    assert.doesNotMatch(source, /^import\s/m);
    assert.doesNotMatch(source, /__VERSION__|__UPDATE_URL__|__DOWNLOAD_URL__/);
    assert.ok(
      source.length <= (config.sizeBudget || Infinity),
      `${config.name} exceeds its size budget`,
    );
    assert.ok(source.length > 1000, `${config.name} artifact is suspiciously small`);
    if (config.name === "geosurfer") {
      assert.match(source, /@grant\s+GM_getResourceURL/);
      assert.match(source, /@resource\s+gg-geosurfer-video\s+https:\/\/github\.com\//);
    }
    if (config.name === "adblocker") {
      assert.match(source, /@webRequest\s+\{/);
    }
  });
}

test("all workspaces are represented by userscript packages", () => {
  const workspaceNames = configs.map((config) => config.name).sort();
  assert.deepEqual(workspaceNames, [
    "adblocker",
    "better-game-history",
    "geogamble",
    "geosurfer",
    "match-notifier",
  ]);
});

test("the repository does not track captured HAR files", () => {
  const harFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".cache")
        continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".har")) harFiles.push(path.relative(ROOT, full));
    }
  };
  walk(ROOT);
  assert.deepEqual(harFiles, []);
});
