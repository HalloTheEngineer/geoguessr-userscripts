import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { buildSite } from "../tooling/build-site.mjs";
import { listConfigs } from "../tooling/build-userscript.mjs";

test("GitHub Pages site contains every script and install link", async () => {
  await buildSite();
  const html = await fs.readFile(".pages/index.html", "utf8");
  for (const name of [
    "AdBlocker",
    "GeoGamble",
    "GeoSurfer",
    "Match Notifier",
    "Better Game History",
  ]) {
    assert.match(html, new RegExp(name));
  }
  for (const file of [
    "geoguessr-adblocker.user.js",
    "geoguessr-geogamble.user.js",
    "geoguessr-geosurfer.user.js",
    "geoguessr-match-notifier.user.js",
    "geoguessr-better-game-history.user.js",
  ]) {
    assert.match(html, new RegExp(`href="${file.replaceAll(".", "\\.")}"`));
  }
  assert.match(html, /id="better-game-history"/);
  assert.match(html, /id="persistent-game-summary"/);
  assert.match(html, /data-script="better-game-history"/);
  assert.match(html, /data-script-version="[^"]+"/);
  assert.match(html, /data-install-button/);
  assert.match(html, /installStatusNote/);
  assert.doesNotMatch(html, /undefined\/tree/);
  assert.doesNotMatch(html, /style="--accent/);
  assert.match(html, /<h1>GeoGuessr Toolkit<\/h1>/);
  assert.doesNotMatch(html, /class="brand"/);
  assert.equal((html.match(/class="scriptRow"/g) || []).length, 5);
  assert.equal((html.match(/class="scriptPreview"/g) || []).length, 5);
  assert.equal((html.match(/class="previewThumb"/g) || []).length, 3);
  assert.equal((html.match(/class="previewEmpty"/g) || []).length, 4);
  assert.match(html, /previewDialog/);
  assert.match(html, /previewImage/);
  assert.match(html, /src="app\.js\?v=[a-f0-9]+"/);
  assert.match(html, /href="styles\.css\?v=[a-f0-9]+"/);
  assert.match(html, /previews\/geosurfer\/01\.webp/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
});

test("Better Game History keeps a legacy artifact and anchor alias", async () => {
  const configs = await listConfigs();
  const history = configs.find((config) => config.name === "better-game-history");
  assert.ok(history);
  assert.deepEqual(history.publish.compatibilityFilenames, [
    "geoguessr-persistent-game-summary.user.js",
  ]);
  assert.deepEqual(history.site.legacyAnchors, ["persistent-game-summary"]);
});
