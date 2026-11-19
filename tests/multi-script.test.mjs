import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Window } from "happy-dom";

const bundles = [
  ["match-notifier", "geoguessr-match-notifier.user.js"],
  ["adblocker", "geoguessr-adblocker.user.js"],
  ["geosurfer", "geoguessr-geosurfer.user.js"],
  ["better-game-history", "geoguessr-better-game-history.user.js"],
  ["geogamble", "geoguessr-geogamble.user.js"],
];

test("multiple userscripts share one runtime host and settings tab", async () => {
  const dom = new Window({ url: "https://www.geoguessr.com/" });
  Object.assign(globalThis, {
    window: dom,
    document: dom.document,
    location: dom.location,
    history: dom.history,
    localStorage: dom.localStorage,
    sessionStorage: dom.sessionStorage,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    Node: dom.Node,
    MutationObserver: dom.MutationObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
  });
  dom.document.body.innerHTML = `
    <dialog open data-settings-panel>
      <div><div role="tablist"><button role="tab">General</button></div></div>
      <div><div role="tabpanel">Native</div></div>
    </dialog>
  `;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));

  try {
    for (const [pkg, name] of bundles) {
      new Function(fs.readFileSync(`packages/${pkg}/dist/${name}`, "utf8"))();
    }
    new Function(
      fs.readFileSync("packages/match-notifier/dist/geoguessr-match-notifier.user.js", "utf8"),
    )();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const host = dom.window.__GG_KIT_SETTINGS__;
    assert.ok(host);
    assert.deepEqual([...host.registrations.keys()].sort(), [
      "adblocker",
      "better-game-history",
      "geogamble",
      "geosurfer",
      "match-notifier",
    ]);
    assert.equal(dom.document.querySelectorAll("#ggk-userscripts-tab").length, 1);
    assert.equal(dom.document.querySelectorAll(".ggk-subTab").length, 5);
    const panel = dom.document.getElementById("ggk-userscripts-panel");
    const geogambleTab = [...panel.querySelectorAll(".ggk-subTab")].find(
      (tab) => tab.textContent === "GeoGamble",
    );
    geogambleTab.click();
    const allToggle = panel.querySelector('.gg-countryAllRow input[type="checkbox"]');
    assert.ok(allToggle);
    const search = panel.querySelector(".gg-countrySearch");
    search.value = "fra";
    search.dispatchEvent(new dom.Event("input", { bubbles: true }));
    const option = panel.querySelector(".gg-countryToggleRow");
    assert.ok(option);
    option.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(dom.window.GeoGamble.settings.enabledCountries, ["fr"]);
    assert.equal(getComputedStyle(panel.querySelector(".ggk-scriptBody")).gap, "12px");
    assert.equal(dom.document.getElementById("ggk-settings-fab"), null);
    assert.equal(dom.document.getElementById("ggk-settings-modal"), null);

    const http = dom.window.__GG_KIT_HTTP__;
    const ws = dom.window.__GG_KIT_WS__;
    assert.equal(http.installed, true);
    assert.equal(ws.installed, true);
    assert.ok(ws.json.size >= 3);
    assert.equal(dom.window.GeoGamble.version !== undefined, true);
    assert.equal(dom.document.querySelectorAll("#ggk-userscripts-panel").length, 1);
    assert.equal(
      warnings.some((line) => line.includes("duplicate settings registration")),
      false,
    );
  } finally {
    console.warn = originalWarn;
  }
});
