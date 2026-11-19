import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loadBundleCore } from "./helpers.mjs";

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const source = fs.readFileSync(
  new URL("../dist/geoguessr-geogamble.user.js", import.meta.url),
  "utf8",
);
const { VERSION, CONFIG, COUNTRY_DATA, Core } = loadBundleCore();

test("test loader exposes the userscript API without a browser", () => {
  assert.equal(VERSION, packageJson.version);
  assert.ok(Array.isArray(COUNTRY_DATA));
  assert.ok(COUNTRY_DATA.length >= 170);
  for (const name of [
    "findCountryAt",
    "randomPointInCountry",
    "buildAnimationPoints",
    "buildSchedule",
    "createClickGate",
    "makeFinalEvent",
    "runAnimation",
    "hexToBytes",
    "encodeDuelPinPayload",
    "encodeDuelPinFrame",
    "parseDuelJsonEvent",
    "parseDuelStateEvent",
    "pickCaseCrateOutcome",
    "caseModeAllowed",
    "normalizeCaseSnapshot",
    "caseHintHasOverlay",
    "caseHintBounds",
    "heatmapFootprint",
    "heatmapWeightAt",
    "heatmapColor",
    "buildHeatmapRaster",
  ]) {
    assert.equal(typeof Core[name], "function", `missing Core.${name}`);
  }
});

test("default configuration matches the documented contract", () => {
  assert.deepEqual(CONFIG, {
    enabled: true,
    enabledCountries: "all",
    excludeCountries: [],
    animationMs: 2800,
    startIntervalMs: 45,
    endIntervalMs: 320,
    finalHoldMs: 250,
    sound: true,
    volume: 0.35,
    autoSubmit: false,
    submitDelayMs: 250,
    duelSubmitPin: true,
    duelSubmitHop: false,
    activationKey: "none",
    allowOtherModes: true,
    perfTweaks: true,
    centerBias: 0,
    heatmapOverlay: false,
    debug: false,
  });
});

test("bundle metadata is present and versioned", () => {
  assert.match(source, /^\/\/ ==UserScript==/m);
  assert.match(source, /@match\s+https:\/\/www\.geoguessr\.com\/\*/);
  assert.match(source, /@run-at\s+document-start/);
  assert.match(source, /@grant\s+none/);
  assert.match(source, /@noframes/);
  assert.match(source, new RegExp(`@version\\s+${packageJson.version.replaceAll(".", "\\.")}`));
  assert.doesNotMatch(source, /^import\s/m);
  assert.ok(source.length < 650000, `bundle grew to ${source.length} bytes`);
  assert.doesNotMatch(source, /const COUNTRY_DATA = \[\];/);
});
