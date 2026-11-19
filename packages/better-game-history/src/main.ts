import {
  API,
  gameId,
  mockFetch,
  onDomChange,
  onJsonMessage,
  pageKind,
  pageWindow,
  startUserscript,
  waitForBody,
  waitForCurrentUserId,
} from "gg-kit";
import { betterGameHistoryConfig } from "./config.js";
import { createDrawerView } from "./drawer-view.js";
import { syncFeed } from "./feed-sync.js";
import { formatModeName, sleep, toFiniteNumber } from "./format.js";
import { createGraphView } from "./graph-view.js";
import { createHistoryRepository } from "./history-store.js";
import { hydrateGameDetails } from "./hydration.js";
import { createNameStore } from "./names.js";
import type { GameRecord, GraphFilters } from "./types.js";

declare const __BGH_VERSION__: string;

const config = betterGameHistoryConfig;
const OLD_KEYS = [
  "gg.persistent-game-summary.config",
  "gg.persistent-game-summary.history",
  "geoguessr_game_history_db",
  "geoguessr_last_duel_id",
];

interface WsPlayer {
  playerId?: string;
  nick?: string;
  progressChange?: {
    rankedSystemProgress?: WsProgress;
    rankedTeamDuelsProgress?: WsProgress;
    competitiveProgress?: WsProgress;
  };
}

interface WsProgress {
  ratingBefore?: number;
  ratingAfter?: number;
  ratingChange?: number;
  gameModeRatingAfter?: number;
  gameMode?: string;
}

interface WsTeam {
  id?: string;
  players?: WsPlayer[];
}

interface WsFinished {
  code?: string;
  gameId?: string;
  duel?: {
    state?: {
      teams?: WsTeam[];
      options?: {
        isRated?: boolean;
        competitiveGameMode?: string;
        gameMode?: string;
      };
      result?: { winningTeamId?: string };
    };
  };
}

function filtersFromConfig(): GraphFilters {
  return {
    timeframe: config.get("defaultTimeframe"),
    metric: config.get("defaultMetric"),
    typeFilter: config.get("defaultTypeFilter"),
    modeFilter: config.get("defaultModeFilter"),
    queue: config.get("defaultQueue"),
    teamKey: "",
    showTrend: config.get("defaultShowTrend"),
    candleMode: config.get("defaultCandleMode"),
  };
}

function isInGame(pathname = location.pathname): boolean {
  const kind = pageKind(pathname);
  return kind === "game" || kind === "duel" || kind === "team-duel";
}

