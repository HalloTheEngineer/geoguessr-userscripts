import assert from "node:assert/strict";
import test from "node:test";
import { getChartData, groupCandles, metricValue, movingAverage } from "../src/chart-data.js";
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
