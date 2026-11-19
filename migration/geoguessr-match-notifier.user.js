// ==UserScript==
// @name         [GeoGuessr] Match Notifier
// @version      2026.11.20
// @description  This legacy userscript has moved. Install the current GeoGuessr Toolkit scripts from the new page.
// @author       PixlPainter
// @license      MIT
// @updateURL    https://gist.github.com/HalloTheEngineer/c3adcee6d281d12199e7b3ebc6c489c9/raw/geoguessr-match-notifier.user.js
// @downloadURL  https://gist.github.com/HalloTheEngineer/c3adcee6d281d12199e7b3ebc6c489c9/raw/geoguessr-match-notifier.user.js
// @match        https://www.geoguessr.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geoguessr.com
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  const PAGE = "https://hallotheengineer.github.io/geoguessr-userscripts";
  const SESSION_KEY = "gg-toolkit-migration-notice-dismissed";

  try {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
  } catch {
    // Continue without dismissal support.
  }

  const style = document.createElement("style");
  style.textContent = `
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
  `;
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
    banner.innerHTML = `
      <div class="ggm-head">
        <p class="ggm-kicker">Legacy userscript</p>
        <h2>GeoGuessr Toolkit has moved</h2>
        <p>This gist script is no longer maintained. Install the current versions from the new page.</p>
      </div>
      <ul class="ggm-list">
          <li><a href="https://hallotheengineer.github.io/geoguessr-userscripts/#adblocker" target="_blank" rel="noopener"><strong>AdBlocker</strong><span>Blocks known ad and analytics requests, then removes selected UI clutter.</span></a></li>
          <li><a href="https://hallotheengineer.github.io/geoguessr-userscripts/#geogamble" target="_blank" rel="noopener"><strong>GeoGamble</strong><span>Gambles random country points and adds per-round location cases.</span></a></li>
          <li><a href="https://hallotheengineer.github.io/geoguessr-userscripts/#geosurfer" target="_blank" rel="noopener"><strong>GeoSurfer</strong><span>Adds an optional lightweight video overlay to the in-game stats panel.</span></a></li>
          <li><a href="https://hallotheengineer.github.io/geoguessr-userscripts/#match-notifier" target="_blank" rel="noopener"><strong>Match Notifier</strong><span>Plays configurable sounds for duel starts and new rounds.</span></a></li>
          <li><a href="https://hallotheengineer.github.io/geoguessr-userscripts/#persistent-game-summary" target="_blank" rel="noopener"><strong>Persistent Game Summary</strong><span>Tracks duel history and renders rating, score, and performance graphs.</span></a></li>
      </ul>
      <div class="ggm-actions">
        <a class="ggm-page" href="${PAGE}" target="_blank" rel="noopener">Open installation page</a>
        <button class="ggm-dismiss" type="button">Hide for this session</button>
      </div>
    `;
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
