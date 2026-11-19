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

test("list store reloads external changes and flushes on dispose", () => {
  const first = createListStore<{ id: string }>({ key: "gg.test.reload", version: 1 });
  const second = createListStore<{ id: string }>({ key: "gg.test.reload", version: 1 });

  first.push({ id: "from-first" });
  first.flush();
  assert.deepEqual(second.reload(), [{ id: "from-first" }]);

  second.push({ id: "pending" });
  second.dispose();
  assert.deepEqual(JSON.parse(localStorage.getItem("gg.test.reload") || "{}").data, [
    { id: "pending" },
    { id: "from-first" },
  ]);
  first.dispose();
});

test("list store validation drops malformed records", () => {
  localStorage.setItem(
    "gg.test.validation",
    JSON.stringify({
      v: 1,
      data: [{ id: "ok" }, { id: 2 }, null],
    }),
  );
  const store = createListStore<{ id: string }>({
    key: "gg.test.validation",
    version: 1,
    create: (value) =>
      value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string"
        ? (value as { id: string })
        : null,
  });
  assert.deepEqual(store.get(), [{ id: "ok" }]);
  store.dispose();
});
