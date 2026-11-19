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

export function siteBuild(): string | null {
  const data = nextData();
  if (isBuildId(data?.buildId)) return data.buildId;

  if (!hasDom()) return null;

  const win = pageWindow() as unknown as { __NEXT_DATA__?: NextData };
  if (isBuildId(win.__NEXT_DATA__?.buildId)) return win.__NEXT_DATA__!.buildId!;

  for (const script of document.querySelectorAll<HTMLScriptElement>(
    'script[src*="/_next/static/"]',
  )) {
    const match = script.src.match(
      /\/_next\/static\/([^/]+)\/(?:_buildManifest|_ssgManifest|_middlewareManifest|_clientMiddlewareManifest)\.js(?:\?|$)/,
    );
    if (isBuildId(match?.[1])) return match[1];
  }

  return null;
}

export function currentUserId(): string | null {
  const data = nextData();
  const userId = data?.props?.accountProps?.account?.user?.userId || null;
  if (userId) return userId;
  const win = pageWindow() as unknown as { __NEXT_DATA__?: NextData };
  const direct = win.__NEXT_DATA__?.props?.accountProps?.account?.user?.userId;
  return direct || null;
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
    const check = () => {
      const value = currentUserId();
      if (value) {
        finish(value);
        return;
      }
      if (Date.now() >= deadline) finish(null);
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
