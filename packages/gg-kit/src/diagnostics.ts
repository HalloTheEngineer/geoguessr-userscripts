import { isBuildId, pageKind, siteBuild } from "./page.js";
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

export function checkSiteBuild(): {
  build: string | null;
  changed: boolean;
  previous: string | null;
} {
  const build = siteBuild();
  if (!build || !hasDom()) return { build, changed: false, previous: null };
  let previous: string | null = null;
  try {
    const stored = localStorage.getItem(BUILD_KEY);
    previous = isBuildId(stored) ? stored : null;
    localStorage.setItem(BUILD_KEY, build);
  } catch {
    // storage unavailable
  }
  const state = registry();
  const changed = !!previous && previous !== build;
  if (changed && !state.buildWarned) {
    state.buildWarned = true;
    console.warn(
      `[gg-kit] GeoGuessr build changed (${previous} -> ${build}); selectors may need updating`,
    );
  }
  return { build, changed, previous };
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
