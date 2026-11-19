#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listConfigs, loadRepoConfig } from "./build-userscript.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "migration");

const LEGACY = [
  {
    package: "adblocker",
    file: "geoguessr-adblocker.user.js",
    name: "AdBlocker & Debloater [GeoGuessr]",
    gistId: "5359dc6c14186c8abcc4e262ac9d5276",
  },
  {
    package: "match-notifier",
    file: "geoguessr-match-notifier.user.js",
    name: "[GeoGuessr] Match Notifier",
    gistId: "c3adcee6d281d12199e7b3ebc6c489c9",
  },
  {
    package: "better-game-history",
    file: "geoguessr-persistent-game-summary.user.js",
    name: "[GeoGuessr] Persistent Game Summary & History",
    gistId: "30e6ab630a8a06d5ce16cc54454a4f8b",
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function notice(legacy, configs, pagesUrl) {
  const rows = configs
    .filter((config) => config.site)
    .sort((left, right) => (left.site.order || 0) - (right.site.order || 0))
    .map((config) => {
      const site = config.site;
      return `<li><a href="${pagesUrl}/#${escapeHtml(site.anchor)}" target="_blank" rel="noopener"><strong>${escapeHtml(site.displayName)}</strong><span>${escapeHtml(site.summary)}</span></a></li>`;
    })
    .join("\n          ");
  return `// ==UserScript==
// @name         ${legacy.name}
// @version      2026.11.20
// @description  This legacy userscript has moved. Install the current GeoGuessr Toolkit scripts from the new page.
// @author       PixlPainter
// @license      MIT
// @updateURL    https://gist.github.com/HalloTheEngineer/${legacy.gistId}/raw/${legacy.file}
// @downloadURL  https://gist.github.com/HalloTheEngineer/${legacy.gistId}/raw/${legacy.file}
// @match        https://www.geoguessr.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geoguessr.com
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(() => {
  const PAGE = ${JSON.stringify(pagesUrl)};
  const SESSION_KEY = "gg-toolkit-migration-notice-dismissed";

  try {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
  } catch {
    // Continue without dismissal support.
  }

  const style = document.createElement("style");
  style.textContent = \`
    #gg-toolkit-migration {
      position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
      width: min(380px, calc(100vw - 36px)); max-height: min(70vh, 560px); overflow: auto;
      border: 1px solid rgba(188,167,255,.28); border-radius: 16px;
      background: linear-gradient(165deg, rgba(30,26,48,.98), rgba(13,13,23,.98));
      color: #f7f5ff; box-shadow: 0 20px 70px rgba(0,0,0,.58);
      font: 13px/1.45 var(--default-font, system-ui, sans-serif);
    }
    #gg-toolkit-migration * { box-sizing: border-box; }
    #gg-toolkit-migration .ggm-head { padding: 16px 18px 12px; border-bottom: 1px solid rgba(255,255,255,.1); }
    #gg-toolkit-migration .ggm-kicker { margin: 0 0 5px; color: #bca7ff; font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    #gg-toolkit-migration h2 { margin: 0; font-size: 20px; letter-spacing: -.03em; }
    #gg-toolkit-migration p { margin: 7px 0 0; color: #aaa5bd; font-size: 12px; }
    #gg-toolkit-migration .ggm-list { display: grid; gap: 3px; margin: 0; padding: 10px; list-style: none; }
    #gg-toolkit-migration .ggm-list a { display: flex; flex-direction: column; gap: 2px; padding: 9px 10px; border-radius: 9px; color: inherit; text-decoration: none; }
    #gg-toolkit-migration .ggm-list a:hover { background: rgba(255,255,255,.07); }
    #gg-toolkit-migration .ggm-list strong { font-size: 12px; }
    #gg-toolkit-migration .ggm-list span { color: #9994ac; font-size: 11px; }
    #gg-toolkit-migration .ggm-actions { display: flex; gap: 8px; padding: 0 16px 16px; }
    #gg-toolkit-migration .ggm-page { flex: 1; padding: 10px 12px; border-radius: 8px; background: #7952e9; color: #fff; font-weight: 800; text-align: center; text-decoration: none; }
    #gg-toolkit-migration .ggm-page:hover { background: #8763ef; }
    #gg-toolkit-migration .ggm-dismiss { padding: 10px 12px; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; background: transparent; color: #aaa5bd; font: inherit; cursor: pointer; }
    #gg-toolkit-migration .ggm-dismiss:hover { color: #fff; border-color: rgba(255,255,255,.3); }
  \`;
  document.head.appendChild(style);

  const mount = () => {
    if (document.getElementById("gg-toolkit-migration")) return;
    if (!document.body) {
      setTimeout(mount, 50);
      return;
    }
    const banner = document.createElement("aside");
    banner.id = "gg-toolkit-migration";
    banner.setAttribute("role", "complementary");
    banner.innerHTML = \`
      <div class="ggm-head">
        <p class="ggm-kicker">Legacy userscript</p>
        <h2>GeoGuessr Toolkit has moved</h2>
        <p>This gist script is no longer maintained. Install the current versions from the new page.</p>
      </div>
      <ul class="ggm-list">
          ${rows}
      </ul>
      <div class="ggm-actions">
        <a class="ggm-page" href="\${PAGE}" target="_blank" rel="noopener">Open installation page</a>
        <button class="ggm-dismiss" type="button">Hide for this session</button>
      </div>
    \`;
    banner.querySelector(".ggm-dismiss").addEventListener("click", () => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {}
      banner.remove();
    });
    document.body.appendChild(banner);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
`;
}

const [configs, repo] = await Promise.all([listConfigs(), loadRepoConfig()]);
await fs.mkdir(OUT, { recursive: true });
for (const legacy of LEGACY) {
  const file = path.join(OUT, legacy.file);
  await fs.writeFile(file, notice(legacy, configs, repo.pagesUrl));
  console.log(`Wrote ${path.relative(ROOT, file)}`);
}
