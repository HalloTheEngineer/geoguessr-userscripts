import { pageWindow } from "./window.js";

export const API = {
  feed: "/api/v4/feed/private",
  profiles: "/api/v3/profiles",
  users: "/api/v3/users/",
  games: "/api/v3/games",
  duelServer: "https://game-server.geoguessr.com/api/duels/",
  duelOngoing: "/api/duels/ongoing",
} as const;

type Matcher = string | RegExp | ((url: string, init: RequestInit | undefined) => boolean);

interface FetchHooks {
  installed: boolean;
  apiVersion: number;
  responseListeners: Array<{
    matcher: Matcher;
    callback: (response: Response, url: string) => void;
  }>;
  mocks: Array<{
    matcher: Matcher;
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>;
  }>;
}

const KEY = "__GG_KIT_HTTP__";
const API_VERSION = 1;

function matches(matcher: Matcher, url: string, init?: RequestInit): boolean {
  if (typeof matcher === "string") return url.includes(matcher);
  if (matcher instanceof RegExp) return matcher.test(url);
  return matcher(url, init);
}

function hooks(): FetchHooks | null {
  const win = pageWindow() as unknown as Record<string, FetchHooks | undefined>;
  if (win[KEY]) {
    if (win[KEY]!.apiVersion !== API_VERSION) {
      console.warn(
        `[gg-kit] shared HTTP hook version mismatch (${win[KEY]!.apiVersion} vs ${API_VERSION})`,
      );
    }
    return win[KEY]!;
  }
  const target = pageWindow() as unknown as Window & typeof globalThis;
  if (typeof target.fetch !== "function") return null;
  const state: FetchHooks = {
    installed: false,
    apiVersion: API_VERSION,
    responseListeners: [],
    mocks: [],
  };
  const original = target.fetch;
  target.fetch = async function (
    this: Window & typeof globalThis,
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    for (const mock of state.mocks) {
      if (matches(mock.matcher, url, init)) return mock.handler(url, init);
    }
    const response = await Reflect.apply(original, this, [input, init]);
    for (const listener of state.responseListeners) {
      if (!matches(listener.matcher, url, init)) continue;
      try {
        listener.callback(response.clone(), url);
      } catch (error) {
        console.warn("[gg-kit] fetch listener failed", error);
      }
    }
    return response;
  } as typeof target.fetch;
  state.installed = true;
  win[KEY] = state;
  return state;
}

export function onFetchResponse(
  matcher: Matcher,
  callback: (response: Response, url: string) => void,
): () => void {
  const state = hooks();
  if (!state) return () => {};
  const entry = { matcher, callback };
  state.responseListeners.push(entry);
  return () => {
    const index = state.responseListeners.indexOf(entry);
    if (index >= 0) state.responseListeners.splice(index, 1);
  };
}

export function mockFetch(
  matcher: Matcher,
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): () => void {
  const state = hooks();
  if (!state) return () => {};
  const entry = { matcher, handler };
  state.mocks.push(entry);
  return () => {
    const index = state.mocks.indexOf(entry);
    if (index >= 0) state.mocks.splice(index, 1);
  };
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T = unknown>(
  url: string,
  options: RequestInit & { retries?: number } = {},
): Promise<T> {
  const { retries = 2, ...init } = options;
  let attempt = 0;
  for (;;) {
    try {
      const response = await pageWindow().fetch(url, { credentials: "include", ...init });
      if (response.status === 429 && attempt < retries) {
        const retryAfter = Number(response.headers.get("retry-after")) * 1000;
        attempt++;
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10000 * attempt);
        continue;
      }
      if (!response.ok) throw new HttpError(response.status, url);
      return (await response.json()) as T;
    } catch (error) {
      if (
        error instanceof HttpError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        throw error;
      }
      if (attempt >= retries) throw error;
      attempt++;
      await sleep(1000 * attempt);
    }
  }
}

export interface FeedEntry {
  time?: string;
  type?: number;
  payload?: string | Record<string, unknown> | Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface FeedPage {
  entries?: FeedEntry[];
  paginationToken?: string | null;
}

export async function feedPage(paginationToken?: string | null, count?: number): Promise<FeedPage> {
  const params = new URLSearchParams();
  if (paginationToken) params.set("paginationToken", paginationToken);
  if (count) params.set("count", String(count));
  const query = params.toString();
  return fetchJson<FeedPage>(query ? `${API.feed}?${query}` : API.feed);
}

export async function duel<T = unknown>(gameId: string): Promise<T> {
  return fetchJson<T>(`${API.duelServer}${encodeURIComponent(gameId)}`);
}

export async function profile<T = unknown>(): Promise<T> {
  return fetchJson<T>(API.profiles);
}

export async function user<T = unknown>(userId: string): Promise<T> {
  return fetchJson<T>(`${API.users}${encodeURIComponent(userId)}`);
}
