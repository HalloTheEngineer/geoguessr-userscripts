import { duel, HttpError, user } from "gg-kit";
import { formatModeName, toFiniteNumber } from "./format.js";
import type { GameDetails, HydrationResult } from "./types.js";

interface DuelPlayer {
  playerId?: string;
  nick?: string;
  guesses?: Array<{ score?: number }>;
  progressChange?: {
    rankedSystemProgress?: {
      ratingBefore?: number;
      ratingAfter?: number;
      ratingChange?: number;
      gameModeRatingAfter?: number;
      gameMode?: string;
    };
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

interface UserProfile {
  nick?: string;
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

async function opponentNames(team: DuelTeam, signal?: AbortSignal): Promise<string[]> {
  const names = await Promise.all(
    (team.players || []).map(async (player) => {
      if (typeof player.nick === "string" && player.nick && player.nick !== "undefined") {
        return player.nick;
      }
      if (!player.playerId) return null;
      try {
        abortIfNeeded(signal);
        const profile = await user<UserProfile>(player.playerId);
        abortIfNeeded(signal);
        return typeof profile.nick === "string" && profile.nick && profile.nick !== "undefined"
          ? profile.nick
          : null;
      } catch (error) {
        if (isAbortError(error)) throw error;
        if (isHttpError(error) && error.status === 404) return "Deleted User";
        return null;
      }
    }),
  );
  return names.filter((name): name is string => !!name);
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

    const names = await opponentNames(opponentTeam, signal);
    const opponent = names.join(" & ") || "Unknown Opponent";
    const opponentId = (opponentTeam.players || []).find((player) => player.playerId)?.playerId;

    const progress = me.progressChange?.rankedSystemProgress;
    const ratingBefore = toFiniteNumber(progress?.ratingBefore) ?? undefined;
    const ratingAfter = toFiniteNumber(progress?.ratingAfter) ?? undefined;
    const derivedChange =
      ratingBefore !== undefined && ratingAfter !== undefined
        ? ratingAfter - ratingBefore
        : undefined;
    const ratingChange =
      toFiniteNumber(progress?.ratingChange) ?? toFiniteNumber(derivedChange) ?? undefined;
    const gameModeRatingAfter = toFiniteNumber(progress?.gameModeRatingAfter) ?? undefined;
    const isRated = data.options?.isRated !== false;
    const modeKey =
      progress?.gameMode || data.options?.competitiveGameMode || data.options?.gameMode || "Moving";

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
      win,
      modeKey,
      mode: formatModeName(modeKey, isRated),
      isRated,
      isTeamDuel: teams.some((team) => (team.players || []).length > 1),
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
