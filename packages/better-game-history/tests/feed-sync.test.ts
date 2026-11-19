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
    windowDays: 30,
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
