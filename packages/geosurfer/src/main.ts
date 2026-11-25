import { type ConfigChange, injectStyle, onDomChange, startUserscript } from "gg-kit";
import { type GeosurferConfig, geosurferConfig } from "./config.js";

declare const __GEOSURFER_VERSION__: string;
declare const __GEOSURFER_RESOURCE_URL__: string;
declare function GM_getResourceURL(name: string): string;

const ROOT_SELECTOR = '[class*="in-game-stats-overlay_root__"]';
// The current duel overlay renders cards as _cardWrapper_<hash> with no stable root class,
// so the cards' shared parent is used as the container when no legacy root exists.
const CARD_SELECTOR = '[class*="in-game-stats-overlay_cardWrapper__"], [class*="_cardWrapper_"]';
const CARD_ID = "gg-surfer-card";

function resourceUrl(): string {
  try {
    if (typeof GM_getResourceURL === "function") {
      const value = GM_getResourceURL("gg-geosurfer-video");
      if (value) return value;
    }
  } catch (error) {
    console.warn("[geosurfer] could not resolve video resource", error);
  }
  return __GEOSURFER_RESOURCE_URL__;
}

function applyConfig(video: HTMLVideoElement | null): void {
  if (!video) return;
  video.muted = geosurferConfig.get("muted");
}

injectStyle(
  "gg-geosurfer-style",
  `
  #${CARD_ID} { overflow: hidden; }
  .gg-surfer-frame { width: 100%; height: 100%; min-height: 8rem; display: flex; align-items: center; justify-content: center; padding: .5rem; box-sizing: border-box; }
  .gg-surfer-video { width: 100%; height: 100%; max-height: 18rem; display: block; object-fit: cover; border-radius: .5rem; background: #12101f; }
`,
);

startUserscript({
  name: "geosurfer",
  version: __GEOSURFER_VERSION__,
  config: geosurferConfig,
  topFrameOnly: true,
  settings: {
    id: "geosurfer",
    title: "GeoSurfer",
    shortTitle: "GeoSurfer",
    order: 40,
    config: geosurferConfig,
    sections: [
      { id: "general", title: "General", fields: ["enabled", "showOverlay"] },
      { id: "playback", title: "Playback", fields: ["playOnlyVisible", "muted"] },
    ],
  },
  setup(context) {
    let card: HTMLDivElement | null = null;
    let video: HTMLVideoElement | null = null;
    let visibilityObserver: IntersectionObserver | null = null;
    let scheduled = false;

    const play = () => {
      if (!video || document.hidden) return;
      if (!video.src) video.src = resourceUrl();
      video.play().catch(() => {
        // Autoplay may be blocked until a user gesture.
      });
    };

    const pause = () => {
      video?.pause();
    };

    const cleanup = () => {
      visibilityObserver?.disconnect();
      visibilityObserver = null;
      pause();
      if (video) {
        video.pause();
        video.removeAttribute("src");
      }
      video = null;
      card?.remove();
      card = null;
    };

    const attachVisibility = () => {
      visibilityObserver?.disconnect();
      visibilityObserver = null;
      if (!card || !video) return;
      if (!geosurferConfig.get("playOnlyVisible")) {
        play();
        return;
      }
      if (typeof IntersectionObserver !== "function") {
        play();
        return;
      }
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((entry) => entry.isIntersecting);
          if (visible) play();
          else pause();
        },
        { threshold: 0.15 },
      );
      visibilityObserver.observe(card);
    };

    const createCard = (root: Element, existing: Element[]): void => {
      card = document.createElement("div");
      card.id = CARD_ID;
      card.className = `${existing[0]?.className || ""} gg-surfer-card`;
      const frame = document.createElement("div");
      frame.className = "gg-surfer-frame";
      video = document.createElement("video");
      video.className = "gg-surfer-video";
      video.muted = geosurferConfig.get("muted");
      video.loop = true;
      video.autoplay = false;
      video.playsInline = true;
      video.preload = "none";
      video.setAttribute("aria-hidden", "true");
      video.dataset.src = resourceUrl();
      frame.append(video);
      card.append(frame);
      existing[0]?.insertAdjacentElement("afterend", card);
      if (!existing[0]) root.append(card);
      applyConfig(video);
      attachVisibility();
    };

    const ensure = () => {
      scheduled = false;
      if (!geosurferConfig.get("enabled") || !geosurferConfig.get("showOverlay")) {
        cleanup();
        return;
      }
      const collect = (container: ParentNode): Element[] =>
        [...container.querySelectorAll(CARD_SELECTOR)].filter((element) => element.id !== CARD_ID);
      let root: Element | null = document.querySelector(ROOT_SELECTOR);
      let cards = root ? collect(root) : [];
      if (cards.length < 2) {
        const parent = collect(document)[0]?.parentElement;
        const siblings = parent
          ? [...parent.children].filter(
              (element) => element.matches(CARD_SELECTOR) && element.id !== CARD_ID,
            )
          : [];
        if (parent && siblings.length >= 2) {
          root = parent;
          cards = siblings;
        }
      }
      if (!root) {
        cleanup();
        return;
      }
      if (card && root.contains(card)) {
        if (cards.length < 2) cleanup();
        else attachVisibility();
        return;
      }
      if (cards.length < 2) {
        cleanup();
        return;
      }
      createCard(root, cards);
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(ensure);
      else setTimeout(ensure, 0);
    };

    const unsubscribe = context.config.subscribe((change: ConfigChange<GeosurferConfig>) => {
      if (!card) {
        schedule();
        return;
      }
      if (change.key === "muted") applyConfig(video);
      if (change.key === "playOnlyVisible") attachVisibility();
      if (change.key === "enabled" || change.key === "showOverlay") schedule();
    });
    context.onCleanup(unsubscribe);
    const stopDom = onDomChange(schedule);
    context.onCleanup(stopDom);
    context.onRoute(schedule);
    context.onCleanup(cleanup);
    const onVisibility = () => {
      if (document.hidden) pause();
      else if (geosurferConfig.get("playOnlyVisible")) attachVisibility();
    };
    document.addEventListener("visibilitychange", onVisibility);
    context.onCleanup(() => document.removeEventListener("visibilitychange", onVisibility));
    schedule();
    context.log("initialized");
  },
});
