import { duel, HttpError } from "gg-kit";
import { formatModeName, toFiniteNumber } from "./format.js";
import type { GameDetails, HydrationResult } from "./types.js";

interface DuelProgress {
  ratingBefore?: number;
  ratingAfter?: number;
  ratingChange?: number;
  gameModeRatingAfter?: number;
  gameMode?: string;
}

interface DuelPlayer {
  playerId?: string;
  nick?: string;
  guesses?: Array<{ score?: number }>;
  progressChange?: {
    rankedSystemProgress?: DuelProgress;
    rankedTeamDuelsProgress?: DuelProgress;
    competitiveProgress?: DuelProgress;
  };
}

interface DuelTeam {
  id?: string;
  players?: DuelPlayer[];
  roundResults?: Array<{ damageDealt?: number; multiplier?: number }>;
}

interface DuelRound {
  startTime?: string;
  endTime?: string;
}

interface DuelResponse {
  teams?: DuelTeam[];
  rounds?: DuelRound[];
  currentRoundNumber?: number;
  options?: {
    isRated?: boolean;
    competitiveGameMode?: string;
    gameMode?: string;
  };
  result?: { winningTeamId?: string };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

function weightedMultiplier(
  rounds: Array<{ damageDealt?: number; multiplier?: number }>,
): number | null {
  let totalDamage = 0;
  let weightedDamage = 0;
  for (const round of rounds) {
    const damage = toFiniteNumber(round.damageDealt);
    if (damage === null || damage <= 0) continue;
    const multiplier = toFiniteNumber(round.multiplier) ?? 1;
    totalDamage += damage;
    weightedDamage += damage * multiplier;
  }
  return totalDamage > 0 ? weightedDamage / totalDamage : null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export async function hydrateGameDetails(
  gameId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<HydrationResult> {
  try {
    abortIfNeeded(signal);
    const data = await duel<DuelResponse>(gameId);
    abortIfNeeded(signal);

    const teams = data.teams || [];
    if (teams.length < 2) return { status: "retry", error: "duel has incomplete teams" };

    const myTeam = teams.find((team) =>
      (team.players || []).some((player) => player.playerId === userId),
    );
    const me = myTeam?.players?.find((player) => player.playerId === userId);
    if (!myTeam || !me) return { status: "retry", error: "current player was not found" };

    const opponentTeam = teams.find((team) => team !== myTeam);
    if (!opponentTeam) return { status: "retry", error: "opponent team was not found" };

    const isTeamDuel = teams.some((team) => (team.players || []).length > 1);
    const isRated = data.options?.isRated !== false;
    const progress = isTeamDuel
      ? me.progressChange?.rankedTeamDuelsProgress || me.progressChange?.competitiveProgress
      : me.progressChange?.rankedSystemProgress || me.progressChange?.competitiveProgress;
    const ratingBefore = toFiniteNumber(progress?.ratingBefore) ?? undefined;
    const ratingAfter = toFiniteNumber(progress?.ratingAfter) ?? undefined;
    const derivedChange =
      ratingBefore !== undefined && ratingAfter !== undefined
        ? ratingAfter - ratingBefore
        : undefined;
    const ratingChange =
      toFiniteNumber(progress?.ratingChange) ?? toFiniteNumber(derivedChange) ?? undefined;
    const gameModeRatingAfter = isTeamDuel
      ? undefined
      : (toFiniteNumber(progress?.gameModeRatingAfter) ?? undefined);
    const modeKey =
      data.options?.competitiveGameMode ||
      data.options?.gameMode ||
      progress?.gameMode ||
      (isTeamDuel ? "TeamDuels" : "Duels");

    const myPlayers = myTeam.players || [];
    const teamPlayerIds = myPlayers
      .map((player) => player.playerId)
      .filter((playerId): playerId is string => !!playerId);
    const teamPlayerNicks = myPlayers.map((player) => player.nick || player.playerId || "Unknown");
    const teammateIds = teamPlayerIds.filter((playerId) => playerId !== userId);
    const teammateNicks = myPlayers
      .filter((player) => player.playerId !== userId)
      .map((player) => player.nick || player.playerId || "Unknown");
    const teamKey = teamPlayerIds.length ? [...teamPlayerIds].sort().join(":") : undefined;

    const opponentNames = (opponentTeam.players || []).map(
      (player) => player.nick || player.playerId || "Unknown",
    );
    const opponent =
      opponentNames.filter((name) => name !== "Unknown").join(" & ") || "Unknown Opponent";
    const opponentId = (opponentTeam.players || []).find((player) => player.playerId)?.playerId;

    const scores = (me.guesses || [])
      .map((guess) => toFiniteNumber(guess.score))
      .filter((score): score is number => score !== null);
    const avgScore = average(scores);

    const rounds = Array.isArray(data.rounds) ? data.rounds : [];
    const currentRound = toFiniteNumber(data.currentRoundNumber);
    const activeRounds =
      currentRound !== null && currentRound > 0
        ? rounds.slice(0, Math.floor(currentRound))
        : rounds;
    const roundTimes = activeRounds
      .map((round) => {
        if (!round.startTime || !round.endTime) return null;
        const start = new Date(round.startTime).getTime();
        const end = new Date(round.endTime).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
        return (end - start) / 1000;
      })
      .filter((value): value is number => value !== null);
    const avgTime = average(roundTimes);

    const ownMulti = weightedMultiplier(myTeam.roundResults || []);
    const opponentMulti = weightedMultiplier(opponentTeam.roundResults || []);
    const mmi =
      ownMulti !== null && opponentMulti !== null
        ? Number((ownMulti - opponentMulti).toFixed(2))
        : null;

    const winningTeamId = data.result?.winningTeamId;
    const win =
      typeof winningTeamId === "string" && typeof myTeam.id === "string"
        ? winningTeamId === myTeam.id
        : undefined;

    const details: GameDetails = {
      opponent,
      opponentId,
      teamKey,
      teamPlayerIds,
      teamPlayerNicks,
      teammateIds,
      teammateNicks,
      win,
      modeKey,
      mode: formatModeName(modeKey, isRated),
      isRated,
      isTeamDuel,
      ratingBefore,
      ratingAfter,
      gameModeRatingAfter,
      ratingChange,
      mmi,
      avgScore: avgScore === null ? null : Math.round(avgScore),
      avgTime: avgTime === null ? null : Number(avgTime.toFixed(1)),
    };
    return { status: "ok", details };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (isHttpError(error)) {
      if (error.status === 403 || error.status === 404) {
        return { status: "unavailable", reason: `HTTP ${error.status}` };
      }
      if (error.status === 400) return { status: "unavailable", reason: "invalid duel" };
      return { status: "retry", error: error.message };
    }
    return { status: "retry", error: errorMessage(error) };
  }
}
