import { createListStore } from "gg-kit";
import { formatModeName, toFiniteNumber } from "./format.js";
import type { GameRecord, HydrationMeta, HydrationState } from "./types.js";

export const HISTORY_KEY = "gg.better-game-history.history";
export const HISTORY_VERSION = 2;

const MAX_STORED_RECORDS = 5000;
const HYDRATION_STATES = new Set<HydrationState>(["pending", "ok", "unavailable", "error"]);

export interface HistoryRepository {
  readonly key: string;
  get(userId: string, limit: number): GameRecord[];
  pending(userId: string): GameRecord[];
  merge(record: GameRecord, limit: number): void;
  trim(userId: string, limit: number): void;
  subscribe(listener: (records: readonly GameRecord[]) => void): () => void;
  flush(): void;
  dispose(): void;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string" && !!item);
  return values.length ? values : undefined;
}

function asNumber(value: unknown): number | undefined {
  const number = toFiniteNumber(value);
  return number === null ? undefined : number;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return asNumber(value);
}

function normalizeHydration(value: unknown, updatedAt: string): HydrationMeta {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawState = typeof source.state === "string" ? source.state : "pending";
  const state = HYDRATION_STATES.has(rawState as HydrationState)
    ? (rawState as HydrationState)
    : "pending";
  return {
    state,
    attempts: Math.max(0, Math.floor(asNumber(source.attempts) ?? 0)),
    lastError: asString(source.lastError),
    fetchedAt: asString(source.fetchedAt) || (state === "ok" ? updatedAt : undefined),
  };
}

function normalizeRecord(value: unknown): GameRecord | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const gameId = asString(source.gameId);
  const userId = asString(source.userId);
  const time = asString(source.time);
  if (!gameId || !userId || !time || Number.isNaN(new Date(time).getTime())) return null;
  const updatedAt = asString(source.updatedAt) || time;
  const modeKey = asString(source.modeKey) || "Moving";
  const isRated = source.isRated !== false;
  const sourceValue =
    source.source === "websocket" || source.source === "hydration" || source.source === "feed"
      ? source.source
      : "feed";
  const isTeamDuel = source.isTeamDuel === true;
  const teamKey = asString(source.teamKey);
  const hydration = normalizeHydration(source.hydration, updatedAt);
  if (isTeamDuel && !teamKey && hydration.state === "ok") {
    hydration.state = "pending";
    hydration.attempts = 0;
  }
  return {
    gameId,
    userId,
    time,
    modeKey,
    mode: asString(source.mode) || formatModeName(modeKey, isRated),
    isRated,
    isTeamDuel,
    opponent: asString(source.opponent),
    opponentId: asString(source.opponentId),
    teamKey,
    teamPlayerIds: asStringArray(source.teamPlayerIds),
    teamPlayerNicks: asStringArray(source.teamPlayerNicks),
    teammateIds: asStringArray(source.teammateIds),
    teammateNicks: asStringArray(source.teammateNicks),
    win: typeof source.win === "boolean" ? source.win : undefined,
    ratingBefore: asNumber(source.ratingBefore),
    ratingAfter: asNumber(source.ratingAfter),
    gameModeRatingAfter: asNumber(source.gameModeRatingAfter),
    ratingChange: asNumber(source.ratingChange),
    mmi: asNullableNumber(source.mmi),
    avgScore: asNullableNumber(source.avgScore),
    avgTime: asNullableNumber(source.avgTime),
    hydration,
    updatedAt,
    source: sourceValue,
  };
}

function recordKey(record: Pick<GameRecord, "gameId" | "userId">): string {
  return `${record.userId}\u0000${record.gameId}`;
}

function sortNewestFirst(records: GameRecord[]): GameRecord[] {
  return records.sort(
    (left, right) => new Date(right.time).getTime() - new Date(left.time).getTime(),
  );
}

function mergeRecord(existing: GameRecord, incoming: GameRecord): GameRecord {
  const merged: GameRecord = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(incoming).filter(([, value]) => value !== undefined && value !== null),
    ),
    hydration:
      existing.hydration.state === "ok" && incoming.hydration.state !== "ok"
        ? existing.hydration
        : incoming.hydration,
  } as GameRecord;
  if (incoming.opponent === undefined) merged.opponent = existing.opponent;
  if (incoming.opponentId === undefined) merged.opponentId = existing.opponentId;
  if (incoming.teamKey === undefined) merged.teamKey = existing.teamKey;
  if (incoming.teamPlayerIds === undefined) merged.teamPlayerIds = existing.teamPlayerIds;
  if (incoming.teamPlayerNicks === undefined) merged.teamPlayerNicks = existing.teamPlayerNicks;
  if (incoming.teammateIds === undefined) merged.teammateIds = existing.teammateIds;
  if (incoming.teammateNicks === undefined) merged.teammateNicks = existing.teammateNicks;
  if (incoming.win === undefined) merged.win = existing.win;
  if (incoming.ratingBefore === undefined) merged.ratingBefore = existing.ratingBefore;
  if (incoming.ratingAfter === undefined) merged.ratingAfter = existing.ratingAfter;
  if (incoming.gameModeRatingAfter === undefined)
    merged.gameModeRatingAfter = existing.gameModeRatingAfter;
  if (incoming.ratingChange === undefined) merged.ratingChange = existing.ratingChange;
  if (incoming.mmi === undefined || incoming.mmi === null) merged.mmi = existing.mmi;
  if (incoming.avgScore === undefined || incoming.avgScore === null)
    merged.avgScore = existing.avgScore;
  if (incoming.avgTime === undefined || incoming.avgTime === null)
    merged.avgTime = existing.avgTime;
  if (incoming.source === "feed" && existing.source !== "feed") merged.source = existing.source;
  return merged;
}

function mergeAll(records: GameRecord[]): GameRecord[] {
  const byKey = new Map<string, GameRecord>();
  for (const record of records) {
    const key = recordKey(record);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeRecord(existing, record) : record);
  }
  return sortNewestFirst([...byKey.values()]);
}

function trimForUser(records: GameRecord[], userId: string, limit: number): GameRecord[] {
  const otherUsers = records.filter((record) => record.userId !== userId);
  const currentUser = records
    .filter((record) => record.userId === userId)
    .slice(0, Math.max(0, Math.floor(limit)));
  return sortNewestFirst([...otherUsers, ...currentUser]).slice(0, MAX_STORED_RECORDS);
}

export function createHistoryRepository(): HistoryRepository {
  const store = createListStore<GameRecord>({
    key: HISTORY_KEY,
    version: HISTORY_VERSION,
    maxEntries: MAX_STORED_RECORDS,
    create: normalizeRecord,
  });

  return {
    key: HISTORY_KEY,
    get(userId, limit) {
      return sortNewestFirst(store.get().filter((record) => record.userId === userId)).slice(
        0,
        Math.max(0, Math.floor(limit)),
      );
    },
    pending(userId) {
      return sortNewestFirst(
        store
          .get()
          .filter(
            (record) =>
              record.userId === userId &&
              (record.hydration.state === "pending" || record.hydration.state === "error"),
          ),
      );
    },
    merge(record, limit) {
      const local = store.get();
      const external = store.reload();
      const merged = mergeAll([...external, ...local, record]);
      store.set(trimForUser(merged, record.userId, limit));
    },
    trim(userId, limit) {
      const local = store.get();
      const external = store.reload();
      store.set(trimForUser(mergeAll([...external, ...local]), userId, limit));
    },
    subscribe(listener) {
      return store.subscribe(listener);
    },
    flush() {
      store.flush();
    },
    dispose() {
      store.dispose();
    },
  };
}
