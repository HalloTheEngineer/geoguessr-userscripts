import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://www.geoguessr.com/" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  location: dom.location,
  localStorage: dom.localStorage,
  sessionStorage: dom.sessionStorage,
});

const { defineConfig } = await import("../src/config/define-config.js");

type TestConfig = {
  enabled: boolean;
  volume: number;
  label: string;
  countries: string[];
};

function makeConfig(key = "gg.test.config") {
  return defineConfig<TestConfig>({
    key,
    version: 1,
    fields: {
      enabled: { type: "boolean", default: true },
      volume: { type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
      label: { type: "text", default: "hello" },
      countries: {
        type: "custom",
        default: [],
        parse: (value) => (Array.isArray(value) ? value.map(String) : undefined),
      },
    },
  });
}

test("config defaults, updates, persistence, and reset", () => {
  const config = makeConfig();
  assert.deepEqual(config.get(), {
    enabled: true,
    volume: 0.5,
    label: "hello",
    countries: [],
  });
  config.set("volume", 2);
  assert.equal(config.get("volume"), 1);
  config.set("enabled", false);
  config.patch({ label: "world", countries: ["fr", "de"] });
  config.flush();
  const raw = JSON.parse(localStorage.getItem("gg.test.config") || "null");
  assert.equal(raw.v, 1);
  assert.equal(raw.data.enabled, false);
  assert.equal(raw.data.volume, 1);
  assert.deepEqual(raw.data.countries, ["fr", "de"]);

  const reloaded = makeConfig();
  assert.equal(reloaded.get("enabled"), false);
  assert.equal(reloaded.get("label"), "world");
  reloaded.reset("volume");
  assert.equal(reloaded.get("volume"), 0.5);
  reloaded.clear();
  assert.equal(localStorage.getItem("gg.test.config"), null);
  assert.equal(reloaded.get("enabled"), true);
});

test("config validates and reports invalid values", () => {
  const config = makeConfig("gg.test.invalid");
  config.set("volume", "not a number" as unknown as number);
  assert.equal(config.get("volume"), 0.5);
  config.set("enabled", "true" as unknown as boolean);
  assert.equal(config.get("enabled"), true);
});

test("config migrates older envelopes and backs up the raw value", () => {
  localStorage.setItem(
    "gg.test.migrate",
    JSON.stringify({ v: 1, data: { enabled: false, oldVolume: 0.2 } }),
  );
  const config = defineConfig<TestConfig>({
    key: "gg.test.migrate",
    version: 2,
    fields: {
      enabled: { type: "boolean", default: true },
      volume: { type: "range", default: 0.5, min: 0, max: 1 },
      label: { type: "text", default: "hello" },
      countries: { type: "custom", default: [] },
    },
    migrations: {
      1: (old) => ({ ...old, volume: old.oldVolume }),
    },
  });
  assert.equal(config.get("enabled"), false);
  assert.equal(config.get("volume"), 0.2);
  assert.ok(localStorage.getItem("gg.test.migrate.backup"));
});
