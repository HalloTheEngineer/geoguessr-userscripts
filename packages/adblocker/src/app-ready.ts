export interface WaitForAppReadyOptions {
  quietMs?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function waitForLoad(signal?: AbortSignal): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      window.removeEventListener("load", onLoad);
      reject(abortError());
    };
    const onLoad = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    window.addEventListener("load", onLoad, { once: true });
  });
}

function waitForDomQuiet(quietMs: number, maxWaitMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (typeof MutationObserver === "undefined") {
    return new Promise((resolve) => setTimeout(resolve, quietMs));
  }
  return new Promise((resolve, reject) => {
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;
    let finished = false;
    const cleanup = () => {
      if (quietTimer) clearTimeout(quietTimer);
      if (maxTimer) clearTimeout(maxTimer);
      observer.disconnect();
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(abortError());
    };
    const reset = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    };
    const observer = new MutationObserver(reset);
    signal?.addEventListener("abort", onAbort, { once: true });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    maxTimer = setTimeout(finish, Math.max(quietMs, maxWaitMs));
    reset();
  });
}

function waitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    };
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(() => resolve(), { timeout: 1000 });
    } else {
      setTimeout(resolve, 50);
    }
  });
}

export async function waitForAppReady(options: WaitForAppReadyOptions = {}): Promise<void> {
  const quietMs = options.quietMs ?? 200;
  const maxWaitMs = options.maxWaitMs ?? 3000;
  const signal = options.signal;
  if (signal?.aborted) throw abortError();
  await waitForLoad(signal);
  if (signal?.aborted) throw abortError();
  await waitForDomQuiet(quietMs, maxWaitMs, signal);
  if (signal?.aborted) throw abortError();
  await waitForIdle();
  if (signal?.aborted) throw abortError();
}
