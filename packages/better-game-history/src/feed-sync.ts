import { feedPage } from "gg-kit";
import { formatModeName, sleep, toFiniteNumber } from "./format.js";
import type { HistoryRepository } from "./history-store.js";
import type { GameRecord } from "./types.js";

interface FeedPayload {
  gameId?: string;
  time?: string;
  gameMode?: string;
  competitiveGameMode?: string;
  isRated?: boolean;
  options?: { isRated?: boolean };
  [key: string]: unknown;
}

interface FeedActivity {
  type?: unknown;
  time?: string;
  payload?: unknown;
  gameId?: string;
  [key: string]: unknown;
}

export type FeedStopReason =
  | "target"
  | "known-frontier"
  | "exhausted"
  | "empty"
  | "repeated-token"
  | "page-limit";

export interface FeedSyncOptions {
  userId: string;
  repository: HistoryRepository;
  limit: number;
  targetGames: number;
  signal?: AbortSignal;
  onUpdate: () => void;
}

export interface FeedSyncResult {
  added: number;
  pages: number;
  total: number;
  target: number;
  targetReached: boolean;
  exhausted: boolean;
  stopReason: FeedStopReason;
}

const MAX_PAGES = 1000;
const PAGE_SIZE = 50;

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parsePayload(value: unknown): FeedPayload | null {
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as FeedPayload)
    : null;
}

function payloadToRecord(
  payload: FeedPayload,
  entryTime: string | undefined,
  userId: string,
): GameRecord | null {
  if (typeof payload.gameId !== "string" || !payload.gameId) return null;
  const timeValue = payload.time || entryTime;
  if (!timeValue || Number.isNaN(new Date(timeValue).getTime())) return null;
  const modeKey = payload.competitiveGameMode || payload.gameMode || "Moving";
  const isRated = payload.isRated !== false && payload.options?.isRated !== false;
  const ratingBefore = toFiniteNumber(payload.ratingBefore);
  const ratingAfter = toFiniteNumber(payload.ratingAfter);
  const ratingChange = toFiniteNumber(payload.ratingChange);
  return {
    gameId: payload.gameId,
    userId,
    time: timeValue,
    modeKey,
    mode: formatModeName(modeKey, isRated),
    isRated,
    isTeamDuel: false,
    ratingBefore: ratingBefore === null ? undefined : ratingBefore,
    ratingAfter: ratingAfter === null ? undefined : ratingAfter,
    ratingChange: ratingChange === null ? undefined : ratingChange,
    hydration: { state: "pending", attempts: 0 },
    updatedAt: new Date().toISOString(),
    source: "feed",
  };
}

export async function syncFeed(options: FeedSyncOptions): Promise<FeedSyncResult> {
  const { userId, repository, limit, targetGames, signal, onUpdate } = options;
  const target = Math.max(1, Math.min(Math.floor(targetGames), Math.floor(limit)));
  const known = new Set(repository.get(userId, limit).map((record) => record.gameId));
  const backfill = known.size < target;
  let encounteredKnown = false;
  const seenTokens = new Set<string>();
  const maxPages = Math.max(50, Math.min(MAX_PAGES, target * 2));
  let token: string | null = null;
  let added = 0;
  let pages = 0;
  let exhausted = false;
  let stopReason: FeedStopReason = "page-limit";

  const processGame = (value: unknown, entryTime: string | undefined): boolean => {
    const payload = parsePayload(value);
    if (!payload) return false;
    const record = payloadToRecord(payload, entryTime, userId);
    if (!record) return false;
    if (known.has(record.gameId)) {
      encounteredKnown = true;
      return false;
    }
    known.add(record.gameId);
    repository.merge(record, limit);
    added++;
    return true;
  };

  const processActivity = (
    activity: FeedActivity,
    fallbackTime: string | undefined,
    depth = 0,
  ): boolean => {
    const type = typeof activity.type === "number" ? activity.type : Number(activity.type);
    const entryTime = typeof activity.time === "string" ? activity.time : fallbackTime;

    if (type === 7) {
      if (depth > 0) return false;
      const list = parseJsonValue(activity.payload);
      if (!Array.isArray(list)) return false;
      let found = false;
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const nested = item as FeedActivity;
        if (nested.type === undefined) {
          if (processGame(nested, entryTime)) found = true;
        } else if (processActivity(nested, entryTime, depth + 1)) {
          found = true;
        }
      }
      return found;
    }

    if (type !== 6 && type !== 11) return false;
    const value = parseJsonValue(activity.payload);
    if (Array.isArray(value)) {
      let found = false;
      for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const nested = item as FeedActivity;
        if (nested.type === undefined) {
          if (processGame(nested, entryTime)) found = true;
        } else if (processActivity(nested, entryTime, depth + 1)) {
          found = true;
        }
      }
      return found;
    }
    return processGame(value, entryTime);
  };

  while (pages < maxPages) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const page = await feedPage(token, PAGE_SIZE);
    pages++;
    const entries = Array.isArray(page.entries) ? page.entries : [];
    if (!entries.length) {
      exhausted = true;
      stopReason = "empty";
      break;
    }

    encounteredKnown = false;
    let pageAdded = 0;
    for (const entry of entries) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (processActivity(entry as FeedActivity, undefined)) pageAdded++;
    }

    if (pageAdded) onUpdate();
    if (backfill && known.size >= target) {
      stopReason = "target";
      break;
    }
    if (!backfill && encounteredKnown) {
      stopReason = "known-frontier";
      break;
    }
    if (!page.paginationToken) {
      exhausted = true;
      stopReason = "exhausted";
      break;
    }
    if (seenTokens.has(page.paginationToken)) {
      stopReason = "repeated-token";
      break;
    }
    seenTokens.add(page.paginationToken);
    token = page.paginationToken;
    await sleep(200, signal);
  }

  return {
    added,
    pages,
    total: known.size,
    target,
    targetReached: known.size >= target,
    exhausted,
    stopReason,
  };
}
