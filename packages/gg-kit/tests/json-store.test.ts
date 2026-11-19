import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://www.geoguessr.com/" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  location: dom.location,
  localStorage: dom.localStorage,
  sessionStorage: dom.sessionStorage,
});

const { createJsonStore } = await import("../src/storage/json-store.js");

test("json store persists versioned values and removes them", () => {
  const store = createJsonStore<{ value: number }>({
    key: "gg.test.json",
    version: 2,
    area: "session",
  });
  assert.equal(store.get(), null);
  store.set({ value: 7 });
  assert.deepEqual(store.get(), { value: 7 });
  const reloaded = createJsonStore<{ value: number }>({
    key: "gg.test.json",
    version: 2,
    area: "session",
  });
  assert.deepEqual(reloaded.get(), { value: 7 });
  store.remove();
  assert.equal(store.get(), null);
});
