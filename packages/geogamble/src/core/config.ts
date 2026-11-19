import { CONFIG } from "./constants.js";
import { COUNTRY_DATA } from "./countries.generated.js";
import { buildCountryIndex } from "./countries.js";
import { clamp } from "./geo.js";

export const ACTIVATION_KEYS = ["none", "shift", "alt", "ctrl", "meta"];
export function filterCountryOptions(
  data: any[],
  query: unknown,
  { limit = 8, exclude = [] }: { limit?: number; exclude?: string[] } = {},
) {
  if (!Array.isArray(data) || !data.length) return [];
  const text = String(query ?? "")
    .trim()
    .toLowerCase();
  const excluded = new Set(exclude.map((iso) => String(iso).toLowerCase()));
  const results = [];
  for (const country of data) {
    if (excluded.has(country.iso)) continue;
    const name = String(country.name || "").toLowerCase();
    const iso = String(country.iso || "").toLowerCase();
    const exact = text.length === 0 || name === text || iso === text;
    const match = text.length === 0 || name.includes(text) || iso.includes(text);
    if (!match) continue;
    results.push({ country, exact });
    if (results.length >= limit * 2) break;
  }
  const seen = new Set();
  const options = [];
  for (const { country, exact } of results) {
    if (seen.has(country.iso)) continue;
    seen.add(country.iso);
    options.push({ iso: country.iso, name: country.name, exact });
  }
  options.sort((a, b) => Number(b.exact) - Number(a.exact) || a.name.localeCompare(b.name));
  return options.slice(0, Math.max(1, limit));
}

export function resolveConfig(config: any = CONFIG, data: any = COUNTRY_DATA) {
  const animationMs = clamp(Number(config.animationMs) || 2800, 200, 10000);
  const centerBias = clamp(Number(config.centerBias) || 0, 0, 1);
  const startIntervalMs = clamp(Number(config.startIntervalMs) || 45, 10, 1000);
  const endIntervalMs = clamp(Number(config.endIntervalMs) || 320, startIntervalMs, 3000);
  const finalHoldMs = clamp(Number(config.finalHoldMs) || 0, 0, 3000);
  const volume = clamp(Number(config.volume) || 0, 0, 1);
  const activationKey = ACTIVATION_KEYS.includes(config.activationKey)
    ? config.activationKey
    : "none";
  const settings = {
    enabled: config.enabled !== false,
    enabledCountries: config.enabledCountries ?? "all",
    excludeCountries: Array.isArray(config.excludeCountries) ? config.excludeCountries : [],
    animationMs,
    startIntervalMs,
    endIntervalMs,
    finalHoldMs,
    sound: config.sound !== false,
    volume,
    autoSubmit: config.autoSubmit === true,
    submitDelayMs: clamp(
      Number.isFinite(Number(config.submitDelayMs)) ? Number(config.submitDelayMs) : 250,
      0,
      5000,
    ),
    duelSubmitPin: config.duelSubmitPin !== false && config.duelSubmitPin !== 0,
    duelSubmitHop: config.duelSubmitHop === true,
    activationKey,
    allowOtherModes: config.allowOtherModes !== false,
    perfTweaks: config.perfTweaks !== false,
    centerBias,
    heatmapOverlay: config.heatmapOverlay === true,
    debug: config.debug === true,
  };
  const index = buildCountryIndex(data, settings);
  return { settings, index };
}
