import { API, createJsonStore, nextData, pageWindow } from "gg-kit";

export interface NameEntry {
  nick: string;
  updatedAt: string;
}

export interface NameStore {
  readonly revision: number;
  captureVisitedProfile(): void;
  resolve(playerIds: readonly string[], priority?: boolean): void;
  record(playerId: string | undefined, nick: string | undefined): void;
  nameFor(playerId: string | undefined, fallback?: string): string;
  shortId(playerId: string | undefined): string;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const KEY = "gg.better-game-history.players";
const VERSION = 1;
const MAX_ENTRIES = 2000;

interface NameMap {
  [playerId: string]: NameEntry;
}

function validNick(playerId: string | undefined, nick: unknown): nick is string {
  return (
    typeof nick === "string" &&
    nick.trim().length > 0 &&
    nick !== "undefined" &&
    (!playerId || nick !== playerId)
  );
}

function sanitize(value: unknown): NameMap {
  if (!value || typeof value !== "object") return {};
  const result: NameMap = {};
  for (const [playerId, entry] of Object.entries(value)) {
    if (!playerId || !entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    if (!validNick(playerId, source.nick)) continue;
    result[playerId] = {
      nick: source.nick,
      updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
    };
  }
  return result;
}

function trim(names: NameMap): NameMap {
  const entries = Object.entries(names);
  if (entries.length <= MAX_ENTRIES) return names;
  entries.sort(
    (left, right) => new Date(right[1].updatedAt).getTime() - new Date(left[1].updatedAt).getTime(),
  );
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}

export function createNameStore(): NameStore {
  const store = createJsonStore<NameMap>({ key: KEY, version: VERSION });
  let names = sanitize(store.get());
  let revision = 0;
  let disposed = false;
  let resolving = false;
  let cooldownUntil = 0;
  const queue: string[] = [];
  const queued = new Set<string>();
  const attempts = new Map<string, number>();
  const listeners = new Set<() => void>();

  const notify = () => {
    revision++;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        console.warn("[better-game-history] name listener failed", error);
      }
    }
  };

  const persist = () => {
    store.set(names);
  };

  const shortId = (playerId: string | undefined): string => {
    if (!playerId) return "#unknown";
    return `#${playerId.slice(-6)}`;
  };

  const record = (playerId: string | undefined, nick: string | undefined) => {
    if (!playerId || !validNick(playerId, nick)) return;
    const existing = names[playerId];
    if (existing?.nick === nick) return;
    names = {
      ...names,
      [playerId]: { nick, updatedAt: new Date().toISOString() },
    };
    names = trim(names);
    persist();
    notify();
  };

  const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const pump = async () => {
    if (resolving || disposed) return;
    resolving = true;
    try {
      while (queue.length && !disposed) {
        const wait = cooldownUntil - Date.now();
        if (wait > 0) await delay(wait);
        const playerId = queue.shift();
        if (!playerId) continue;
        queued.delete(playerId);
        if (names[playerId] || (attempts.get(playerId) || 0) >= 2) continue;
        try {
          const response = await pageWindow().fetch(`${API.users}${encodeURIComponent(playerId)}`, {
            credentials: "include",
          });
          if (response.status === 429) {
            const retryAfter = Number(response.headers.get("retry-after")) * 1000;
            cooldownUntil =
              Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30_000);
            const count = (attempts.get(playerId) || 0) + 1;
            attempts.set(playerId, count);
            if (count < 2 && !queued.has(playerId)) {
              queue.unshift(playerId);
              queued.add(playerId);
            }
            continue;
          }
          if (response.ok) {
            const profile = (await response.json()) as { nick?: unknown };
            if (typeof profile.nick === "string") record(playerId, profile.nick);
            else attempts.set(playerId, 2);
          } else {
            attempts.set(playerId, 2);
          }
        } catch {
          attempts.set(playerId, (attempts.get(playerId) || 0) + 1);
        }
        await delay(1500);
      }
    } finally {
      resolving = false;
      if (queue.length && !disposed) void pump();
    }
  };

  const resolve = (playerIds: readonly string[], priority = false) => {
    for (const playerId of playerIds) {
      if (
        !playerId ||
        names[playerId] ||
        queued.has(playerId) ||
        (attempts.get(playerId) || 0) >= 2
      )
        continue;
      if (priority) queue.unshift(playerId);
      else queue.push(playerId);
      queued.add(playerId);
    }
    void pump();
  };

  const captureVisitedProfile = () => {
    if (!location.pathname.startsWith("/user/")) return;
    const data = nextData() as {
      props?: {
        pageProps?: {
          userProfile?: { user?: { userId?: string; nick?: string } };
        };
      };
    } | null;
    const user = data?.props?.pageProps?.userProfile?.user;
    record(user?.userId, user?.nick);
  };

  return {
    get revision() {
      return revision;
    },
    captureVisitedProfile,
    resolve,
    record,
    shortId,
    nameFor(playerId, fallback) {
      if (validNick(playerId, fallback)) return fallback;
      if (playerId && names[playerId]) return names[playerId].nick;
      return shortId(playerId);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      queued.clear();
      listeners.clear();
    },
  };
}
