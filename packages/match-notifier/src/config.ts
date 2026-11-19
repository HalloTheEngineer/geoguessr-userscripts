import { defineConfig } from "gg-kit";

export interface MatchNotifierConfig {
  enabled: boolean;
  alertOnDuelStart: boolean;
  alertOnNewRound: boolean;
  onlyWhenUnfocused: boolean;
  volume: number;
  sound: string | null;
}

export const matchNotifierConfig = defineConfig<MatchNotifierConfig>({
  key: "gg.match-notifier.config",
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
    alertOnDuelStart: {
      type: "boolean",
      default: true,
      label: "Alert when a duel starts",
      section: "alerts",
      order: 10,
    },
    alertOnNewRound: {
      type: "boolean",
      default: false,
      label: "Alert on each new round",
      section: "alerts",
      order: 11,
    },
    onlyWhenUnfocused: {
      type: "boolean",
      default: true,
      label: "Only alert when the tab is unfocused",
      hint: "Test playback ignores this setting.",
      section: "alerts",
      order: 12,
    },
    volume: {
      type: "range",
      default: 1,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Alert volume",
      section: "audio",
      order: 20,
    },
    sound: {
      type: "custom",
      control: "sound-file",
      default: null,
      label: "Alert sound",
      hint: "Upload an audio file, or use the embedded default.",
      section: "audio",
      order: 21,
    },
  },
});
