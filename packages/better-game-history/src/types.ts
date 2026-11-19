export type GraphMetric = "ratingAfter" | "avgScore" | "mmi" | "avgTime" | "gameCount";
export type GraphTimeframe = "24h" | "7d" | "30d" | "All";
export type GraphType = "Ranked" | "Unranked" | "All";
export type GraphMode = "NMPZ" | "NM" | "Moving" | "All";
export type CandleMode = "none" | "hourly" | "daily" | "monthly";

export type HydrationState = "pending" | "ok" | "unavailable" | "error";

export interface HydrationMeta {
  state: HydrationState;
  attempts: number;
  lastError?: string;
  fetchedAt?: string;
}

export interface GameRecord {
  gameId: string;
  userId: string;
  time: string;
  modeKey: string;
  mode: string;
  isRated: boolean;
  isTeamDuel: boolean;
  opponent?: string;
  opponentId?: string;
  win?: boolean;
  ratingBefore?: number;
  ratingAfter?: number;
  gameModeRatingAfter?: number;
  ratingChange?: number;
  mmi?: number | null;
  avgScore?: number | null;
  avgTime?: number | null;
  hydration: HydrationMeta;
  updatedAt: string;
  source: "feed" | "websocket" | "hydration";
}

export interface GameDetails {
  opponent?: string;
  opponentId?: string;
  win?: boolean;
  modeKey?: string;
  mode?: string;
  isRated?: boolean;
  isTeamDuel?: boolean;
  ratingBefore?: number;
  ratingAfter?: number;
  gameModeRatingAfter?: number;
  ratingChange?: number;
  mmi?: number | null;
  avgScore?: number | null;
  avgTime?: number | null;
}

export type HydrationResult =
  | { status: "ok"; details: GameDetails }
  | { status: "unavailable"; reason: string }
  | { status: "retry"; error: string };

export interface GraphFilters {
  timeframe: GraphTimeframe;
  metric: GraphMetric;
  typeFilter: GraphType;
  modeFilter: GraphMode;
  showTrend: boolean;
  candleMode: CandleMode;
}

export interface GraphPoint {
  time: string;
  label: string;
  hourlyKey: string;
  dailyKey: string;
  monthlyKey: string;
  value: number;
  opponent: string;
  mode: string;
  gameId: string;
  isTeamDuel: boolean;
}

export interface CandleGroup {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  count: number;
  values: number[];
}
