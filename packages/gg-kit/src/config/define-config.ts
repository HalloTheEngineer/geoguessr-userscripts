import { pageWindow } from "../window.js";
import type { ConfigChange, ConfigDefinition, ConfigField, ConfigStore } from "./types.js";

const WRITE_DELAY_MS = 80;

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (typeof min === "number" && Number.isFinite(min)) next = Math.max(min, next);
  if (typeof max === "number" && Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

function normalizeField(field: ConfigField, raw: unknown, all: Record<string, any>): unknown {
  if (raw === undefined || raw === null) return clone(field.default);
  if (field.parse) {
    const parsed = field.parse(raw);
    if (parsed !== undefined) return parsed;
    return clone(field.default);
  }

  switch (field.type) {
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      return clone(field.default);
    case "number":
    case "range": {
      const number = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(number)) return clone(field.default);
      const value = clamp(number, field.min, field.max);
      return field.validate?.(value, all) ? clone(field.default) : value;
    }
    case "select": {
      const value = String(raw);
      return field.options?.some((option) => option.value === value) ? value : clone(field.default);
    }
    case "text":
      return typeof raw === "string" ? raw : String(raw);
    case "custom":
      return clone(raw);
    default:
      return clone(field.default);
  }
}

function normalizeAll<T extends Record<string, any>>(
  definition: ConfigDefinition<T>,
  source: Record<string, any>,
): { value: T; errors: string[] } {
  const value = {} as T;
  const errors: string[] = [];
  for (const [key, field] of Object.entries(definition.fields) as [
    keyof T & string,
    ConfigField,
  ][]) {
    if (source[key] === undefined) {
      (value as Record<string, any>)[key] = clone(field.default);
      continue;
    }
    const normalized = normalizeField(field, source[key], value as Record<string, any>);
    const validation = field.validate?.(normalized, value as Record<string, any>) ?? null;
    if (validation) {
      errors.push(`${key}: ${validation}`);
      (value as Record<string, any>)[key] = clone(field.default);
    } else {
      (value as Record<string, any>)[key] = normalized;
    }
  }
  return { value, errors };
}

function defaultsFor<T extends Record<string, any>>(definition: ConfigDefinition<T>): T {
  const value = {} as T;
  for (const [key, field] of Object.entries(definition.fields) as [
    keyof T & string,
    ConfigField,
  ][]) {
    (value as Record<string, any>)[key] = clone(field.default);
  }
  return value;
}

