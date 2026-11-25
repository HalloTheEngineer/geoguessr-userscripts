export interface WaitForAppReadyOptions {
  quietMs?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function documentRoot(): Element | null {
  const root = document.documentElement as Element | null;
  return root && root.nodeType === 1 ? root : null;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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

/**
 * The script runs at document-start, where the document can still be an empty shell
 * (no <html> yet, or a document that is being replaced). Observing a missing root
 * throws, so wait until there is a node to observe.
 */
function waitForDocumentRoot(maxWaitMs: number, signal?: AbortSignal): Promise<Element | null> {
  const root = documentRoot();
  if (root) return Promise.resolve(root);
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      timer = null;
      poll = null;
      document.removeEventListener("readystatechange", check);
      document.removeEventListener("DOMContentLoaded", check);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (value: Element | null) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };
    const check = () => {
      const current = documentRoot();
      if (current) finish(current);
    };
    const onAbort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(abortError());
    };

    document.addEventListener("readystatechange", check);
    document.addEventListener("DOMContentLoaded", check);
    signal?.addEventListener("abort", onAbort, { once: true });
    poll = setInterval(check, 16);
    timer = setTimeout(() => finish(documentRoot()), Math.max(0, maxWaitMs));
    check();
  });
}

async function waitForDomQuiet(
  quietMs: number,
  maxWaitMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abortError();
  const root = await waitForDocumentRoot(maxWaitMs, signal);
  if (signal?.aborted) throw abortError();
  if (!root || typeof MutationObserver === "undefined") {
    await delay(quietMs, signal);
    return;
  }
  await new Promise<void>((resolve, reject) => {
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
    try {
      observer.observe(root, { childList: true, subtree: true });
    } catch {
      // The root was replaced while we were starting; treat the DOM as settled.
      finish();
      return;
    }
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
