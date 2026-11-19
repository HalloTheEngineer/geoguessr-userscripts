import { defineConfig } from "gg-kit";

export interface AdblockerConfig {
  enabled: boolean;
  blockAdsAndAnalytics: boolean;
  cleanupHome: boolean;
  cleanupInGame: boolean;
  cleanupMultiplayer: boolean;
  homepageDuelShortcuts: boolean;
  debug: boolean;
}

export const adblockerConfig = defineConfig<AdblockerConfig>({
  key: "gg.adblocker.config",
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
    blockAdsAndAnalytics: {
      type: "boolean",
      default: true,
      label: "Block ads and analytics",
      hint: "Controls DOM cleanup. Manager-level @webRequest rules remain active while installed.",
      section: "ads",
      order: 10,
    },
    cleanupHome: {
      type: "boolean",
      default: true,
      label: "Clean the home page",
      section: "ui",
      order: 20,
    },
    cleanupInGame: {
      type: "boolean",
      default: true,
      label: "Clean in-game UI",
      section: "ui",
      order: 21,
    },
    cleanupMultiplayer: {
      type: "boolean",
      default: true,
      label: "Clean multiplayer UI",
      section: "ui",
      order: 22,
    },
    homepageDuelShortcuts: {
      type: "boolean",
      default: true,
      label: "Show duel shortcuts on the home page",
      section: "ui",
      order: 23,
    },
    debug: {
      type: "boolean",
      default: false,
      label: "Debug logging",
      section: "advanced",
      order: 30,
    },
  },
});
