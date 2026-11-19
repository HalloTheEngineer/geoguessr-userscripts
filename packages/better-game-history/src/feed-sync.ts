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
}

const MAX_PAGES = 100;
const PAGE_SIZE = 50;

function parsePayload(value: unknown): FeedPayload | null {
  if (!value) return null;
  if (typeof value === "object") return value as FeedPayload;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as FeedPayload) : null;
  } catch {
    return null;
  }
}

function isDuelType(value: unknown): boolean {
  const type = typeof value === "number" ? value : Number(value);
  return type === 6 || type === 11;
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
  const seenTokens = new Set<string>();
  const maxPages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(target / PAGE_SIZE) + 10));
  let token: string | null = null;
  let added = 0;
  let pages = 0;

  while (pages < maxPages) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const page = await feedPage(token, PAGE_SIZE);
    pages++;
    const entries = Array.isArray(page.entries) ? page.entries : [];
    if (!entries.length) break;

    let pageAdded = 0;
    for (const entry of entries) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const entryTime = typeof entry.time === "string" ? entry.time : undefined;
      const processPayload = (payload: FeedPayload | null) => {
        if (!payload || !isDuelType(entry.type)) return;
        const record = payloadToRecord(payload, entryTime, userId);
        if (!record || known.has(record.gameId)) return;
        known.add(record.gameId);
        repository.merge(record, limit);
        added++;
        pageAdded++;
      };

      if (Array.isArray(entry.payload)) {
        for (const payload of entry.payload) processPayload(parsePayload(payload));
      } else {
        processPayload(parsePayload(entry.payload));
      }
    }

    if (pageAdded) onUpdate();
    if (known.size >= target) break;
    if (!page.paginationToken) break;
    if (seenTokens.has(page.paginationToken)) break;
    seenTokens.add(page.paginationToken);
    token = page.paginationToken;
    await sleep(200, signal);
  }

  return { added, pages };
}
