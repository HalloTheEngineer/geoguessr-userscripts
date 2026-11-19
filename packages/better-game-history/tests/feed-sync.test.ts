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
});

const { createHistoryRepository } = await import("../src/history-store.js");
const { syncFeed } = await import("../src/feed-sync.js");

function servePages(pages: unknown[]): () => number {
  let requested = 0;
  dom.window.fetch = (async () => {
    const page = pages[Math.min(requested, pages.length - 1)];
    requested++;
    return new Response(JSON.stringify(page), { status: 200 });
  }) as typeof dom.window.fetch;
  return () => requested;
}

function existingRecord(gameId: string, isTeamDuel = false): GameRecord {
  return {
    gameId,
    userId: "user-1",
    time: "2026-01-01T12:00:00.000Z",
    modeKey: isTeamDuel ? "TeamDuels" : "Duels",
    mode: "Moving",
    isRated: true,
    isTeamDuel,
    hydration: { state: "ok", attempts: 1 },
    updatedAt: "2026-01-01T12:00:00.000Z",
    source: "hydration",
  };
}

function gameEntry(gameId: string, gameMode = "Duels", time = new Date().toISOString()) {
  return { type: 6, time, payload: JSON.stringify({ gameId, gameMode }) };
}

test("feed sync imports ranked solo and skips unranked entries", async () => {
  localStorage.clear();
  const now = new Date().toISOString();
  const requested = servePages([
    {
      entries: [
        gameEntry("feed-1", "Duels", now),
        {
          type: 6,
          time: now,
          payload: [
            { gameId: "feed-2", gameMode: "Duels" },
            { gameId: "feed-3", gameMode: "Duels" },
          ],
        },
      ],
      paginationToken: "next",
    },
    {
      entries: [
        gameEntry("feed-1", "Duels", now),
        { type: 11, time: now, payload: JSON.stringify({ gameId: "feed-4", gameMode: "Duels" }) },
      ],
      paginationToken: null,
    },
  ]);

  const repository = createHistoryRepository();
  let updates = 0;
  const result = await syncFeed({
    userId: "user-1",
    repository,
    limit: 2000,
    targetPerQueue: 200,
    onUpdate: () => {
      updates++;
    },
  });
  assert.equal(requested(), 2);
  assert.equal(result.pages, 2);
  assert.equal(result.added, 3);
  assert.equal(result.solo, 3);
  assert.equal(result.team, 0);
  assert.equal(result.ignoredUnranked, 1);
  assert.equal(result.exhausted, true);
  assert.equal(result.stopReason, "exhausted");
  assert.ok(updates >= 1);
  assert.deepEqual(
    repository
      .get("user-1", 2000)
      .map((record) => record.gameId)
      .sort(),
    ["feed-1", "feed-2", "feed-3"],
  );
  repository.dispose();
});

test("feed sync backfills old ranked games without an age cutoff", async () => {
  localStorage.clear();
  const old = "2019-01-01T12:00:00.000Z";
  const requested = servePages([
    {
      entries: [
        gameEntry("old-1", "Duels", old),
        gameEntry("old-2", "Duels", old),
        gameEntry("old-3", "Duels", old),
      ],
      paginationToken: null,
    },
  ]);

  const repository = createHistoryRepository();
  const result = await syncFeed({
    userId: "user-1",
    repository,
    limit: 2000,
    targetPerQueue: 2,
    onUpdate: () => {},
  });
  assert.equal(requested(), 1);
  assert.equal(result.added, 3);
  assert.equal(result.soloTargetReached, true);
  assert.equal(result.teamTargetReached, false);
  assert.equal(result.targetReached, false);
  assert.equal(repository.get("user-1", 2000).length, 3);
  repository.dispose();
});