startUserscript({
  name: "better-game-history",
  version: __BGH_VERSION__,
  config,
  topFrameOnly: true,
  cleanupKeys: OLD_KEYS,
  settings: {
    id: "better-game-history",
    title: "Better Game History",
    shortTitle: "Game History",
    order: 30,
    config,
    sections: [
      { id: "general", title: "General", fields: ["enabled", "showDrawer"] },
      { id: "history", title: "History", fields: ["historyLimit", "rankedTargetPerQueue"] },
      {
        id: "graph",
        title: "Graph defaults",
        fields: [
          "defaultMetric",
          "defaultTimeframe",
          "defaultTypeFilter",
          "defaultModeFilter",
          "defaultQueue",
          "defaultShowTrend",
          "defaultCandleMode",
        ],
      },
    ],
  },
  setup(context) {
    const repository = createHistoryRepository();
    const names = createNameStore();
    const graph = createGraphView({
      nameFor: names.nameFor,
      resolveNames: (playerIds) => names.resolve(playerIds),
    });
    const drawer = createDrawerView({
      nameFor: names.nameFor,
      onGraph: () => openGraph(),
      onOpenGame: (record) => {
        pageWindow().open(
          `/${record.isTeamDuel ? "team-duels" : "duels"}/${record.gameId}/summary`,
          "_blank",
        );
      },
    });

    let disposed = false;
    let userId: string | null = null;
    let accountRequest = 0;
    let accountWaiting = false;
    let workGeneration = 0;
    let workAbort: AbortController | null = null;
    let hydrationRunning = false;
    let historyRevision = 0;
    let lastRenderSignature = "";
    let renderScheduled = false;
    let renderFrame: number | null = null;

    const limit = () => Math.max(1, Math.floor(config.get("historyLimit")));

    function recordNames(details: {
      opponentId?: string;
      opponent?: string;
      teamPlayerIds?: string[];
      teamPlayerNicks?: string[];
    }): void {
      details.teamPlayerIds?.forEach((playerId, index) => {
        names.record(playerId, details.teamPlayerNicks?.[index]);
      });
      if (details.opponentId && details.opponent && !details.opponent.includes(" & ")) {
        names.record(details.opponentId, details.opponent);
      }
    }

    function stopWork(): void {
      workGeneration++;
      workAbort?.abort();
      workAbort = null;
      hydrationRunning = false;
    }

    function records(): GameRecord[] {
      return userId ? repository.get(userId, limit()) : [];
    }

    function renderNow(): void {
      if (disposed) return;
      const visible = !!userId && config.get("enabled") && config.get("showDrawer") && !isInGame();
      if (visible && !document.body) return;
      const signature = `${visible}|${userId || ""}|${historyRevision}|${gameId() || ""}`;
      if (signature === lastRenderSignature) return;
      lastRenderSignature = signature;
      drawer.setVisible(visible);
      if (visible) drawer.render(records(), gameId());
      graph.refresh(records());
    }

    function scheduleRender(): void {
      if (renderScheduled || disposed) return;
      renderScheduled = true;
      const run = () => {
        renderScheduled = false;
        renderFrame = null;
        renderNow();
      };
      if (typeof requestAnimationFrame === "function") {
        renderFrame = requestAnimationFrame(run);
      } else {
        renderFrame = setTimeout(run, 0) as unknown as number;
      }
    }

    function openGraph(): void {
      if (!config.get("enabled") || !userId) return;
      graph.open(records(), filtersFromConfig());
    }

    function startHydration(generation = workGeneration, signal = workAbort?.signal): void {
      if (hydrationRunning || !userId || !config.get("enabled") || isInGame() || signal?.aborted)
        return;
      const id = userId;
      hydrationRunning = true;
      void (async () => {
        try {
          while (generation === workGeneration && !signal?.aborted && config.get("enabled")) {
            const pending = repository.pending(id).filter((item) => item.hydration.attempts < 4);
            const record = pending.find((item) => item.isRated) || pending[0];
            if (!record) break;
            const result = await hydrateGameDetails(record.gameId, id, signal);
            if (generation !== workGeneration || signal?.aborted) break;
            const attempts = record.hydration.attempts + 1;
            const now = new Date().toISOString();
            if (result.status === "ok") {
              recordNames(result.details);
              repository.merge(
                {
                  ...record,
                  ...result.details,
                  hydration: { state: "ok", attempts, fetchedAt: now },
                  updatedAt: now,
                  source: "hydration",
                },
                limit(),
              );
            } else {
              repository.merge(
                {
                  ...record,
                  hydration: {
                    state: result.status === "unavailable" ? "unavailable" : "error",
                    attempts,
                    lastError: result.status === "unavailable" ? result.reason : result.error,
                    fetchedAt: now,
                  },
                  updatedAt: now,
                },
                limit(),
              );
            }
            scheduleRender();
            await sleep(150, signal);
          }
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            context.log("hydration stopped", error);
          }
        } finally {
          if (generation === workGeneration) hydrationRunning = false;
        }
      })();
    }

    function startWork(): void {
      if (!userId || !config.get("enabled") || disposed || isInGame()) return;
      stopWork();
      const generation = workGeneration;
      const controller = new AbortController();
      workAbort = controller;
      const id = userId;
      void (async () => {
        try {
          const result = await syncFeed({
            userId: id,
            repository,
            limit: limit(),
            targetPerQueue: config.get("rankedTargetPerQueue"),
            signal: controller.signal,
            onUpdate: () => {
              if (generation !== workGeneration) return;
              scheduleRender();
              startHydration(generation, controller.signal);
            },
          });
          const feedStatus = result.targetReached
            ? "both targets reached"
            : result.exhausted
              ? "feed exhausted"
              : result.stopReason;
          context.log(
            `feed sync added ${result.added} ranked games across ${result.pages} page(s); solo ${result.solo}/${result.target}, team ${result.team}/${result.target}; ${feedStatus}; skipped ${result.ignoredUnranked} unranked entries`,
          );
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            context.log("feed sync stopped", error);
          }
        } finally {
          if (generation === workGeneration && !controller.signal.aborted) {
            startHydration(generation, controller.signal);
          }
        }
      })();
      startHydration(generation, controller.signal);
    }

    async function refreshAccount(force = false, timeoutMs = 15_000): Promise<void> {
      if (!force && (userId || accountWaiting)) return;
      if (!force) accountWaiting = true;
      try {
        const request = ++accountRequest;
        const id = await waitForCurrentUserId({ timeoutMs });
        if (disposed || request !== accountRequest || !id) {
          renderNow();
          return;
        }
        if (id !== userId) {
          userId = id;
          stopWork();
          renderNow();
          if (!isInGame()) startWork();
          return;
        }
        renderNow();
      } finally {
        if (!force) accountWaiting = false;
      }
    }

    const offNetwork = mockFetch(
      (url, init) =>
        url.includes(API.duelOngoing) && String(init?.method || "GET").toUpperCase() === "DELETE",
      () => new Response(null, { status: 204 }),
    );
    context.onCleanup(offNetwork);

    const offWs = onJsonMessage((raw) => {
      if (!config.get("enabled") || !userId) return;
      const data = raw as unknown as WsFinished;
      if (data.code !== "DuelFinished" || typeof data.gameId !== "string") return;
      const state = data.duel?.state;
      const teams = state?.teams || [];
      if (teams.length < 2) return;
      const myTeam = teams.find((team) =>
        (team.players || []).some((player) => player.playerId === userId),
      );
      const me = myTeam?.players?.find((player) => player.playerId === userId);
      if (!myTeam || !me) return;
      const opponentTeam = teams.find((team) => team !== myTeam);
      if (!opponentTeam) return;
      const opponent = opponentTeam.players?.[0];
      const isTeamDuel = teams.some((team) => (team.players || []).length > 1);
      const progress = isTeamDuel
        ? me.progressChange?.rankedTeamDuelsProgress || me.progressChange?.competitiveProgress
        : me.progressChange?.rankedSystemProgress || me.progressChange?.competitiveProgress;
      const myPlayers = myTeam.players || [];
      const teamPlayerIds = myPlayers
        .map((player) => player.playerId)
        .filter((playerId): playerId is string => !!playerId);
      const teamPlayerNicks = myPlayers.map(
        (player) => player.nick || player.playerId || "Unknown",
      );
      const teammateIds = teamPlayerIds.filter((playerId) => playerId !== userId);
      const teammateNicks = myPlayers
        .filter((player) => player.playerId !== userId)
        .map((player) => player.nick || player.playerId || "Unknown");
      const teamKey = teamPlayerIds.length ? [...teamPlayerIds].sort().join(":") : undefined;
      const ratingBefore = toFiniteNumber(progress?.ratingBefore) ?? undefined;
      const ratingAfter = toFiniteNumber(progress?.ratingAfter) ?? undefined;
      const derivedChange =
        ratingBefore !== undefined && ratingAfter !== undefined
          ? ratingAfter - ratingBefore
          : undefined;
      const ratingChange =
        toFiniteNumber(progress?.ratingChange) ?? toFiniteNumber(derivedChange) ?? undefined;
      const isRated = state?.options?.isRated !== false;
      const modeKey =
        progress?.gameMode ||
        state?.options?.competitiveGameMode ||
        state?.options?.gameMode ||
        "Moving";
      const record: GameRecord = {
        gameId: data.gameId,
        userId,
        time: new Date().toISOString(),
        modeKey,
        mode: formatModeName(modeKey, isRated),
        isRated,
        isTeamDuel,
        opponent:
          typeof opponent?.nick === "string" && opponent.nick !== "undefined"
            ? opponent.nick
            : undefined,
        opponentId: opponent?.playerId,
        teamKey,
        teamPlayerIds,
        teamPlayerNicks,
        teammateIds,
        teammateNicks,
        win:
          typeof state?.result?.winningTeamId === "string" && typeof myTeam.id === "string"
            ? state.result.winningTeamId === myTeam.id
            : undefined,
        ratingBefore,
        ratingAfter,
        gameModeRatingAfter: toFiniteNumber(progress?.gameModeRatingAfter) ?? undefined,
        ratingChange,
        hydration: { state: "pending", attempts: 0 },
        updatedAt: new Date().toISOString(),
        source: "websocket",
      };
      recordNames(record);
      repository.merge(record, limit());
      scheduleRender();
      startHydration();
    });
    context.onCleanup(offWs);

    const offDom = onDomChange(() => {
      names.captureVisitedProfile();
      if (!userId) void refreshAccount(false, 1500);
    });
    context.onCleanup(offDom);

    const offHistory = repository.subscribe(() => {
      historyRevision++;
      scheduleRender();
    });
    context.onCleanup(offHistory);

    const offNames = names.subscribe(() => {
      historyRevision++;
      scheduleRender();
      graph.refresh(records());
    });
    context.onCleanup(offNames);

    const offConfig = context.config.subscribe((change) => {
      if (change.key === "enabled") {
        if (change.value) {
          void refreshAccount(true, 1500);
          startWork();
        } else {
          stopWork();
          graph.close();
          renderNow();
        }
      }
      if (change.key === "showDrawer") scheduleRender();
      if (change.key === "historyLimit" && userId) repository.trim(userId, limit());
      scheduleRender();
    });
    context.onCleanup(offConfig);

    const onKeydown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        openGraph();
      }
    };
    pageWindow().addEventListener("keydown", onKeydown);
    context.onCleanup(() => pageWindow().removeEventListener("keydown", onKeydown));

    context.onPageHide(() => repository.flush());

    context.onRoute(() => {
      names.captureVisitedProfile();
      scheduleRender();
      if (isInGame()) stopWork();
      else if (!workAbort && userId && config.get("enabled")) startWork();
      void refreshAccount(true, 1500);
    });
    context.onCleanup(() => {
      disposed = true;
      stopWork();
      if (renderFrame !== null) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(renderFrame);
        else clearTimeout(renderFrame);
        renderFrame = null;
      }
      names.dispose();
      graph.dispose();
      drawer.dispose();
      repository.dispose();
    });

    void waitForBody()
      .then(() => {
        if (disposed) return;
        names.captureVisitedProfile();
        scheduleRender();
        void refreshAccount(true, 15_000);
      })
      .catch((error) => context.log("waitForBody failed", error));
  },
});
