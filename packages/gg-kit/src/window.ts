export type PageWindow = Window & typeof globalThis & Record<string, unknown>;

declare const unsafeWindow: PageWindow | undefined;

let cached: PageWindow | null = null;

export function pageWindow(): PageWindow {
  if (cached) return cached;
  if (typeof unsafeWindow !== "undefined" && unsafeWindow) {
    cached = unsafeWindow;
    return cached;
  }
  const candidate = (globalThis as unknown as { window?: PageWindow }).window;
  cached =
    candidate && typeof candidate.addEventListener === "function"
      ? candidate
      : (globalThis as unknown as PageWindow);
  return cached;
}

export function hasDom(): boolean {
  return typeof document !== "undefined";
}

export function isTopFrame(): boolean {
  try {
    return (pageWindow() as unknown as Window).top === (pageWindow() as unknown as Window).self;
  } catch {
    return false;
  }
}

export function once<T extends object>(target: T, key: string, factory: () => unknown): unknown {
  const record = target as Record<string, unknown>;
  if (record[key] !== undefined) return record[key];
  record[key] = factory();
  return record[key];
}
