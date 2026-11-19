import type { ConfigStore } from "../config/types.js";
import { checkSiteBuild, registerScript } from "../diagnostics.js";
import { onRouteChange } from "../dom.js";
import { registerSettings } from "../settings/host.js";
import type { SettingsHandle, SettingsRegistrationInput } from "../settings/types.js";
import { isTopFrame, pageWindow } from "../window.js";

export interface UserscriptContext<T extends Record<string, any>> {
  readonly config: ConfigStore<T>;
  readonly settings: SettingsHandle | null;
  readonly log: (...args: unknown[]) => void;
  onCleanup(callback: () => void): void;
  onRoute(callback: (url: URL) => void): void;
}

export interface StartUserscriptOptions<T extends Record<string, any>> {
  name: string;
  version: string;
  config?: ConfigStore<T>;
  settings?: SettingsRegistrationInput<T> | null;
  topFrameOnly?: boolean;
  cleanupKeys?: readonly string[];
  setup: (context: UserscriptContext<T>) => void | (() => void);
}

export interface UserscriptHandle {
  readonly started: boolean;
  readonly context: UserscriptContext<Record<string, any>> | null;
  stop(): void;
}

function guardKey(name: string): string {
  return `__GG_${name.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}_LOADED__`;
}

export function startUserscript<T extends Record<string, any>>(
  options: StartUserscriptOptions<T>,
): UserscriptHandle {
  const win = pageWindow() as unknown as Record<string, any>;
  const key = guardKey(options.name);
  if (win[key]) {
    return { started: false, context: null, stop: () => {} };
  }
  if (options.topFrameOnly !== false && !isTopFrame()) {
    return { started: false, context: null, stop: () => {} };
  }
  win[key] = true;

  registerScript(options.name, options.version);
  checkSiteBuild();

  for (const cleanupKey of options.cleanupKeys || []) {
    try {
      localStorage.removeItem(cleanupKey);
    } catch {
      // storage may be unavailable
    }
  }

  const cleanups: Array<() => void> = [];
  const routeCleanups: Array<() => void> = [];
  let settings: SettingsHandle | null = null;
  let stopped = false;

  const context: UserscriptContext<T> = {
    config: options.config as ConfigStore<T>,
    get settings() {
      return settings;
    },
    log: (...args: unknown[]) => console.log(`[${options.name}]`, ...args),
    onCleanup(callback) {
      cleanups.push(callback);
    },
    onRoute(callback) {
      routeCleanups.push(onRouteChange(callback));
      try {
        callback(new URL(location.href));
      } catch {
        // route callback is best effort
      }
    },
  };

  if (options.settings && options.config) {
    settings = registerSettings(options.settings);
    cleanups.push(() => settings?.dispose());
  }

  try {
    const setupCleanup = options.setup(context);
    if (typeof setupCleanup === "function") cleanups.push(setupCleanup);
  } catch (error) {
    console.error(`[${options.name}] setup failed`, error);
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch (cleanupError) {
        console.warn(`[${options.name}] cleanup failed`, cleanupError);
      }
    }
    throw error;
  }

  const onPageHide = () => {
    options.config?.flush();
  };
  pageWindow().addEventListener("pagehide", onPageHide);
  cleanups.push(() => pageWindow().removeEventListener("pagehide", onPageHide));

  return {
    get started() {
      return true;
    },
    get context() {
      return context as unknown as UserscriptContext<Record<string, any>>;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const cleanup of routeCleanups.splice(0).reverse()) {
        try {
          cleanup();
        } catch (error) {
          console.warn(`[${options.name}] route cleanup failed`, error);
        }
      }
      for (const cleanup of cleanups.splice(0).reverse()) {
        try {
          cleanup();
        } catch (error) {
          console.warn(`[${options.name}] cleanup failed`, error);
        }
      }
      options.config?.dispose();
    },
  };
}
