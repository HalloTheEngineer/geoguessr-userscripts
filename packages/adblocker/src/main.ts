import { injectStyle, isTopFrame, startUserscript } from "gg-kit";
import networkRules from "../network-rules.json";
import { adblockerConfig } from "./config.js";
import type { Category } from "./rules.js";
import {
  ANCESTOR_BLOCK_CONFIG,
  CSS_HIDING_SELECTORS,
  DIRECT_BLOCK_CONFIG,
  HTML_INSERTS,
  STRUCTURAL_MAPPINGS,
} from "./rules.js";

declare const __ADBLOCKER_VERSION__: string;

function categoryEnabled(category: Category): boolean {
  if (!adblockerConfig.get("enabled")) return false;
  switch (category) {
    case "ads":
      return adblockerConfig.get("blockAdsAndAnalytics");
    case "home":
      return adblockerConfig.get("cleanupHome");
    case "inGame":
      return adblockerConfig.get("cleanupInGame");
    case "multiplayer":
      return adblockerConfig.get("cleanupMultiplayer");
  }
}

const LOCALE_PREFIXES = new Set([
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "hu",
  "it",
  "ja",
  "ko",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sv",
  "tr",
  "uk",
  "zh",
]);

function normalizedPath(): string {
  const segments = location.pathname.split("/").filter(Boolean);
  if (segments.length > 1 && LOCALE_PREFIXES.has(segments[0].toLowerCase())) {
    return `/${segments.slice(1).join("/")}`;
  }
  return location.pathname || "/";
}

function pathMatches(urlPaths?: string[]): boolean {
  if (!urlPaths?.length) return true;
  const path = normalizedPath();
  return urlPaths.some((value) => path === value || path.startsWith(`${value}/`));
}

function log(...args: unknown[]): void {
  if (adblockerConfig.get("debug")) console.log("[adblocker]", ...args);
}

function isBlockedUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url, location.href).hostname.toLowerCase();
    return networkRules.blockedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

function syncCss(): void {
  const selectors = CSS_HIDING_SELECTORS.filter(
    (rule) => categoryEnabled(rule.category) && pathMatches(rule.url_paths),
  ).map((rule) => rule.selector);
  const css = `${
    selectors.length
      ? `${selectors.join(", ")} { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }`
      : ""
  }
       #ggb-insert-links a { transition: transform .2s ease, filter .2s ease; }
       #ggb-insert-links a:hover { transform: scale(1.05); filter: brightness(1.1); }
       .ggb-menu-image { display:block; width:56px; height:56px; object-fit:contain; }`;
  const existing = document.getElementById("geoguessr-adblocker-style");
  if (existing) existing.textContent = css;
  else injectStyle("geoguessr-adblocker-style", css);
}

function scanAndRemoveScripts(node: ParentNode | null): void {
  if (!node || !categoryEnabled("ads")) return;
  const element = node as Element;
  if (
    (element.tagName === "SCRIPT" || element.tagName === "IFRAME") &&
    isBlockedUrl(element.getAttribute("src"))
  ) {
    element.remove();
    return;
  }
  const candidates = node.querySelectorAll<HTMLScriptElement | HTMLIFrameElement>("script, iframe");
  for (const candidate of candidates) {
    if (isBlockedUrl(candidate.getAttribute("src"))) {
      log("blocking", candidate.getAttribute("src"));
      candidate.remove();
    }
  }
}

let blockScheduled = false;

function scheduleBlock(): void {
  if (blockScheduled) return;
  blockScheduled = true;
  const run = () => {
    blockScheduled = false;
    blockElements();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 0);
}

