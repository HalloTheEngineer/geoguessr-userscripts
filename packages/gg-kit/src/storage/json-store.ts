export interface JsonStoreOptions {
  key: string;
  version: number;
  area?: "local" | "session";
}

export interface JsonStore<T> {
  readonly key: string;
  readonly available: boolean;
  get(): T | null;
  set(value: T): void;
  remove(): void;
  dispose(): void;
}

function area(kind: "local" | "session" | undefined): Storage | null {
  try {
    return kind === "session" ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}

function isEnvelope(value: unknown): value is { v: number; data: unknown } {
  return !!value && typeof value === "object" && "v" in value && "data" in value;
}

export function createJsonStore<T>(options: JsonStoreOptions): JsonStore<T> {
  const storage = area(options.area);
  return {
    key: options.key,
    get available() {
      return !!storage;
    },
    get() {
      if (!storage) return null;
      try {
        const raw = storage.getItem(options.key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!isEnvelope(parsed) || parsed.v !== options.version) return null;
        return parsed.data as T;
      } catch {
        return null;
      }
    },
    set(value) {
      if (!storage) return;
      try {
        storage.setItem(options.key, JSON.stringify({ v: options.version, data: value }));
      } catch (error) {
        console.warn(`[gg-kit] could not persist ${options.key}`, error);
      }
    },
    remove() {
      try {
        storage?.removeItem(options.key);
      } catch {
        // ignore
      }
    },
    dispose() {
      // no listeners or timers
    },
  };
}
