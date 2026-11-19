import { pageWindow } from "./window.js";

export interface PanoramaLocation {
  lat: number;
  lng: number;
  panoId: string | null;
  source: "setPano" | "setPosition" | "initial";
  instance?: unknown;
}

type Listener = (location: PanoramaLocation) => void;

interface PanoState {
  installed: boolean;
  apiVersion: number;
  listeners: Set<Listener>;
  last: PanoramaLocation | null;
  retry: number | null;
}

const KEY = "__GG_KIT_PANORAMA__";
const API_VERSION = 1;

function state(): PanoState {
  const win = pageWindow() as unknown as Record<string, PanoState | undefined>;
  if (win[KEY]) {
    if (win[KEY]!.apiVersion !== API_VERSION) {
      console.warn(
        `[gg-kit] shared panorama hook version mismatch (${win[KEY]!.apiVersion} vs ${API_VERSION})`,
      );
    }
    return win[KEY]!;
  }
  const value: PanoState = {
    installed: false,
    apiVersion: API_VERSION,
    listeners: new Set(),
    last: null,
    retry: null,
  };
  win[KEY] = value;
  return value;
}

function emit(location: PanoramaLocation): void {
  const current = state();
  if (
    current.last &&
    current.last.lat === location.lat &&
    current.last.lng === location.lng &&
    current.last.panoId === location.panoId
  ) {
    return;
  }
  current.last = location;
  for (const listener of [...current.listeners]) {
    try {
      listener(location);
    } catch (error) {
      console.warn("[gg-kit] panorama listener failed", error);
    }
  }
}

function readPanorama(pano: any, source: PanoramaLocation["source"]): void {
  try {
    const position = typeof pano?.getPosition === "function" ? pano.getPosition() : null;
    const panoId = typeof pano?.getPano === "function" ? pano.getPano() : null;
    const lat = Number(position?.lat?.());
    const lng = Number(position?.lng?.());
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      emit({ lat, lng, panoId: panoId || null, source, instance: pano });
    }
  } catch {
    // ignore transient panorama errors
  }
}

export function installPanoramaHook(): boolean {
  const current = state();
  if (current.installed) return true;
  const google = (pageWindow() as any).google;
  const proto = google?.maps?.StreetViewPanorama?.prototype;
  if (!proto) {
    if (current.retry === null) {
      current.retry = setTimeout(() => {
        current.retry = null;
        installPanoramaHook();
        if (current.installed) {
          for (const listener of current.listeners) {
            if (current.last) listener(current.last);
          }
        }
      }, 500) as unknown as number;
    }
    return false;
  }
  const originalSetPano = proto.setPano;
  if (typeof originalSetPano === "function") {
    proto.setPano = function (this: any, ...args: unknown[]) {
      const result = originalSetPano.apply(this, args);
      readPanorama(this, "setPano");
      return result;
    };
  }
  const originalSetPosition = proto.setPosition;
  if (typeof originalSetPosition === "function") {
    proto.setPosition = function (this: any, ...args: unknown[]) {
      const result = originalSetPosition.apply(this, args);
      readPanorama(this, "setPosition");
      return result;
    };
  }
  current.installed = true;
  return true;
}

export function onPanoramaChange(listener: Listener): () => void {
  const current = state();
  current.listeners.add(listener);
  if (current.last) listener(current.last);
  installPanoramaHook();
  return () => current.listeners.delete(listener);
}

export function lastPanorama(): PanoramaLocation | null {
  return state().last;
}
