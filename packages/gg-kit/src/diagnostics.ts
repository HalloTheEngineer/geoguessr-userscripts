import { isBuildId, pageKind, type SiteBuildScheme, siteBuild, siteBuildInfo } from "./page.js";
import { health, type SelectorHealth } from "./selectors.js";
import { hasDom, pageWindow } from "./window.js";

interface ScriptInfo {
  name: string;
  version: string;
  loadedAt: string;
}

interface Registry {
  apiVersion: number;
  scripts: Map<string, ScriptInfo>;
  buildWarned: boolean;
}

const KEY = "__GG_KIT_DIAGNOSTICS__";
const API_VERSION = 1;
const BUILD_KEY = "gg-kit.last-site-build";
const BUILD_SCHEMES: SiteBuildScheme[] = ["app", "next", "spa"];
let buildRetryScheduled = false;
let buildRetryDone = false;

interface StoredBuild {
  build: string | null;
  scheme: SiteBuildScheme | "legacy" | null;
}

function decodeBuild(stored: string | null): StoredBuild {
  if (!stored) return { build: null, scheme: null };
  const separator = stored.indexOf(":");
  if (separator > 0) {
    const scheme = stored.slice(0, separator) as SiteBuildScheme;
    const value = stored.slice(separator + 1);
    if (BUILD_SCHEMES.includes(scheme) && isBuildId(value)) return { build: value, scheme };
    return { build: null, scheme: "legacy" };
  }
  // Values written before the scheme was recorded cannot be compared across shapes.
  return { build: isBuildId(stored) ? stored : null, scheme: "legacy" };
}

function registry(): Registry {
  const win = pageWindow() as unknown as Record<string, Registry | undefined>;
  if (win[KEY]) {
    if (win[KEY]!.apiVersion !== API_VERSION) {
      console.warn(
        `[gg-kit] diagnostics registry version mismatch (${win[KEY]!.apiVersion} vs ${API_VERSION})`,
      );
    }
    return win[KEY]!;
  }
  const value: Registry = {
    apiVersion: API_VERSION,
    scripts: new Map(),
    buildWarned: false,
  };
  win[KEY] = value;
  return value;
}

export function registerScript(name: string, version: string): void {
  registry().scripts.set(name, { name, version, loadedAt: new Date().toISOString() });
}

function scheduleBuildRecheck(): void {
  if (!hasDom() || buildRetryScheduled || buildRetryDone) return;
  buildRetryScheduled = true;
  const run = () => {
    buildRetryScheduled = false;
    buildRetryDone = true;
    checkSiteBuild();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    setTimeout(run, 0);
  }
}

export function checkSiteBuild(): {
  build: string | null;
  changed: boolean;
  previous: string | null;
} {
  const info = siteBuildInfo();
  if (!info || !hasDom()) {
    // At document-start the config script (which sets __GEOGUESSR_BUILD_ID__) may
    // not have executed yet, so try once more when the document is parseable.
    scheduleBuildRecheck();
    return { build: info?.build ?? null, changed: false, previous: null };
  }
  let previous: StoredBuild = { build: null, scheme: null };
  try {
    previous = decodeBuild(localStorage.getItem(BUILD_KEY));
    localStorage.setItem(BUILD_KEY, `${info.scheme}:${info.build}`);
  } catch {
    // storage unavailable
  }
  const state = registry();
  const changed =
    !!previous.build && previous.build !== info.build && previous.scheme === info.scheme;
  if (changed && !state.buildWarned) {
    state.buildWarned = true;
    console.warn(
      `[gg-kit] GeoGuessr build changed (${previous.build} -> ${info.build}); selectors may need updating`,
    );
  }
  return { build: info.build, changed, previous: previous.build };
}

export interface DiagnosticsReport {
  siteBuild: string | null;
  page: string;
  url: string;
  scripts: ScriptInfo[];
  selectors: SelectorHealth[];
  missingSelectors: string[];
}

export function report(): DiagnosticsReport {
  const selectors = hasDom() ? health() : [];
  return {
    siteBuild: siteBuild(),
    page: hasDom() ? pageKind() : "unknown",
    url: hasDom() ? location.href : "",
    scripts: [...registry().scripts.values()],
    selectors,
    missingSelectors: selectors.filter((item) => !item.ok).map((item) => item.key),
  };
}

export function logReport(): void {
  console.group("[gg-kit] diagnostics");
  console.log(report());
  console.groupEnd();
}

export function debugEnabled(): boolean {
  if (!hasDom()) return false;
  try {
    if (localStorage.getItem("gg.debug") === "1") return true;
  } catch {
    // ignore
  }
  return new URLSearchParams(location.search).has("ggdebug");
}

export function debug(...args: unknown[]): void {
  if (debugEnabled()) console.log("[gg-kit]", ...args);
}

if (hasDom()) {
  (pageWindow() as unknown as Record<string, unknown>).__GG_DIAGNOSTICS__ = {
    report,
    log: logReport,
  };
}
