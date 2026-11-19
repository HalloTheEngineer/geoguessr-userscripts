import fs from "node:fs";
import { CONFIG, COUNTRY_DATA, Core } from "../src/core/index.js";

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
let bundleCache = null;

export function loadCore() {
  return { VERSION: packageJson.version, CONFIG, COUNTRY_DATA, Core };
}

export function loadBundleCore() {
  if (bundleCache) return bundleCache;
  const code = fs.readFileSync(
    new URL("../dist/geoguessr-geogamble.user.js", import.meta.url),
    "utf8",
  );
  globalThis.__GEOGAMBLE_TEST__ = true;
  try {
    new Function(code)();
  } finally {
    delete globalThis.__GEOGAMBLE_TEST__;
  }
  bundleCache = globalThis.__GEOGAMBLE_EXPORTS__;
  delete globalThis.__GEOGAMBLE_EXPORTS__;
  return bundleCache;
}

export function seededRandom(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createScheduler() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: now + Math.max(0, Number(ms) || 0) });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = now + Math.max(0, Number(ms) || 0);
      while (true) {
        let next = null;
        for (const [id, timer] of timers) {
          if (timer.at <= target && (!next || timer.at < next.timer.at)) {
            next = { id, timer };
          }
        }
        if (!next) break;
        now = Math.max(now, next.timer.at);
        timers.delete(next.id);
        next.timer.fn();
      }
      now = target;
    },
    get now() {
      return now;
    },
    get pending() {
      return timers.size;
    },
  };
}
