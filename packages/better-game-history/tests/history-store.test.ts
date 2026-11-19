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

const { createHistoryRepository, HISTORY_KEY, HISTORY_VERSION } = await import(
  "../src/history-store.js"
);

import type { GameRecord } from "../src/types.js";

function record(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    gameId: "game-1",
    userId: "user-1",
    time: "2026-11-19T12:00:00.000Z",
    modeKey: "Duels",
    mode: "Moving",
    isRated: true,
    isTeamDuel: false,
    ratingBefore: 1000,
    ratingAfter: 1020,
    ratingChange: 20,
    mmi: 0.2,
    avgScore: 4500,
    avgTime: 30,
    hydration: { state: "ok", attempts: 1 },
    updatedAt: "2026-11-19T12:01:00.000Z",
    source: "hydration",
    ...overrides,
  };
}

test("history repository scopes, merges, and trims records by account", () => {
  localStorage.clear();
  const repository = createHistoryRepository();
  repository.merge(record(), 2);
  repository.merge(record({ gameId: "game-2", time: "2026-11-19T13:00:00.000Z" }), 2);
  repository.merge(record({ gameId: "game-3", time: "2026-11-19T14:00:00.000Z" }), 2);
  repository.merge(
    record({ gameId: "other", userId: "user-2", time: "2026-11-19T15:00:00.000Z" }),
    2,
  );

  assert.deepEqual(
    repository.get("user-1", 10).map((item) => item.gameId),
    ["game-3", "game-2"],
  );
  assert.deepEqual(
    repository.get("user-2", 10).map((item) => item.gameId),
    ["other"],
  );
  repository.dispose();
});

test("history repository does not replace hydrated data with pending data", () => {
  localStorage.clear();
  const repository = createHistoryRepository();
  repository.merge(record(), 10);
  repository.merge(
    record({
      hydration: { state: "pending", attempts: 0 },
      ratingAfter: undefined,
      ratingChange: undefined,
      source: "feed",
    }),
    10,
  );
  const stored = repository.get("user-1", 10)[0];
  assert.equal(stored.hydration.state, "ok");
  assert.equal(stored.ratingAfter, 1020);
  assert.equal(stored.source, "hydration");
  repository.dispose();
});

test("history repository drops malformed stored records", () => {
  localStorage.clear();
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify({
      v: HISTORY_VERSION,
      data: [record(), { gameId: "", userId: "user-1" }, null, { gameId: "bad-time" }],
    }),
  );
  const repository = createHistoryRepository();
  assert.deepEqual(
    repository.get("user-1", 10).map((item) => item.gameId),
    ["game-1"],
  );
  repository.dispose();
});

test("history repository exposes pending records and flushes on dispose", () => {
  localStorage.clear();
  const repository = createHistoryRepository();
  repository.merge(
    record({
      gameId: "pending-1",
      hydration: { state: "pending", attempts: 0 },
      source: "feed",
    }),
    10,
  );
  assert.equal(repository.pending("user-1").length, 1);
  repository.dispose();
  const raw = localStorage.getItem(HISTORY_KEY);
  assert.ok(raw);
  assert.equal(JSON.parse(raw).data[0].gameId, "pending-1");
});
