import { defineConfig } from "gg-kit";

export type GraphMetric = "ratingAfter" | "avgScore" | "mmi" | "avgTime" | "gameCount";
export type GraphTimeframe = "24h" | "7d" | "30d" | "All";
export type GraphType = "Ranked" | "Unranked" | "All";
export type GraphMode = "NMPZ" | "NM" | "Moving" | "All";
export type CandleMode = "none" | "hourly" | "daily" | "monthly";

export interface BetterGameHistoryConfig {
  enabled: boolean;
  showDrawer: boolean;
  historyLimit: number;
  feedWindowDays: number;
  defaultMetric: GraphMetric;
  defaultTimeframe: GraphTimeframe;
  defaultTypeFilter: GraphType;
  defaultModeFilter: GraphMode;
  defaultShowTrend: boolean;
  defaultCandleMode: CandleMode;
}

export const betterGameHistoryConfig = defineConfig<BetterGameHistoryConfig>({
  key: "gg.better-game-history.config",
  version: 1,
  write: "diff",
  fields: {
    enabled: {
      type: "boolean",
      default: true,
      label: "Enabled",
      section: "general",
      order: 0,
    },
    showDrawer: {
      type: "boolean",
      default: true,
      label: "Show the history drawer",
      hint: "Press Alt+G to open the graph while the drawer is hidden.",
      section: "general",
      order: 1,
    },
    historyLimit: {
      type: "number",
      default: 2000,
      min: 100,
      max: 5000,
      step: 100,
      label: "Maximum stored games",
      section: "history",
      order: 10,
    },
    feedWindowDays: {
      type: "number",
      default: 30,
      min: 1,
      max: 365,
      step: 1,
      label: "Feed import window (days)",
      section: "history",
      order: 11,
    },
    defaultMetric: {
      type: "select",
      default: "ratingAfter",
      label: "Default graph metric",
      section: "graph",
      order: 20,
      options: [
        { value: "ratingAfter", label: "Rating" },
        { value: "avgScore", label: "Score" },
        { value: "mmi", label: "Merchant index" },
        { value: "avgTime", label: "Time" },
        { value: "gameCount", label: "Games" },
      ],
    },
    defaultTimeframe: {
      type: "select",
      default: "7d",
      label: "Default timeframe",
      section: "graph",
      order: 21,
      options: [
        { value: "24h", label: "24 hours" },
        { value: "7d", label: "Week" },
        { value: "30d", label: "Month" },
        { value: "All", label: "All" },
      ],
    },
    defaultTypeFilter: {
      type: "select",
      default: "Ranked",
      label: "Default ranked filter",
      section: "graph",
      order: 22,
      options: [
        { value: "Ranked", label: "Ranked" },
        { value: "Unranked", label: "Unranked" },
        { value: "All", label: "All" },
      ],
    },
    defaultModeFilter: {
      type: "select",
      default: "All",
      label: "Default mode filter",
      section: "graph",
      order: 23,
      options: [
        { value: "NMPZ", label: "NMPZ" },
        { value: "NM", label: "No move" },
        { value: "Moving", label: "Moving" },
        { value: "All", label: "All" },
      ],
    },
    defaultShowTrend: {
      type: "boolean",
      default: false,
      label: "Show trend line by default",
      section: "graph",
      order: 24,
    },
    defaultCandleMode: {
      type: "select",
      default: "none",
      label: "Default view",
      section: "graph",
      order: 25,
      options: [
        { value: "none", label: "Points" },
        { value: "hourly", label: "Hourly candles" },
        { value: "daily", label: "Daily candles" },
        { value: "monthly", label: "Monthly candles" },
      ],
    },
  },
});
