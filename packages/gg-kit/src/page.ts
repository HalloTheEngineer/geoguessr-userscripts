import { hasDom, pageWindow } from "./window.js";

export interface NextData {
  buildId?: string;
  props?: {
    accountProps?: { account?: { user?: { userId?: string } } };
    pageProps?: { user?: { userId?: string }; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const RESERVED_STATIC_SEGMENTS = new Set(["chunks", "css", "media", "image", "static", "_next"]);

let cachedNextData: { build: string; value: NextData | null } | null = null;

export function isBuildId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !RESERVED_STATIC_SEGMENTS.has(value.toLowerCase())
  );
}

export function nextData(): NextData | null {
  if (!hasDom()) return null;
  const script = document.getElementById("__NEXT_DATA__");
  const key = script?.textContent?.slice(0, 64) || "";
  if (cachedNextData && cachedNextData.build === key) return cachedNextData.value;
  let value: NextData | null = null;
  try {
    value = JSON.parse(script?.textContent || "null") as NextData | null;
  } catch {
    value = null;
  }
  cachedNextData = { build: key, value };
  return value;
}

export type SiteBuildScheme = "next" | "spa";

export interface SiteBuildInfo {
  build: string;
  scheme: SiteBuildScheme;
}

/**
 * The build fingerprint changed meaning when the site moved off Next.js, so the
 * scheme is reported alongside it. Build ids are only comparable within a scheme.
 */
export function siteBuildInfo(): SiteBuildInfo | null {
  const data = nextData();
  if (isBuildId(data?.buildId)) return { build: data.buildId, scheme: "next" };

  if (!hasDom()) return null;

  const win = pageWindow() as unknown as { __NEXT_DATA__?: NextData };
  if (isBuildId(win.__NEXT_DATA__?.buildId)) {
    return { build: win.__NEXT_DATA__!.buildId!, scheme: "next" };
  }

  for (const script of document.querySelectorAll<HTMLScriptElement>(
    'script[src*="/_next/static/"]',
  )) {
    const match = script.src.match(
      /\/_next\/static\/([^/]+)\/(?:_buildManifest|_ssgManifest|_middlewareManifest|_clientMiddlewareManifest)\.js(?:\?|$)/,
    );
    if (isBuildId(match?.[1])) return { build: match[1], scheme: "next" };
  }

  // The current SPA ships a hashed entry bundle instead of a Next.js build manifest.
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src*="/_start/"]')) {
    const match = script.src.match(/\/index-([A-Za-z0-9_-]{4,})\.js(?:\?|$)/);
    if (isBuildId(match?.[1])) return { build: match[1], scheme: "spa" };
  }

  return null;
}

export function siteBuild(): string | null {
  return siteBuildInfo()?.build ?? null;
}

interface ProfileResponse {
  payload?: { user?: { id?: string; userId?: string } };
  user?: { id?: string; userId?: string };
}

let fetchedUserId: string | null = null;

export function currentUserId(): string | null {
  const data = nextData();
  const userId = data?.props?.accountProps?.account?.user?.userId || null;
  if (userId) return userId;
  const win = pageWindow() as unknown as { __NEXT_DATA__?: NextData };
  const direct = win.__NEXT_DATA__?.props?.accountProps?.account?.user?.userId;
  return direct || fetchedUserId || null;
}

/**
 * Legacy pages exposed the account through __NEXT_DATA__. The current SPA boots from
 * /api/v3/profiles/ instead, so ask the site for the signed-in profile.
 */
export async function fetchCurrentUserId(signal?: AbortSignal): Promise<string | null> {
  if (!hasDom()) return null;
  if (fetchedUserId) return fetchedUserId;
  try {
    const response = await pageWindow().fetch("/api/v3/profiles/", {
      credentials: "include",
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as ProfileResponse | null;
    const user = body?.payload?.user ?? body?.user;
    const id = user?.id || user?.userId;
    if (typeof id !== "string" || !id) return null;
    fetchedUserId = id;
    return id;
  } catch {
    return null;
  }
}

export interface WaitForCurrentUserIdOptions {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

export function waitForCurrentUserId(
  options: WaitForCurrentUserIdOptions = {},
): Promise<string | null> {
  const existing = currentUserId();
  if (existing) return Promise.resolve(existing);
  if (!hasDom()) return Promise.resolve(null);

  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 200;
  return new Promise((resolve) => {
    if (options.signal?.aborted) {
      resolve(null);
      return;
    }
    const deadline = Date.now() + timeoutMs;
    let interval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (value: string | null) => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);
    let fetching = false;
    let lastFetch = 0;
    let fetchAttempts = 0;
    const check = () => {
      const value = currentUserId();
      if (value) {
        finish(value);
        return;
      }
      // A signed-out page answers 401, so stop retrying quickly instead of polling.
      if (!fetching && fetchAttempts < 3 && Date.now() - lastFetch >= 1000) {
        lastFetch = Date.now();
        fetchAttempts++;
        fetching = true;
        void fetchCurrentUserId(options.signal).then((id) => {
          fetching = false;
          if (id) finish(id);
        });
      }
      if (Date.now() >= deadline) finish(currentUserId());
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    interval = setInterval(check, intervalMs);
    timeout = setTimeout(() => finish(currentUserId()), timeoutMs);
    check();
  });
}

export type PageKind =
  | "home"
  | "singleplayer"
  | "game"
  | "duel"
  | "team-duel"
  | "summary"
  | "profile"
  | "settings"
  | "other";

export function pageKind(pathname = location.pathname): PageKind {
  if (pathname === "/" || pathname === "") return "home";
  if (pathname.startsWith("/singleplayer")) return "singleplayer";
  if (pathname.startsWith("/game/")) return "game";
  if (pathname.startsWith("/duels/")) return pathname.endsWith("/summary") ? "summary" : "duel";
  if (pathname.startsWith("/team-duels/"))
    return pathname.endsWith("/summary") ? "summary" : "team-duel";
  if (pathname.startsWith("/me/profile") || pathname.startsWith("/user/")) return "profile";
  if (pathname.startsWith("/me/settings")) return "settings";
  return "other";
}

export function gameId(pathname = location.pathname): string | null {
  const match = pathname.match(/\/(?:game|duels|team-duels|battle-royale)\/([a-zA-Z0-9]+)/);
  return match?.[1] || null;
}

export function isSummaryPage(pathname = location.pathname): boolean {
  return /\/(?:duels|team-duels)\/[^/]+\/summary/.test(pathname);
}

export function isDuelPage(pathname = location.pathname): boolean {
  return /^\/(?:duels|team-duels)\//.test(pathname) && !pathname.endsWith("/summary");
}

export function duelSummaryPath(gameId: string, isTeamDuel = false): string {
  return `/${isTeamDuel ? "team-duels" : "duels"}/${encodeURIComponent(gameId)}/summary`;
}
