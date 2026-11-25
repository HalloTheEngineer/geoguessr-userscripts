import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://www.geoguessr.com/" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  MutationObserver: dom.MutationObserver,
});

const { waitForAppReady } = await import("../src/app-ready.js");

function hideDocumentRoot(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(dom.document, "documentElement");
  const root = dom.document.documentElement;
  Object.defineProperty(dom.document, "documentElement", {
    configurable: true,
    get: () => null,
  });
  return () => {
    if (descriptor) Object.defineProperty(dom.document, "documentElement", descriptor);
    else
      Object.defineProperty(dom.document, "documentElement", { configurable: true, value: root });
  };
}

test("app readiness waits for the document root before observing", async () => {
  Object.defineProperty(dom.document, "readyState", { configurable: true, value: "complete" });
  const restore = hideDocumentRoot();
  let settled = false;
  const ready = waitForAppReady({ quietMs: 10, maxWaitMs: 1000 }).then(() => {
    settled = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(settled, false);

  restore();
  await ready;
  assert.equal(settled, true);
});

test("app readiness settles when the document root never appears", async () => {
  Object.defineProperty(dom.document, "readyState", { configurable: true, value: "complete" });
  const restore = hideDocumentRoot();
  await waitForAppReady({ quietMs: 5, maxWaitMs: 40 });
  restore();
});

test("app readiness rejects when aborted while waiting for the document root", async () => {
  Object.defineProperty(dom.document, "readyState", { configurable: true, value: "complete" });
  const restore = hideDocumentRoot();
  const controller = new AbortController();
  const ready = waitForAppReady({ quietMs: 10, maxWaitMs: 1000, signal: controller.signal });
  controller.abort();
  await assert.rejects(ready, (error: unknown) => {
    return error instanceof Error && error.name === "AbortError";
  });
  restore();
});
