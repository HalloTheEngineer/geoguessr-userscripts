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

const { hydrateGameDetails } = await import("../src/hydration.js");

const duelData = {
  teams: [
    {
      id: "team-1",
      players: [
        {
          playerId: "user-1",
          nick: "Me",
          guesses: [{ score: 0 }, { score: 1000 }],
          progressChange: {
            rankedSystemProgress: {
              ratingBefore: 1000,
              ratingAfter: 1020,
              ratingChange: 20,
              gameModeRatingAfter: 1015,
              gameMode: "Duels",
            },
          },
        },
      ],
      roundResults: [{ damageDealt: 100, multiplier: 2 }],
    },
    {
      id: "team-2",
      players: [{ playerId: "user-2", nick: "Rival" }],
      roundResults: [{ damageDealt: 100, multiplier: 1 }],
    },
  ],
  rounds: [{ startTime: "2026-11-19T12:00:00.000Z", endTime: "2026-11-19T12:00:10.000Z" }],
  currentRoundNumber: 1,
  options: { isRated: true, competitiveGameMode: "Duels" },
  result: { winningTeamId: "team-1" },
};

function setFetch(handler: (url: string) => Response): void {
  dom.window.fetch = (async (input: RequestInfo | URL) => {
    return handler(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
  }) as typeof dom.window.fetch;
}

test("hydration uses the current account and real values", async () => {
  setFetch((url) => {
    if (url.includes("game-server")) return new Response(JSON.stringify(duelData), { status: 200 });
    return new Response(JSON.stringify({ nick: "Profile Nick" }), { status: 200 });
  });
  const result = await hydrateGameDetails("game-1", "user-1");
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.details.opponent, "Rival");
  assert.equal(result.details.avgScore, 500);
  assert.equal(result.details.avgTime, 10);
  assert.equal(result.details.mmi, 1);
  assert.equal(result.details.win, true);
  assert.equal(result.details.ratingAfter, 1020);
  assert.equal(result.details.mode, "Moving");
});

test("hydration never falls back to an arbitrary team member", async () => {
  setFetch(() => new Response(JSON.stringify(duelData), { status: 200 }));
  const result = await hydrateGameDetails("game-1", "missing-user");
  assert.equal(result.status, "retry");
});

test("hydration distinguishes unavailable matches from retryable failures", async () => {
  setFetch(() => new Response(null, { status: 404 }));
  const unavailable = await hydrateGameDetails("game-1", "user-1");
  assert.equal(unavailable.status, "unavailable");

  setFetch(() => new Response(null, { status: 500 }));
  const retry = await hydrateGameDetails("game-1", "user-1");
  assert.equal(retry.status, "retry");
});

test("team hydration uses team progress and composition without profile requests", async () => {
  const teamDuelData = {
    teams: [
      {
        id: "team-1",
        players: [
          {
            playerId: "user-3",
            nick: "Mate",
            guesses: [{ score: 1000 }],
            progressChange: {
              rankedTeamDuelsProgress: {
                ratingBefore: 1200,
                ratingAfter: 1215,
                ratingChange: 15,
              },
            },
          },
          {
            playerId: "user-1",
            nick: "Me",
            guesses: [{ score: 1000 }],
            progressChange: {
              rankedTeamDuelsProgress: {
                ratingBefore: 1200,
                ratingAfter: 1215,
                ratingChange: 15,
              },
            },
          },
        ],
      },
      {
        id: "team-2",
        players: [
          { playerId: "user-4", nick: "Rival A" },
          { playerId: "user-5", nick: "Rival B" },
        ],
      },
    ],
    rounds: [{ startTime: "2026-11-19T12:00:00.000Z", endTime: "2026-11-19T12:00:20.000Z" }],
    currentRoundNumber: 1,
    options: { isRated: true, competitiveGameMode: "TeamDuels" },
    result: { winningTeamId: "team-1" },
  };
  let userRequests = 0;
  setFetch((url) => {
    if (url.includes("/api/v3/users/")) {
      userRequests++;
      return new Response(null, { status: 429 });
    }
    return new Response(JSON.stringify(teamDuelData), { status: 200 });
  });
  const result = await hydrateGameDetails("team-game", "user-1");
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(userRequests, 0);
  assert.equal(result.details.isTeamDuel, true);
  assert.equal(result.details.teamKey, "user-1:user-3");
  assert.deepEqual(result.details.teammateIds, ["user-3"]);
  assert.deepEqual(result.details.teammateNicks, ["Mate"]);
  assert.equal(result.details.ratingBefore, 1200);
  assert.equal(result.details.ratingAfter, 1215);
  assert.equal(result.details.ratingChange, 15);
  assert.equal(result.details.gameModeRatingAfter, undefined);
  assert.equal(result.details.win, true);
  assert.equal(result.details.opponent, "Rival A & Rival B");
});
