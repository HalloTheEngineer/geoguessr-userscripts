import { hasDom, pageWindow } from "./window.js";

export type DomCallback = () => void;

interface DomScheduler {
  observer: MutationObserver;
  apiVersion: number;
  callbacks: Set<DomCallback>;
  timer: number | null;
  started: boolean;
}

const KEY = "__GG_KIT_DOM__";
const API_VERSION = 1;

function scheduler(): DomScheduler | null {
  if (!hasDom()) return null;
  const win = pageWindow() as unknown as Record<string, DomScheduler | undefined>;
  if (win[KEY]) {
    if (win[KEY]!.apiVersion !== API_VERSION) {
      console.warn(
        `[gg-kit] shared DOM scheduler version mismatch (${win[KEY]!.apiVersion} vs ${API_VERSION})`,
      );
    }
    return win[KEY]!;
  }
  if (typeof MutationObserver === "undefined") return null;
  const state: DomScheduler = {
    observer: new MutationObserver(() => schedule()),
    apiVersion: API_VERSION,
    callbacks: new Set(),
    timer: null,
    started: false,
  };
  const schedule = () => {
    if (state.timer !== null) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      if (document.hidden) return;
      for (const callback of [...state.callbacks]) {
        try {
          callback();
        } catch (error) {
          console.warn("[gg-kit] DOM callback failed", error);
        }
      }
    }, 50) as unknown as number;
  };
  const start = () => {
    if (state.started) return;
    const root = document.documentElement;
    if (!root) {
      setTimeout(start, 50);
      return;
    }
    state.observer.observe(root, { childList: true, subtree: true });
    state.started = true;
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) schedule();
    });
  };
  start();
  win[KEY] = state;
  return state;
}

export function onDomChange(callback: DomCallback): () => void {
  const state = scheduler();
  if (!state) return () => {};
  state.callbacks.add(callback);
  return () => state.callbacks.delete(callback);
}

export function waitForBody(): Promise<HTMLElement> {
  if (!hasDom()) return Promise.reject(new Error("DOM is not available"));
  if (document.body) return Promise.resolve(document.body);
  return new Promise((resolve) => {
    const check = () => {
      if (document.body) {
        document.removeEventListener("DOMContentLoaded", check);
        resolve(document.body);
      }
    };
    document.addEventListener("DOMContentLoaded", check);
    check();
  });
}

export function isVisible(element: Element | null | undefined): element is HTMLElement {
  if (element?.nodeType !== 1) return false;
  if (!element.isConnected) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

export function waitFor<T extends Element = HTMLElement>(
  selectors: string | string[],
  options: {
    root?: ParentNode | null;
    timeout?: number;
    predicate?: (element: Element) => boolean;
  } = {},
): Promise<T | null> {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  const root = options.root ?? document;
  const timeout = options.timeout ?? 15000;
  const predicate = options.predicate ?? (() => true);
  const find = (): T | null => {
    for (const selector of list) {
      for (const element of root.querySelectorAll(selector)) {
        if (predicate(element)) return element as T;
      }
    }
    return null;
  };
  const immediate = find();
  if (immediate) return Promise.resolve(immediate);
  return new Promise((resolve) => {
    let stopped = false;
    const done = (element: T | null) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(element);
    };
    const check = () => {
      const element = find();
      if (element) done(element);
    };
    const unsubscribe = onDomChange(check);
    const timer = setTimeout(() => done(find()), timeout);
  });
}

export function onRouteChange(callback: (url: URL) => void): () => void {
  if (!hasDom()) return () => {};
  const win = pageWindow() as unknown as Record<string, unknown>;
  const stateKey = "__GG_KIT_ROUTE__";
  let state = win[stateKey] as
    | { callbacks: Set<(url: URL) => void>; installed: boolean; last: string }
    | undefined;
  if (!state) {
    state = { callbacks: new Set(), installed: false, last: location.href };
    win[stateKey] = state;
  }
  state.callbacks.add(callback);
  const current = state;
  if (!current.installed) {
    const notify = () => {
      if (current.last === location.href) return;
      current.last = location.href;
      const url = new URL(location.href);
      for (const fn of [...current.callbacks]) {
        try {
          fn(url);
        } catch (error) {
          console.warn("[gg-kit] route callback failed", error);
        }
      }
    };
    const history = (win as unknown as Window).history;
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method];
      history[method] = function (this: History, ...args: unknown[]) {
        const result = (original as (...values: unknown[]) => unknown).apply(this, args);
        setTimeout(notify, 0);
        return result;
      } as (typeof history)[typeof method];
    }
    pageWindow().addEventListener("popstate", notify);
    current.installed = true;
  }
  return () => state?.callbacks.delete(callback);
}
