import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const files = [
  "migration/geoguessr-adblocker.user.js",
  "migration/geoguessr-match-notifier.user.js",
  "migration/geoguessr-persistent-game-summary.user.js",
];

test("legacy migration notices list every new script and stay session-dismissible", async () => {
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    assert.match(source, /@version\s+2026\.11\.20/);
    assert.match(
      source,
      /@name\s+(AdBlocker & Debloater \[GeoGuessr\]|\[GeoGuessr\] Match Notifier|\[GeoGuessr\] Persistent Game Summary & History)/,
    );
    assert.match(source, /gg-toolkit-migration-notice-dismissed/);
    assert.match(source, /sessionStorage\.setItem/);
    for (const label of [
      "AdBlocker",
      "GeoGamble",
      "GeoSurfer",
      "Match Notifier",
      "Persistent Game Summary",
    ]) {
      assert.match(source, new RegExp(label));
    }
    for (const anchor of [
      "adblocker",
      "geogamble",
      "geosurfer",
      "match-notifier",
      "persistent-game-summary",
    ]) {
      assert.match(source, new RegExp(`#${anchor}`));
    }
    assert.match(source, /https:\/\/hallotheengineer\.github\.io\/geoguessr-userscripts/);
  }
});
