import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import type { GameRecord } from "../src/types.js";

const dom = new Window({ url: "https://www.geoguessr.com/" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  location: dom.location,
  localStorage: dom.localStorage,
  sessionStorage: dom.sessionStorage,
  HTMLElement: dom.HTMLElement,
  Element: dom.Element,
  Node: dom.Node,
});

const { createDrawerView } = await import("../src/drawer-view.js");

function record(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    gameId: "game-1",
    userId: "user-1",
    time: "2026-11-19T12:00:00.000Z",
    modeKey: "Duels",
    mode: "Moving",
    isRated: true,
    isTeamDuel: false,
    opponent: "Rival",
    opponentId: "rival",
    win: true,
    ratingBefore: 1000,
    ratingAfter: 1020,
    ratingChange: 20,
    hydration: { state: "ok", attempts: 1 },
    updatedAt: "2026-11-19T12:01:00.000Z",
    source: "hydration",
    ...overrides,
  };
}

test("drawer keeps row nodes stable and updates only changed rows", () => {
  document.body.innerHTML = "";
  const view = createDrawerView({
    onGraph: () => {},
    onOpenGame: () => {},
    nameFor: (_id, fallback) => fallback || "Unknown",
  });
  view.setVisible(true);
  view.render([record(), record({ gameId: "game-2", opponent: "Other" })], null);
  const first = document.querySelector<HTMLElement>('[data-game-id="game-1"]');
  const second = document.querySelector<HTMLElement>('[data-game-id="game-2"]');
  assert.ok(first);
  assert.ok(second);

  view.render([record(), record({ gameId: "game-2", opponent: "Other" })], null);
  assert.equal(document.querySelector('[data-game-id="game-1"]'), first);
  assert.equal(document.querySelector('[data-game-id="game-2"]'), second);

  view.render([record(), record({ gameId: "game-2", opponent: "Changed" })], null);
  assert.equal(document.querySelector('[data-game-id="game-1"]'), first);
  assert.notEqual(document.querySelector('[data-game-id="game-2"]'), second);
  assert.match(document.querySelector('[data-game-id="game-2"]')?.textContent || "", /Changed/);
  view.dispose();
});

test("drawer hover preserves open state when moving from tab into drawer", async () => {
  document.body.innerHTML = "";
  const view = createDrawerView({
    onGraph: () => {},
    onOpenGame: () => {},
    nameFor: (_id, fallback) => fallback || "Unknown",
  });
  view.setVisible(true);
  const root = document.getElementById("bgh-history-drawer-root");
  const tab = document.getElementById("bgh-drawer-trigger-tab");
  const drawer = document.getElementById("bgh-history-drawer");
  assert.ok(root);
  assert.ok(tab);
  assert.ok(drawer);

  tab.dispatchEvent(new dom.Event("pointerenter"));
  assert.equal(root.classList.contains("bgh-open"), true);
  tab.dispatchEvent(new dom.Event("pointerleave"));
  drawer.dispatchEvent(new dom.Event("pointerenter"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(root.classList.contains("bgh-open"), true);

  drawer.dispatchEvent(new dom.Event("pointerleave"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(root.classList.contains("bgh-open"), false);
  view.dispose();
});

test("drawer closes after focus leaves the panel", async () => {
  document.body.innerHTML = "";
  const view = createDrawerView({
    onGraph: () => {},
    onOpenGame: () => {},
    nameFor: (_id, fallback) => fallback || "Unknown",
  });
  view.setVisible(true);
  const root = document.getElementById("bgh-history-drawer-root");
  const tab = document.getElementById("bgh-drawer-trigger-tab");
  assert.ok(root);
  assert.ok(tab);

  tab.focus();
  assert.equal(root.classList.contains("bgh-open"), true);
  tab.blur();
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(root.classList.contains("bgh-open"), false);
  view.dispose();
});

test("drawer does not open on hover while the page is unfocused", () => {
  document.body.innerHTML = "";
  const view = createDrawerView({
    onGraph: () => {},
    onOpenGame: () => {},
    nameFor: (_id, fallback) => fallback || "Unknown",
  });
  view.setVisible(true);
  const root = document.getElementById("bgh-history-drawer-root");
  const tab = document.getElementById("bgh-drawer-trigger-tab");
  assert.ok(root);
  assert.ok(tab);

  dom.dispatchEvent(new dom.Event("blur"));
  tab.dispatchEvent(new dom.Event("pointerenter"));
  assert.equal(root.classList.contains("bgh-open"), false);

  dom.dispatchEvent(new dom.Event("focus"));
  assert.equal(root.classList.contains("bgh-open"), true);
  view.dispose();
});

test("drawer closes when the page loses focus even if the panel held focus", async () => {
  document.body.innerHTML = "";
  const view = createDrawerView({
    onGraph: () => {},
    onOpenGame: () => {},
    nameFor: (_id, fallback) => fallback || "Unknown",
  });
  view.setVisible(true);
  const root = document.getElementById("bgh-history-drawer-root");
  const graphButton = document.getElementById("bgh-show-graph");
  assert.ok(root);
  assert.ok(graphButton);

  graphButton.focus();
  assert.equal(root.classList.contains("bgh-open"), true);

  dom.dispatchEvent(new dom.Event("blur"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(root.classList.contains("bgh-open"), false);
  assert.equal(root.contains(document.activeElement), false);

  dom.dispatchEvent(new dom.Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(root.classList.contains("bgh-open"), false);
  view.dispose();
});
