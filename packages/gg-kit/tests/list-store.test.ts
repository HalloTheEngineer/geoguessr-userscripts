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

const { createListStore } = await import("../src/storage/list-store.js");

test("list store persists, caps, updates, and clears", () => {
  const store = createListStore<{ id: string; value: number }>({
    key: "gg.test.list",
    version: 1,
    maxEntries: 2,
  });
  store.push({ id: "a", value: 1 });
  store.push({ id: "b", value: 2 });
  store.push({ id: "c", value: 3 });
  assert.deepEqual(
    store.get().map((item) => item.id),
    ["c", "b"],
  );
  store.update(
    (item) => item.id === "b",
    (item) => ({ ...item, value: 4 }),
  );
  assert.equal(store.get().find((item) => item.id === "b")?.value, 4);
  store.flush();
  const reloaded = createListStore<{ id: string; value: number }>({
    key: "gg.test.list",
    version: 1,
    maxEntries: 2,
  });
  assert.equal(reloaded.get().length, 2);
  store.clear();
  assert.deepEqual(store.get(), []);
  assert.equal(localStorage.getItem("gg.test.list"), null);
});
