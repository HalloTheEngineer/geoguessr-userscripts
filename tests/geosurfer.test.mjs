import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Window } from "happy-dom";

test("geosurfer inserts one lazy card and cleans it up", async () => {
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
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  dom.document.body.innerHTML = `
    <div class="in-game-stats-overlay_root__abc">
      <div class="in-game-stats-overlay_cardWrapper__abc">One</div>
      <div class="in-game-stats-overlay_cardWrapper__abc">Two</div>
    </div>
  `;
  new Function(fs.readFileSync("packages/geosurfer/dist/geoguessr-geosurfer.user.js", "utf8"))();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const card = dom.document.getElementById("gg-surfer-card");
  assert.ok(card);
  assert.equal(dom.document.querySelectorAll("#gg-surfer-card").length, 1);
  assert.ok(card.querySelector("video"));
  assert.match(card.querySelector("video").dataset.src || "", /brainrot\.mp4/);
  dom.document.querySelector(".in-game-stats-overlay_cardWrapper__abc")?.remove();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(dom.document.getElementById("gg-surfer-card"), null);
});
