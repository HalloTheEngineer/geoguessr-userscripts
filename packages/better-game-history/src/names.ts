import { createJsonStore, nextData } from "gg-kit";

export interface NameEntry {
  nick: string;
  updatedAt: string;
}

export interface NameStore {
  readonly revision: number;
  captureVisitedProfile(): void;
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
      listeners.clear();
    },
  };
}
