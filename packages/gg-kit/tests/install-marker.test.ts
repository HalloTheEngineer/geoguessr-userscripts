import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://hallotheengineer.github.io/geoguessr-userscripts/" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  location: dom.location,
  localStorage: dom.localStorage,
  HTMLElement: dom.HTMLElement,
});

const { INSTALLED_KEY_PREFIX, isToolkitLandingPage, startUserscript } = await import(
  "../src/index.js"
);

test("landing pages record the installed userscript version", () => {
  assert.equal(isToolkitLandingPage(), true);
  let setupCalled = false;
  const handle = startUserscript({
    name: "better-game-history",
    version: "2026.11.19.7",
    setup() {
      setupCalled = true;
    },
  });
  assert.equal(handle.started, false);
  assert.equal(setupCalled, false);
  const marker = JSON.parse(
    localStorage.getItem(`${INSTALLED_KEY_PREFIX}better-game-history`) || "null",
  );
  assert.equal(marker?.version, "2026.11.19.7");
});