function blockElements(): void {
  if (!adblockerConfig.get("enabled")) {
    document.getElementById("ggb-insert-links")?.remove();
    syncCss();
    return;
  }

  let count = 0;
  for (const rule of DIRECT_BLOCK_CONFIG) {
    if (!categoryEnabled(rule.category) || !pathMatches(rule.url_paths)) continue;
    for (const element of document.querySelectorAll(rule.selector)) {
      element.remove();
      count++;
    }
  }

  for (const rule of ANCESTOR_BLOCK_CONFIG) {
    if (!categoryEnabled(rule.category)) continue;
    for (const element of document.querySelectorAll(rule.selector)) {
      element.closest(rule.ancestor)?.remove();
      count++;
    }
  }

  for (const rule of STRUCTURAL_MAPPINGS) {
    if (!categoryEnabled(rule.category)) continue;
    const sources = document.querySelectorAll(rule.source);
    const targets = document.querySelectorAll(rule.target);
    if (sources.length !== 1 || targets.length !== 1) continue;
    const source = sources[0];
    const target = targets[0];
    if (!source.children.length) continue;
    for (const child of [...source.children]) {
      if (rule.reverseOrder) target.prepend(child);
      else target.append(child);
    }
    source.remove();
    count++;
  }

  const shortcutsEnabled = adblockerConfig.get("homepageDuelShortcuts") && categoryEnabled("home");
  if (!shortcutsEnabled) document.getElementById("ggb-insert-links")?.remove();
  for (const insert of HTML_INSERTS) {
    if (!shortcutsEnabled || !categoryEnabled(insert.category) || !pathMatches(insert.url_paths))
      continue;
    for (const target of document.querySelectorAll(insert.selector)) {
      if (!target.querySelector(`#${insert.insertId}`)) {
        target.insertAdjacentHTML(insert.position, insert.html);
        count++;
      }
    }
  }
  syncCss();
  if (count) log("elements handled", count);
}

startUserscript({
  name: "adblocker",
  version: __ADBLOCKER_VERSION__,
  config: adblockerConfig,
  topFrameOnly: false,
  settings: isTopFrame()
    ? {
        id: "adblocker",
        title: "AdBlocker & Debloater",
        shortTitle: "AdBlocker",
        order: 10,
        config: adblockerConfig,
        sections: [
          { id: "general", title: "General", fields: ["enabled"] },
          { id: "ads", title: "Ads and analytics", fields: ["blockAdsAndAnalytics"] },
          {
            id: "ui",
            title: "UI cleanup",
            fields: ["cleanupHome", "cleanupInGame", "cleanupMultiplayer", "homepageDuelShortcuts"],
          },
          { id: "advanced", title: "Advanced", fields: ["debug"] },
        ],
      }
    : null,
  setup(context) {
    const observer = new MutationObserver((mutations) => {
      if (!adblockerConfig.get("enabled")) return;
      let changed = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            scanAndRemoveScripts(node as Element);
            changed = true;
          }
        }
      }
      if (changed) scheduleBlock();
    });

    let observing = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const stopObserver = () => {
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
      observer.disconnect();
      observing = false;
    };
    const startObserver = () => {
      if (observing || retry || !adblockerConfig.get("enabled")) return;
      const root = document.documentElement;
      if (!root) {
        retry = setTimeout(() => {
          retry = null;
          startObserver();
        }, 20);
        return;
      }
      observer.observe(root, { childList: true, subtree: true });
      observing = true;
      context.log("initialized");
    };

    const sync = () => {
      if (adblockerConfig.get("enabled")) {
        startObserver();
        blockElements();
        scanAndRemoveScripts(document.documentElement);
      } else {
        stopObserver();
        blockElements();
      }
    };
    const unsubscribe = adblockerConfig.subscribe(sync);
    context.onCleanup(unsubscribe);

    const onReady = () => {
      if (!adblockerConfig.get("enabled")) return;
      blockElements();
      scanAndRemoveScripts(document.body);
    };
    window.addEventListener("DOMContentLoaded", onReady, { once: true });

    startObserver();
    blockElements();
    scanAndRemoveScripts(document.documentElement);

    context.onRoute(() => {
      if (!adblockerConfig.get("enabled")) return;
      blockElements();
      scanAndRemoveScripts(document.documentElement);
    });
    context.onCleanup(() => {
      stopObserver();
      window.removeEventListener("DOMContentLoaded", onReady);
      document.getElementById("geoguessr-adblocker-style")?.remove();
      document.getElementById("ggb-insert-links")?.remove();
    });
  },
});
