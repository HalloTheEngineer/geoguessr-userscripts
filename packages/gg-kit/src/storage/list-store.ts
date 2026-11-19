import { pageWindow } from "../window.js";

export interface ListStoreOptions<T> {
  key: string;
  version: number;
  area?: "local" | "session";
  maxEntries?: number;
  create?: (value: unknown) => T | null;
}

export interface ListStore<T> {
  readonly key: string;
  readonly available: boolean;
  readonly lastError: Error | null;
  get(): T[];
  reload(): T[];
  set(values: readonly T[]): void;
  push(value: T): void;
  update(predicate: (value: T) => boolean, updater: (value: T) => T): void;
  remove(predicate: (value: T) => boolean): void;
  clear(): void;
  flush(): void;
  subscribe(listener: (values: readonly T[]) => void): () => void;
  dispose(): void;
}

function storageArea(area: "local" | "session" | undefined): Storage | null {
  try {
    return area === "session" ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function createListStore<T>(options: ListStoreOptions<T>): ListStore<T> {
  const storage = storageArea(options.area);
  const maxEntries = options.maxEntries ?? Infinity;
  let lastError: Error | null = null;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let values: T[] = [];
  const listeners = new Set<(values: readonly T[]) => void>();

  const report = (error: unknown) => {
    lastError = error instanceof Error ? error : new Error(String(error));
  };

  const parse = (value: unknown): T | null => {
    if (options.create) return options.create(value);
    return (value as T) ?? null;
  };

  const read = () => {
    if (!storage) return;
    let raw: string | null = null;
    try {
      raw = storage.getItem(options.key);
    } catch (error) {
      report(error);
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || parsed.v !== options.version || !Array.isArray(parsed.data)) {
        return;
      }
      values = parsed.data.map(parse).filter((value): value is T => value !== null);
    } catch (error) {
      report(error);
    }
  };

  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener(values);
      } catch (error) {
        console.warn(`[gg-kit] list store listener failed for ${options.key}`, error);
      }
    }
  };

  const write = () => {
    if (!storage || disposed) return;
    try {
      const trimmed = values.slice(0, maxEntries);
      if (trimmed.length === 0) storage.removeItem(options.key);
      else storage.setItem(options.key, JSON.stringify({ v: options.version, data: trimmed }));
      lastError = null;
    } catch (error) {
      report(error);
    }
  };

  const schedule = () => {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      write();
    }, 120);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== options.key) return;
    read();
    notify();
  };

  read();
  if (storage && options.area !== "session") {
    pageWindow().addEventListener("storage", onStorage);
  }

  return {
    key: options.key,
    get available() {
      return !!storage;
    },
    get lastError() {
      return lastError;
    },
    get() {
      return [...values];
    },
    reload() {
      read();
      return [...values];
    },
    set(next) {
      values = [...next].slice(0, maxEntries);
      notify();
      schedule();
    },
    push(value) {
      values = [value, ...values].slice(0, maxEntries);
      notify();
      schedule();
    },
    update(predicate, updater) {
      values = values.map((value) => (predicate(value) ? updater(value) : value));
      notify();
      schedule();
    },
    remove(predicate) {
      values = values.filter((value) => !predicate(value));
      notify();
      schedule();
    },
    clear() {
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      values = [];
      try {
        storage?.removeItem(options.key);
      } catch (error) {
        report(error);
      }
      notify();
    },
    flush() {
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      write();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      write();
      disposed = true;
      listeners.clear();
      if (storage && options.area !== "session") {
        pageWindow().removeEventListener("storage", onStorage);
      }
    },
  };
}