test("feed sync reaches separate solo and team targets", async () => {
  localStorage.clear();
  const pages = [
    {
      entries: Array.from({ length: 50 }, (_, index) => gameEntry(`solo-a-${index}`)),
      paginationToken: "solo-b",
    },
    {
      entries: Array.from({ length: 50 }, (_, index) => gameEntry(`solo-b-${index}`)),
      paginationToken: "team-a",
    },
    {
      entries: Array.from({ length: 50 }, (_, index) => gameEntry(`team-a-${index}`, "TeamDuels")),
      paginationToken: "team-b",
    },
    {
      entries: Array.from({ length: 50 }, (_, index) => gameEntry(`team-b-${index}`, "TeamDuels")),
      paginationToken: "older",
    },
  ];
  const requested = servePages(pages);

  const repository = createHistoryRepository();
  const result = await syncFeed({
    userId: "user-1",
    repository,
    limit: 2000,
    targetPerQueue: 100,
    onUpdate: () => {},
  });
  assert.equal(requested(), 4);
  assert.equal(result.pages, 4);
  assert.equal(result.added, 200);
  assert.equal(result.solo, 100);
  assert.equal(result.team, 100);
  assert.equal(result.soloTargetReached, true);
  assert.equal(result.teamTargetReached, true);
  assert.equal(result.targetReached, true);
  assert.equal(result.stopReason, "target");
  assert.equal(repository.get("user-1", 2000).filter((record) => record.isTeamDuel).length, 100);
  repository.dispose();
});

test("feed sync unwraps type 7 bundles and ignores unranked/other activities", async () => {
  localStorage.clear();
  const now = new Date().toISOString();
  const requested = servePages([
    {
      entries: [
        {
          type: 7,
          time: now,
          payload: JSON.stringify([
            {
              type: 6,
              time: now,
              payload: JSON.stringify({ gameId: "solo-1", gameMode: "Duels" }),
            },
            {
              type: 6,
              time: now,
              payload: { gameId: "team-1", gameMode: "TeamDuels" },
            },
            {
              type: 11,
              time: now,
              payload: JSON.stringify({ gameId: "unranked-1", gameMode: "Duels" }),
            },
            {
              type: 6,
              time: now,
              payload: JSON.stringify({ gameId: "br-1", gameMode: "BattleRoyaleDistance" }),
            },
          ]),
        },
        { type: 9, time: now, payload: JSON.stringify({ ignored: true }) },
      ],
      paginationToken: null,
    },
  ]);

  const repository = createHistoryRepository();
  const result = await syncFeed({
    userId: "user-1",
    repository,
    limit: 2000,
    targetPerQueue: 1,
    onUpdate: () => {},
  });
  assert.equal(requested(), 1);
  assert.equal(result.added, 2);
  assert.equal(result.solo, 1);
  assert.equal(result.team, 1);
  assert.equal(result.ignoredUnranked, 1);
  assert.equal(result.targetReached, true);
  assert.equal(result.stopReason, "target");
  assert.equal(
    repository.get("user-1", 2000).find((record) => record.gameId === "team-1")?.isTeamDuel,
    true,
  );
  assert.deepEqual(
    repository
      .get("user-1", 2000)
      .map((record) => record.gameId)
      .sort(),
    ["solo-1", "team-1"],
  );
  repository.dispose();
});

test("feed sync keeps syncing new games after both targets are met", async () => {
  localStorage.clear();
  const repository = createHistoryRepository();
  for (const gameId of ["known-solo-1", "known-solo-2"]) {
    repository.merge(existingRecord(gameId), 2000);
  }
  for (const gameId of ["known-team-1", "known-team-2"]) {
    repository.merge(existingRecord(gameId, true), 2000);
  }
  const now = new Date().toISOString();
  const requested = servePages([
    {
      entries: [gameEntry("new-1", "Duels", now), gameEntry("new-2", "Duels", now)],
      paginationToken: "next",
    },
    {
      entries: [
        gameEntry("known-solo-1", "Duels", now),
        gameEntry("new-3", "Duels", now),
        gameEntry("known-team-1", "TeamDuels", now),
      ],
      paginationToken: "older",
    },
  ]);

  const result = await syncFeed({
    userId: "user-1",
    repository,
    limit: 2000,
    targetPerQueue: 2,
    onUpdate: () => {},
  });
  assert.equal(requested(), 2);
  assert.equal(result.added, 3);
  assert.equal(result.solo, 5);
  assert.equal(result.team, 2);
  assert.equal(result.targetReached, true);
  assert.equal(result.stopReason, "known-frontier");
  assert.deepEqual(
    repository
      .get("user-1", 2000)
      .map((item) => item.gameId)
      .sort(),
    ["known-solo-1", "known-solo-2", "known-team-1", "known-team-2", "new-1", "new-2", "new-3"],
  );
  repository.dispose();
});
