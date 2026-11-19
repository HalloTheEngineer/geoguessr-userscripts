import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { buildSite } from "../tooling/build-site.mjs";

test("GitHub Pages site contains every script and install link", async () => {
  await buildSite();
  const html = await fs.readFile(".pages/index.html", "utf8");
  for (const name of [
    "AdBlocker",
    "GeoGamble",
    "GeoSurfer",
    "Match Notifier",
    "Persistent Game Summary",
  ]) {
    assert.match(html, new RegExp(name));
  }
  for (const file of [
    "geoguessr-adblocker.user.js",
    "geoguessr-geogamble.user.js",
    "geoguessr-geosurfer.user.js",
    "geoguessr-match-notifier.user.js",
    "geoguessr-persistent-game-summary.user.js",
  ]) {
    assert.match(html, new RegExp(`href="${file.replaceAll(".", "\\.")}"`));
  }
  assert.match(html, /geosurfer-poster\.webp/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
});
