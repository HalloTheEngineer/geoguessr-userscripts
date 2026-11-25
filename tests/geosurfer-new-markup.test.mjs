import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Window } from "happy-dom";

test("geosurfer anchors to the new duel scoreboard markup", async () => {
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
    <div class="_root_byg5v_3">
      <div class="_cardWrapper_byg5v_36">One</div>
      <div class="_cardWrapper_byg5v_36">Two</div>
    </div>
  `;
  new Function(fs.readFileSync("packages/geosurfer/dist/geoguessr-geosurfer.user.js", "utf8"))();
  await new Promise((resolve) => setTimeout(resolve, 150));

  const card = dom.document.getElementById("gg-surfer-card");
  assert.ok(card);
  assert.equal(dom.document.querySelectorAll("#gg-surfer-card").length, 1);
  assert.match(card.className, /_cardWrapper_/);
  assert.ok(card.querySelector("video"));

  const cards = dom.document.querySelectorAll("._cardWrapper_byg5v_36");
  assert.equal(cards.length, 3);

  cards[0].remove();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(dom.document.getElementById("gg-surfer-card"), null);
});
