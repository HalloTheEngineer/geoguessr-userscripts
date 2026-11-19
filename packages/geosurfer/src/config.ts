import { defineConfig } from "gg-kit";

export interface GeosurferConfig {
  enabled: boolean;
  showOverlay: boolean;
  playOnlyVisible: boolean;
  muted: boolean;
}

export const geosurferConfig = defineConfig<GeosurferConfig>({
  key: "gg.geosurfer.config",
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
    showOverlay: {
      type: "boolean",
      default: true,
      label: "Show the video overlay",
      hint: "Requires the in-game stats panel.",
      section: "general",
      order: 1,
    },
    playOnlyVisible: {
      type: "boolean",
      default: true,
      label: "Play only while visible",
      hint: "Pauses playback when the overlay or tab is hidden.",
      section: "playback",
      order: 10,
    },
    muted: {
      type: "boolean",
      default: true,
      label: "Mute playback",
      section: "playback",
      order: 11,
    },
  },
});
