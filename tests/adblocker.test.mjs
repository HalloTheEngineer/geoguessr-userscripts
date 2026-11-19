import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Window } from "happy-dom";

const bundle = fs.readFileSync("packages/adblocker/dist/geoguessr-adblocker.user.js", "utf8");

async function runAdblocker(enabled, { readyState = "complete", waitMs = 650 } = {}) {
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
  Object.defineProperty(dom.document, "readyState", { configurable: true, value: readyState });
  dom.localStorage.setItem(
    "gg.adblocker.config",
    JSON.stringify({
      v: 1,
      data: { enabled, blockAdsAndAnalytics: true },
    }),
  );
  dom.document.body.innerHTML = `
    <dialog open data-settings-panel>
      <div><div role="tablist"><button role="tab">General</button></div></div>
      <div><div role="tabpanel">Native</div></div>
    </dialog>
    <script src="https://doubleclick.net/ad.js"></script>`;
  new Function(bundle)();
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return dom;
}

test("disabled AdBlocker leaves blocked script elements alone", async () => {
  const dom = await runAdblocker(false);
  assert.ok(dom.document.querySelector('script[src*="doubleclick"]'));
});

test("enabled AdBlocker removes blocked script elements", async () => {
  const dom = await runAdblocker(true);
  assert.equal(dom.document.querySelector('script[src*="doubleclick"]'), null);
});

test("enabled AdBlocker waits for app readiness before destructive cleanup", async () => {
  const dom = await runAdblocker(true, { readyState: "loading", waitMs: 120 });
  assert.ok(dom.document.querySelector('script[src*="doubleclick"]'));
  dom.window.dispatchEvent(new dom.Event("load"));
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(dom.document.querySelector('script[src*="doubleclick"]'), null);
});