function area(definition: ConfigDefinition<Record<string, any>>): Storage | null {
  try {
    return definition.area === "session" ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}

function safeParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function defineConfig<T extends Record<string, any>>(
  definition: ConfigDefinition<T>,
): ConfigStore<T> {
  const storage = area(definition as ConfigDefinition<Record<string, any>>);
  const defaults = defaultsFor(definition);
  let state = defaultsFor(definition);
  let lastError: Error | null = null;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const listeners = new Set<{
    callback: (change: ConfigChange<T>) => void;
    keys?: readonly (keyof T)[];
  }>();

  const report = (error: unknown) => {
    lastError = error instanceof Error ? error : new Error(String(error));
  };

  const notify = <K extends keyof T>(change: ConfigChange<T, K>) => {
    for (const entry of [...listeners]) {
      if (entry.keys && !entry.keys.includes(change.key)) continue;
      try {
        entry.callback(change as ConfigChange<T>);
      } catch (error) {
        console.warn(`[gg-kit] config listener failed for ${definition.key}`, error);
      }
    }
  };

  const read = (): void => {
    if (!storage) {
      state = defaultsFor(definition);
      return;
    }
    let raw: string | null = null;
    try {
      raw = storage.getItem(definition.key);
    } catch (error) {
      report(error);
      state = defaultsFor(definition);
      return;
    }
    if (!raw) {
      state = defaultsFor(definition);
      return;
    }

    const parsed = safeParse(raw);
    if (!isRecord(parsed) || typeof parsed.v !== "number" || !isRecord(parsed.data)) {
      state = defaultsFor(definition);
      return;
    }

    let version = parsed.v;
    let data = parsed.data as Record<string, any>;
    if (version > definition.version) {
      state = defaultsFor(definition);
      report(new Error(`${definition.key}: stored config version ${version} is newer`));
      return;
    }
    if (version < definition.version) {
      try {
        storage.setItem(`${definition.key}.backup`, raw);
      } catch {
        // backups are best effort
      }
      while (version < definition.version) {
        const migrate = definition.migrations?.[version];
        if (!migrate) {
          report(
            new Error(
              `${definition.key}: missing migration from version ${version} to ${definition.version}`,
            ),
          );
          state = defaultsFor(definition);
          return;
        }
        data = migrate(data);
        version++;
      }
    }

    const normalized = normalizeAll(definition, data);
    state = normalized.value;
    if (normalized.errors.length) report(new Error(normalized.errors.join("; ")));
  };

  const persisted = (): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const [key, field] of Object.entries(definition.fields) as [
      keyof T & string,
      ConfigField,
    ][]) {
      if (field.persist === false) continue;
      const value = state[key];
      if (definition.write !== "full" && equal(value, field.default)) continue;
      if (field.omitDefaultFromStorage && equal(value, field.default)) continue;
      out[key] = value;
    }
    return out;
  };

  const write = (): void => {
    if (!storage || disposed) return;
    try {
      const data = persisted();
      if (Object.keys(data).length === 0) storage.removeItem(definition.key);
      else storage.setItem(definition.key, JSON.stringify({ v: definition.version, data }));
      lastError = null;
    } catch (error) {
      report(error);
    }
  };

  const scheduleWrite = (): void => {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      write();
    }, WRITE_DELAY_MS);
  };

  const flush = (): void => {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    write();
  };

  const update = <K extends keyof T>(key: K, raw: unknown, source: ConfigChange<T>["source"]) => {
    const field = definition.fields[key] as ConfigField | undefined;
    if (!field) return false;
    const next = normalizeField(field, raw, state as Record<string, any>) as T[K];
    const validation = field.validate?.(next, state as Record<string, any>) ?? null;
    if (validation) {
      report(new Error(`${String(key)}: ${validation}`));
      return false;
    }
    const previous = state[key];
    if (equal(previous, next)) return true;
    state = { ...state, [key]: next };
    notify({ key, value: next, previous, source });
    scheduleWrite();
    return true;
  };

  read();

  const onStorage = (event: StorageEvent) => {
    if (event.key !== definition.key) return;
    const before = state;
    read();
    for (const key of Object.keys(definition.fields) as (keyof T)[]) {
      if (equal(before[key], state[key])) continue;
      notify({
        key,
        value: state[key],
        previous: before[key],
        source: "storage",
      });
    }
  };

  if (storage && typeof window !== "undefined") {
    pageWindow().addEventListener("storage", onStorage);
  }

  return {
    key: definition.key,
    version: definition.version,
    definition,
    get available() {
      return !!storage;
    },
    get lastError() {
      return lastError;
    },
    get<K extends keyof T>(key?: K): any {
      if (key === undefined) return state;
      return state[key];
    },
    set(key, value) {
      return update(key, value, "set");
    },
    patch(value) {
      for (const key of Object.keys(value) as (keyof T)[]) {
        update(key, value[key], "patch");
      }
      scheduleWrite();
    },
    reset(key) {
      if (key !== undefined) {
        update(key, defaults[key], "reset");
        return;
      }
      const previous = state;
      state = defaultsFor(definition);
      for (const fieldKey of Object.keys(definition.fields) as (keyof T)[]) {
        notify({
          key: fieldKey,
          value: state[fieldKey],
          previous: previous[fieldKey],
          source: "reset",
        });
      }
      scheduleWrite();
    },
    clear() {
      const previous = state;
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      state = defaultsFor(definition);
      try {
        storage?.removeItem(definition.key);
      } catch (error) {
        report(error);
      }
      for (const key of Object.keys(definition.fields) as (keyof T)[]) {
        notify({
          key,
          value: state[key],
          previous: previous[key],
          source: "reset",
        });
      }
    },
    flush,
    subscribe(listener, keys) {
      const entry = { callback: listener, keys };
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
    export() {
      return { version: definition.version, data: clone(state) };
    },
    import(value) {
      const record = isRecord(value) && isRecord(value.data) ? value.data : value;
      if (!isRecord(record)) return { ok: false, errors: ["expected an object"] };
      const previous = state;
      const normalized = normalizeAll(definition, record);
      state = normalized.value;
      for (const key of Object.keys(definition.fields) as (keyof T)[]) {
        notify({
          key,
          value: state[key],
          previous: previous[key],
          source: "import",
        });
      }
      scheduleWrite();
      return { ok: normalized.errors.length === 0, errors: normalized.errors };
    },
    dispose() {
      disposed = true;
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = null;
      listeners.clear();
      if (storage) pageWindow().removeEventListener("storage", onStorage);
    },
  };
}
