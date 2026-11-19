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

type RankedQueue = "solo" | "team";

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
  targetPerQueue: number;
  signal?: AbortSignal;
  onUpdate: () => void;
}

export interface FeedSyncResult {
  added: number;
  pages: number;
  solo: number;
  team: number;
  target: number;
  soloTargetReached: boolean;
  teamTargetReached: boolean;
  targetReached: boolean;
  exhausted: boolean;
  stopReason: FeedStopReason;
  ignoredUnranked: number;
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

function rankedQueue(payload: FeedPayload): RankedQueue | null {
  const mode = payload.gameMode;
  if (mode === "TeamDuels") return "team";
  if (
    mode === "Duels" ||
    mode === "StandardDuels" ||
    mode === "NoMoveDuels" ||
    mode === "NmpzDuels"
  )
    return "solo";
  return null;
}

function payloadToRecord(
  payload: FeedPayload,
  entryTime: string | undefined,
  userId: string,
  queue: RankedQueue,
): GameRecord | null {
  if (typeof payload.gameId !== "string" || !payload.gameId) return null;
  const timeValue = payload.time || entryTime;
  if (!timeValue || Number.isNaN(new Date(timeValue).getTime())) return null;
  const modeKey = payload.competitiveGameMode || payload.gameMode || "Moving";
  return {
    gameId: payload.gameId,
    userId,
    time: timeValue,
    modeKey,
    mode: formatModeName(modeKey, true),
    isRated: true,
    isTeamDuel: queue === "team",
    ratingBefore: toFiniteNumber(payload.ratingBefore) ?? undefined,
    ratingAfter: toFiniteNumber(payload.ratingAfter) ?? undefined,
    ratingChange: toFiniteNumber(payload.ratingChange) ?? undefined,
    hydration: { state: "pending", attempts: 0 },
    updatedAt: new Date().toISOString(),
    source: "feed",
  };
}

export async function syncFeed(options: FeedSyncOptions): Promise<FeedSyncResult> {
  const { userId, repository, limit, targetPerQueue, signal, onUpdate } = options;
  const target = Math.max(1, Math.min(Math.floor(targetPerQueue), Math.floor(limit / 2)));
  const existing = repository.get(userId, limit);
  const knownAll = new Set(existing.map((record) => record.gameId));
  const knownSolo = new Set(
    existing
      .filter((record) => record.isRated && !record.isTeamDuel)
      .map((record) => record.gameId),
  );
  const knownTeam = new Set(
    existing.filter((record) => record.isRated && record.isTeamDuel).map((record) => record.gameId),
  );
  const backfillSolo = knownSolo.size < target;
  const backfillTeam = knownTeam.size < target;
  let encounteredKnownSolo = false;
  let encounteredKnownTeam = false;
  const seenTokens = new Set<string>();
  const maxPages = Math.max(50, Math.min(MAX_PAGES, target * 4));
  let token: string | null = null;
  let added = 0;
  let pages = 0;
  let ignoredUnranked = 0;
  let exhausted = false;
  let stopReason: FeedStopReason = "page-limit";

  const processGame = (
    value: unknown,
    entryTime: string | undefined,
    queue: RankedQueue,
  ): boolean => {
    const payload = parsePayload(value);
    if (!payload) return false;
    const record = payloadToRecord(payload, entryTime, userId, queue);
    if (!record) return false;
    if (knownAll.has(record.gameId)) {
      if (queue === "solo") encounteredKnownSolo = true;
      else encounteredKnownTeam = true;
      return false;
    }
    knownAll.add(record.gameId);
    if (queue === "solo") knownSolo.add(record.gameId);
    else knownTeam.add(record.gameId);
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

    if (type === 11) {
      ignoredUnranked++;
      return false;
    }

    if (type === 7) {
      if (depth > 0) return false;
      const list = parseJsonValue(activity.payload);
      if (!Array.isArray(list)) return false;
      let found = false;
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const nested = item as FeedActivity;
        if (nested.type === undefined) {
          const raw = parsePayload(nested);
          const queue = raw ? rankedQueue(raw) : null;
          if (queue && processGame(raw, entryTime, queue)) found = true;
        } else if (processActivity(nested, entryTime, depth + 1)) {
          found = true;
        }
      }
      return found;
    }

    if (type !== 6) return false;
    const value = parseJsonValue(activity.payload);
    if (Array.isArray(value)) {
      let found = false;
      for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const nested = item as FeedActivity;
        if (nested.type === undefined) {
          const raw = parsePayload(nested);
          const queue = raw ? rankedQueue(raw) : null;
          if (queue && processGame(raw, entryTime, queue)) found = true;
        } else if (processActivity(nested, entryTime, depth + 1)) {
          found = true;
        }
      }
      return found;
    }
    const payload = parsePayload(value);
    if (!payload) return false;
    const queue = rankedQueue(payload);
    return queue ? processGame(payload, entryTime, queue) : false;
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

    encounteredKnownSolo = false;
    encounteredKnownTeam = false;
    let pageAdded = 0;
    for (const entry of entries) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (processActivity(entry as FeedActivity, undefined)) pageAdded++;
    }

    if (pageAdded) onUpdate();
    const soloSettled = backfillSolo ? knownSolo.size >= target : encounteredKnownSolo;
    const teamSettled = backfillTeam ? knownTeam.size >= target : encounteredKnownTeam;
    if (soloSettled && teamSettled) {
      stopReason = !backfillSolo || !backfillTeam ? "known-frontier" : "target";
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

  const soloTargetReached = knownSolo.size >= target;
  const teamTargetReached = knownTeam.size >= target;
  return {
    added,
    pages,
    solo: knownSolo.size,
    team: knownTeam.size,
    target,
    soloTargetReached,
    teamTargetReached,
    targetReached: soloTargetReached && teamTargetReached,
    exhausted,
    stopReason,
    ignoredUnranked,
  };
}
