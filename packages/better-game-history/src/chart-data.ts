import { recordModeGroup, toFiniteNumber } from "./format.js";
import type { CandleGroup, CandleMode, GameRecord, GraphFilters, GraphPoint } from "./types.js";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hourKey(date: Date): string {
  return `${dayKey(date)}-${pad(date.getHours())}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function pointLabel(date: Date, timeframe: GraphFilters["timeframe"]): string {
  if (timeframe === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function metricValue(
  record: GameRecord,
  metric: GraphFilters["metric"],
  mode: string,
): number | null {
  if (metric === "gameCount") return 1;
  if (metric === "ratingAfter") {
    if (!record.isRated) return null;
    if (mode !== "All") {
      const modeRating = toFiniteNumber(record.gameModeRatingAfter);
      return modeRating ?? null;
    }
    return toFiniteNumber(record.ratingAfter);
  }
  if (metric === "avgScore") return toFiniteNumber(record.avgScore);
  if (metric === "mmi") return toFiniteNumber(record.mmi);
  return toFiniteNumber(record.avgTime);
}

function inTimeframe(time: string, timeframe: GraphFilters["timeframe"], now: number): boolean {
  if (timeframe === "All") return true;
  const timestamp = new Date(time).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const windowMs =
    timeframe === "24h" ? 86_400_000 : timeframe === "7d" ? 7 * 86_400_000 : 30 * 86_400_000;
  return timestamp >= now - windowMs;
}

export interface TeamOption {
  key: string;
  label: string;
  count: number;
}

export function getTeamOptions(records: readonly GameRecord[]): TeamOption[] {
  const teams = new Map<string, TeamOption>();
  for (const record of records) {
    if (!record.isTeamDuel || !record.teamKey) continue;
    const existing = teams.get(record.teamKey);
    if (existing) {
      existing.count++;
      continue;
    }
    const teammates = (record.teammateNicks || []).filter((nick) => nick && nick !== record.userId);
    const label = teammates.length ? `You + ${teammates.join(" & ")}` : "Your team";
    teams.set(record.teamKey, { key: record.teamKey, label, count: 1 });
  }
  return [...teams.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
}

export function getChartData(
  records: readonly GameRecord[],
  filters: Pick<
    GraphFilters,
    "timeframe" | "metric" | "typeFilter" | "modeFilter" | "queue" | "teamKey"
  >,
  now = Date.now(),
): GraphPoint[] {
  const points: GraphPoint[] = [];
  const queue = filters.queue || "solo";
  for (const record of records) {
    if (record.hydration.state !== "ok") continue;
    if (queue === "solo" && record.isTeamDuel) continue;
    if (queue === "team" && !record.isTeamDuel) continue;
    if (queue === "team" && filters.teamKey && record.teamKey !== filters.teamKey) continue;
    if (!inTimeframe(record.time, filters.timeframe, now)) continue;
    if (filters.typeFilter === "Ranked" && !record.isRated) continue;
    if (filters.typeFilter === "Unranked" && record.isRated) continue;
    if (
      queue === "solo" &&
      filters.modeFilter !== "All" &&
      recordModeGroup(record) !== filters.modeFilter
    )
      continue;
    const value = metricValue(
      record,
      filters.metric,
      queue === "team" ? "All" : filters.modeFilter,
    );
    if (value === null || !Number.isFinite(value)) continue;
    const date = new Date(record.time);
    if (Number.isNaN(date.getTime())) continue;
    const teammates = (record.teammateNicks || []).join(" & ");
    points.push({
      time: record.time,
      label: pointLabel(date, filters.timeframe),
      hourlyKey: hourKey(date),
      dailyKey: dayKey(date),
      monthlyKey: monthKey(date),
      value,
      opponent: record.opponent || "Unknown Opponent",
      mode: record.mode,
      gameId: record.gameId,
      isTeamDuel: record.isTeamDuel,
      teamKey: record.teamKey,
      teamLabel: teammates ? `You + ${teammates}` : undefined,
    });
  }
  return points.sort(
    (left, right) => new Date(left.time).getTime() - new Date(right.time).getTime(),
  );
}

export function candleKey(point: GraphPoint, mode: Exclude<CandleMode, "none">): string {
  if (mode === "hourly") return point.hourlyKey;
  if (mode === "monthly") return point.monthlyKey;
  return point.dailyKey;
}

export function candleLabel(point: GraphPoint, mode: Exclude<CandleMode, "none">): string {
  if (mode === "hourly") return point.hourlyKey;
  if (mode === "monthly") return point.monthlyKey;
  return point.dailyKey;
}

export function groupCandles(
  points: readonly GraphPoint[],
  mode: Exclude<CandleMode, "none">,
): CandleGroup[] {
  const groups = new Map<string, CandleGroup>();
  for (const point of points) {
    const key = candleKey(point, mode);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        label: candleLabel(point, mode),
        open: point.value,
        high: point.value,
        low: point.value,
        close: point.value,
        count: 1,
        values: [point.value],
      });
      continue;
    }
    existing.high = Math.max(existing.high, point.value);
    existing.low = Math.min(existing.low, point.value);
    existing.close = point.value;
    existing.count++;
    existing.values.push(point.value);
  }
  return [...groups.values()];
}

export function movingAverage(values: readonly number[], window: number): number[] {
  const result: number[] = [];
  for (let index = 0; index < values.length; index++) {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1);
    result.push(slice.reduce((total, value) => total + value, 0) / slice.length);
  }
  return result;
}

export function formatMetricLabel(metric: GraphFilters["metric"], candleMode: CandleMode): string {
  if (metric === "ratingAfter") return "Rating History";
  if (metric === "avgScore") return "Average Score";
  if (metric === "mmi") return "Multi-Merchant Index";
  if (metric === "avgTime") return "Average Time (s)";
  return `Games per ${candleMode === "hourly" ? "Hour" : candleMode === "monthly" ? "Month" : "Day"}`;
}
