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
  const view = createDrawerView({ onGraph: () => {}, onOpenGame: () => {} });
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
