import assert from "node:assert/strict";
import test from "node:test";
import {
  getChartData,
  getTeamOptions,
  groupCandles,
  metricValue,
  movingAverage,
} from "../src/chart-data.js";
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
    gameModeRatingAfter: 1015,
    mmi: 0.2,
    avgScore: 4500,
    avgTime: 30,
    hydration: { state: "ok", attempts: 1 },
    updatedAt: "2026-11-19T12:01:00.000Z",
    source: "hydration",
    ...overrides,
  };
}

test("chart data filters account metrics, type, mode, and invalid values", () => {
  const records = [
    record(),
    record({ gameId: "unranked", isRated: false, ratingAfter: 900 }),
    record({ gameId: "team", isTeamDuel: true }),
    record({ gameId: "pending", hydration: { state: "pending", attempts: 0 } }),
    record({ gameId: "nmpz", modeKey: "NmpzDuels", mode: "NMPZ", gameModeRatingAfter: 1040 }),
    record({ gameId: "nan", avgScore: Number.NaN, ratingAfter: Number.NaN }),
  ];
  const points = getChartData(
    records,
    { timeframe: "All", metric: "ratingAfter", typeFilter: "Ranked", modeFilter: "All" },
    Date.parse("2026-11-19T13:00:00.000Z"),
  );
  assert.deepEqual(
    points.map((point) => point.gameId),
    ["game-1", "nmpz"],
  );
  assert.equal(
    getChartData(
      records,
      { timeframe: "All", metric: "ratingAfter", typeFilter: "Ranked", modeFilter: "NMPZ" },
      Date.parse("2026-11-19T13:00:00.000Z"),
    )[0]?.value,
    1040,
  );
  assert.equal(
    getChartData(
      records,
      { timeframe: "All", metric: "avgScore", typeFilter: "All", modeFilter: "All" },
      Date.parse("2026-11-19T13:00:00.000Z"),
    ).some((point) => point.gameId === "nan"),
    false,
  );
});

test("metric values reject unknown and non-finite fields", () => {
  const value = record({ mmi: null, avgTime: null, avgScore: null });
  assert.equal(metricValue(value, "mmi", "All"), null);
  assert.equal(metricValue(value, "avgTime", "All"), null);
  assert.equal(metricValue(value, "avgScore", "All"), null);
  assert.equal(metricValue(value, "gameCount", "All"), 1);
});

test("candles and moving averages aggregate finite values", () => {
  const points = getChartData(
    [
      record({ gameId: "a", time: "2026-11-19T12:10:00.000Z", avgScore: 100 }),
      record({ gameId: "b", time: "2026-11-19T12:40:00.000Z", avgScore: 300 }),
      record({ gameId: "c", time: "2026-11-20T12:00:00.000Z", avgScore: 200 }),
    ],
    { timeframe: "All", metric: "avgScore", typeFilter: "All", modeFilter: "All" },
    Date.parse("2026-11-21T00:00:00.000Z"),
  );
  const candles = groupCandles(points, "daily");
  assert.equal(candles.length, 2);
  assert.equal(candles[0].open, 100);
  assert.equal(candles[0].close, 300);
  assert.equal(candles[0].count, 2);
  assert.deepEqual(movingAverage([1, 2, 3, 4], 2), [1, 1.5, 2.5, 3.5]);
});

test("team graph filters by team composition and uses team rating", () => {
  const solo = record({ gameId: "solo-1" });
  const teamA = record({
    gameId: "team-a",
    isTeamDuel: true,
    modeKey: "TeamDuels",
    mode: "Team",
    teamKey: "me:alice",
    teammateIds: ["alice"],
    teammateNicks: ["Alice"],
    ratingAfter: 1500,
  });
  const teamB = record({
    gameId: "team-b",
    isTeamDuel: true,
    modeKey: "TeamDuels",
    mode: "Team",
    teamKey: "me:bob",
    teammateIds: ["bob"],
    teammateNicks: ["Bob"],
    ratingAfter: 1400,
  });
  const records = [solo, teamA, teamB];
  const base = {
    timeframe: "All" as const,
    metric: "ratingAfter" as const,
    typeFilter: "Ranked" as const,
    modeFilter: "All" as const,
    queue: "team" as const,
    teamKey: "me:alice",
  };
  const filtered = getChartData(records, base, Date.parse("2026-11-20T00:00:00.000Z"));
  assert.deepEqual(
    filtered.map((point) => point.gameId),
    ["team-a"],
  );
  assert.equal(filtered[0]?.value, 1500);
  assert.equal(filtered[0]?.teamLabel, "You + Alice");
  assert.deepEqual(
    getTeamOptions(records).map((team) => team.label),
    ["You + Alice", "You + Bob"],
  );
});
