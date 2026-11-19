import { defineConfig } from "gg-kit";
import { ACTIVATION_KEYS } from "./core/config.js";
import { CONFIG_DEFAULTS } from "./core/constants.js";

export type CountrySelection = "all" | string[];

export interface GeogambleConfig {
  enabledCountries: CountrySelection;
  excludeCountries: string[];
  animationMs: number;
  startIntervalMs: number;
  endIntervalMs: number;
  finalHoldMs: number;
  sound: boolean;
  volume: number;
  autoSubmit: boolean;
  submitDelayMs: number;
  duelSubmitPin: boolean;
  duelSubmitHop: boolean;
  activationKey: string;
  allowOtherModes: boolean;
  perfTweaks: boolean;
  centerBias: number;
  heatmapOverlay: boolean;
  debug: boolean;
}

const countryList = (value: unknown): CountrySelection | undefined => {
  if (value === "all") return "all";
  if (!Array.isArray(value)) return undefined;
  return [
    ...new Set(
      value.map((item) => String(item).toLowerCase()).filter((item) => /^[a-z]{2}$/.test(item)),
    ),
  ];
};

const excludedList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return [
    ...new Set(
      value.map((item) => String(item).toLowerCase()).filter((item) => /^[a-z]{2}$/.test(item)),
    ),
  ];
};

export const geogambleConfig = defineConfig<GeogambleConfig>({
  key: "gg.geogamble.config",
  version: 1,
  write: "diff",
  fields: {
    enabledCountries: {
      type: "custom",
      control: "country-list",
      default: CONFIG_DEFAULTS.enabledCountries as CountrySelection,
      parse: countryList,
      label: "Enabled countries",
      section: "countries",
      order: 10,
    },
    excludeCountries: {
      type: "custom",
      control: "country-list",
      default: CONFIG_DEFAULTS.excludeCountries,
      parse: excludedList,
      label: "Excluded countries",
      section: "countries",
      order: 11,
    },
    animationMs: {
      type: "number",
      default: CONFIG_DEFAULTS.animationMs,
      min: 200,
      max: 10000,
      step: 100,
      label: "Animation length",
      hint: "Milliseconds the pin shuffles around.",
      section: "gamble",
      order: 20,
    },
    startIntervalMs: {
      type: "number",
      default: CONFIG_DEFAULTS.startIntervalMs,
      hidden: true,
      min: 10,
      max: 1000,
    },
    endIntervalMs: {
      type: "number",
      default: CONFIG_DEFAULTS.endIntervalMs,
      hidden: true,
      min: 10,
      max: 3000,
    },
    finalHoldMs: {
      type: "number",
      default: CONFIG_DEFAULTS.finalHoldMs,
      hidden: true,
      min: 0,
      max: 3000,
    },
    sound: {
      type: "boolean",
      default: CONFIG_DEFAULTS.sound,
      label: "Sound",
      hint: "Ticks and the final chime.",
      section: "audio",
      order: 40,
    },
    volume: {
      type: "range",
      default: CONFIG_DEFAULTS.volume,
      min: 0,
      max: 1,
      step: 0.05,
      label: "Volume",
      section: "audio",
      order: 41,
    },
    autoSubmit: {
      type: "boolean",
      default: CONFIG_DEFAULTS.autoSubmit,
      label: "Auto submit",
      hint: "Click the guess button after the final pin.",
      section: "submit",
      order: 30,
    },
    submitDelayMs: {
      type: "number",
      default: CONFIG_DEFAULTS.submitDelayMs,
      min: 0,
      max: 5000,
      step: 50,
      label: "Submit delay",
      hint: "Milliseconds before auto submit starts.",
      section: "submit",
      order: 31,
    },
    duelSubmitPin: {
      type: "boolean",
      default: CONFIG_DEFAULTS.duelSubmitPin,
      label: "Submit duel plonk",
      hint: "Record the final pin on the duel WebSocket at click time.",
      section: "submit",
      order: 32,
    },
    duelSubmitHop: {
      type: "boolean",
      default: CONFIG_DEFAULTS.duelSubmitHop,
      label: "Submit per hop",
      hint: "Also record every animation hop during duels.",
      section: "submit",
      order: 33,
    },
    activationKey: {
      type: "select",
      default: CONFIG_DEFAULTS.activationKey,
      label: "Activation key",
      hint: "Key held while clicking the map to gamble.",
      section: "gamble",
      order: 21,
      options: ACTIVATION_KEYS.map((key) => ({
        value: key,
        label: key === "none" ? "No key required" : key[0].toUpperCase() + key.slice(1),
      })),
    },
    allowOtherModes: {
      type: "boolean",
      default: CONFIG_DEFAULTS.allowOtherModes,
      label: "Other modes",
      hint: "Attempt map discovery outside standard games.",
      section: "misc",
      order: 50,
    },
    perfTweaks: {
      type: "boolean",
      default: CONFIG_DEFAULTS.perfTweaks,
      label: "Performance tweaks",
      section: "misc",
      order: 51,
    },
    centerBias: {
      type: "range",
      default: CONFIG_DEFAULTS.centerBias,
      min: 0,
      max: 1,
      step: 0.05,
      label: "Center bias",
      hint: "0 = anywhere, higher values concentrate picks around the centre, 1 = exactly the centre.",
      section: "gamble",
      order: 22,
    },
    heatmapOverlay: {
      type: "boolean",
      default: CONFIG_DEFAULTS.heatmapOverlay,
      label: "Center heatmap",
      hint: "Debug overlay showing the active center-bias probability field.",
      section: "misc",
      order: 52,
    },
    debug: {
      type: "boolean",
      default: CONFIG_DEFAULTS.debug,
      label: "Debug logs",
      section: "misc",
      order: 53,
    },
  },
});
