import { type CustomControlContext, injectStyle, onJsonMessage, startUserscript } from "gg-kit";
import { DEFAULT_SOUND } from "./assets/default-sound.js";
import { type MatchNotifierConfig, matchNotifierConfig } from "./config.js";

declare const __MATCH_NOTIFIER_VERSION__: string;

function playAlert(force = false): void {
  const config = matchNotifierConfig;
  if (!config.get("enabled")) return;
  const onlyWhenUnfocused = config.get("onlyWhenUnfocused");
  if (
    !force &&
    onlyWhenUnfocused &&
    document.visibilityState === "visible" &&
    document.hasFocus()
  ) {
    return;
  }
  const source = config.get("sound") || DEFAULT_SOUND;
  if (!source) {
    console.warn("[match-notifier] no alert sound configured");
    return;
  }
  const audio = new Audio(source);
  audio.volume = config.get("volume");
  audio.play().catch((error) => console.error("[match-notifier] playback failed", error));
}

function soundControl(context: CustomControlContext<MatchNotifierConfig>): () => void {
  const wrap = document.createElement("div");
  wrap.className = "gg-alert-sound";
  const status = document.createElement("span");
  status.className = "gg-alert-soundStatus";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "audio/*";
  file.hidden = true;
  const upload = context.button("Upload");
  const test = context.button("Test");
  const reset = context.button("Reset");
  wrap.append(status, upload, test, reset, file);
  context.root.append(wrap);

  const sync = () => {
    status.textContent = context.config.get("sound") ? "Custom sound" : "Embedded default";
  };
  const unsubscribe = context.config.subscribe(sync, ["sound"]);
  sync();

  upload.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const selected = file.files?.[0];
    if (!selected) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) return;
      context.config.set("sound", result);
      context.config.flush();
      status.textContent = context.config.lastError ? "Could not save sound" : "Custom sound";
    };
    reader.readAsDataURL(selected);
    file.value = "";
  });
  test.addEventListener("click", () => playAlert(true));
  reset.addEventListener("click", () => {
    context.config.set("sound", null);
    context.config.flush();
    sync();
  });

  return () => {
    unsubscribe();
    wrap.remove();
  };
}

injectStyle(
  "gg-alert-style",
  `
  .gg-alert-sound { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .gg-alert-soundStatus { min-width: 110px; opacity: .7; font: 400 11px/1.2 var(--default-font, sans-serif); }
`,
);

startUserscript<MatchNotifierConfig>({
  name: "match-notifier",
  version: __MATCH_NOTIFIER_VERSION__,
  config: matchNotifierConfig,
  topFrameOnly: true,
  cleanupKeys: ["gg_alert_volume", "gg_alert_sound_data", "gg_alert_new_round_enabled"],
  settings: {
    id: "match-notifier",
    title: "Match Notifier",
    shortTitle: "Match Notifier",
    order: 20,
    config: matchNotifierConfig,
    sections: [
      { id: "general", title: "General", fields: ["enabled"] },
      {
        id: "alerts",
        title: "Alerts",
        fields: ["alertOnDuelStart", "alertOnNewRound", "onlyWhenUnfocused"],
      },
      { id: "audio", title: "Audio", fields: ["volume", "sound"] },
    ],
    controls: { "sound-file": soundControl },
  },
  setup(context) {
    let lastCode = "";
    const unsubscribe = onJsonMessage((data) => {
      const code = typeof data.code === "string" ? data.code : "";
      if (!code) return;
      if (code === "DuelStarted" && lastCode !== "DuelStarted") playAlert();
      if (
        matchNotifierConfig.get("alertOnNewRound") &&
        (code === "DuelNewRound" || code === "RoundStarted")
      ) {
        playAlert();
      }
      lastCode = code;
    });
    context.onCleanup(unsubscribe);
    context.log("initialized");
  },
});
