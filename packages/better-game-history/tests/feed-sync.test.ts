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

const { createHistoryRepository } = await import("../src/history-store.js");
const { syncFeed } = await import("../src/feed-sync.js");

test("feed sync paginates, deduplicates, and keeps pending records", async () => {
  localStorage.clear();
  const now = new Date().toISOString();
  const pages = [
    {
      entries: [
        {
          type: 6,
          time: now,
          payload: JSON.stringify({
            gameId: "feed-1",
            gameMode: "Duels",
            isRated: true,
          }),
        },
        {
          type: 6,
          time: now,
          payload: [
            { gameId: "feed-2", competitiveGameMode: "NmpzDuels", isRated: false },
            { gameId: "feed-3", gameMode: "Duels" },
          ],
        },
      ],
      paginationToken: "next",
    },
    {
      entries: [
        {
          type: 6,
          time: now,
          payload: JSON.stringify({ gameId: "feed-1", gameMode: "Duels" }),
        },
        {
          type: 11,
          time: now,
          payload: JSON.stringify({ gameId: "feed-4", competitiveGameMode: "NoMoveDuels" }),
        },
      ],
      paginationToken: null,
    },
  ];
  let requested = 0;
  dom.window.fetch = (async () => {
    const page = pages[Math.min(requested, pages.length - 1)];
    requested++;
    return new Response(JSON.stringify(page), { status: 200 });
  }) as typeof dom.window.fetch;

  const repository = createHistoryRepository();
  let updates = 0;
  const result = await syncFeed({
    userId: "user-1",
    repository,
    limit: 100,
    targetGames: 200,
    onUpdate: () => {
      updates++;
    },
  });
  assert.equal(result.pages, 2);
  assert.equal(result.added, 4);
  assert.ok(updates >= 2);
  assert.deepEqual(
    repository
      .get("user-1", 100)
      .map((record) => record.gameId)
      .sort(),
    ["feed-1", "feed-2", "feed-3", "feed-4"],
  );
  assert.equal(
    repository.get("user-1", 100).find((record) => record.gameId === "feed-2")?.isRated,
    false,
  );
  repository.dispose();
});

test("feed sync backfills old games by target without an age cutoff", async () => {
  localStorage.clear();
  const old = "2019-01-01T12:00:00.000Z";
  let requested = 0;
  dom.window.fetch = (async () => {
    requested++;
    return new Response(
      JSON.stringify({
        entries: [
          { type: 6, time: old, payload: JSON.stringify({ gameId: "old-1", gameMode: "Duels" }) },
          { type: 6, time: old, payload: JSON.stringify({ gameId: "old-2", gameMode: "Duels" }) },
          { type: 6, time: old, payload: JSON.stringify({ gameId: "old-3", gameMode: "Duels" }) },
        ],
        paginationToken: null,
      }),
      { status: 200 },
    );
  }) as typeof dom.window.fetch;

  const repository = createHistoryRepository();
  const result = await syncFeed({
    userId: "user-1",
    repository,
    limit: 2000,
    targetGames: 2,
    onUpdate: () => {},
  });
  assert.equal(requested, 1);
  assert.equal(result.added, 3);
  assert.equal(repository.get("user-1", 2000).length, 3);
  repository.dispose();
});

test("feed sync paginates until the configured target", async () => {
  localStorage.clear();
  const pages = Array.from({ length: 4 }, (_, pageIndex) => ({
    entries: Array.from({ length: 50 }, (_, entryIndex) => ({
      type: 6,
      time: new Date().toISOString(),
      payload: JSON.stringify({
        gameId: `target-${pageIndex}-${entryIndex}`,
        gameMode: "Duels",
      }),
    })),
    paginationToken: pageIndex < 3 ? `token-${pageIndex}` : null,
  }));
  let requested = 0;
  dom.window.fetch = (async () => {
    const page = pages[requested++];
    return new Response(JSON.stringify(page), { status: 200 });
  }) as typeof dom.window.fetch;

  const repository = createHistoryRepository();
  const result = await syncFeed({
    userId: "user-1",
    repository,
    limit: 2000,
    targetGames: 200,
    onUpdate: () => {},
  });
  assert.equal(result.pages, 4);
  assert.equal(result.added, 200);
  assert.equal(repository.get("user-1", 2000).length, 200);
  repository.dispose();
});
