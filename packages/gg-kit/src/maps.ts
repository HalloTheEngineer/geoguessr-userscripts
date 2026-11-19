import { pageWindow } from "./window.js";

export interface GoogleMapLike {
  getDiv(): HTMLElement;
  getCenter(): unknown;
  addListener(name: string, handler: (...args: unknown[]) => void): unknown;
  addListenerOnce?(name: string, handler: (...args: unknown[]) => void): unknown;
}

export interface MapFindResult {
  map: GoogleMapLike;
  props: Record<string, unknown>;
  excluded: boolean;
}

export function googleMaps(): any {
  return (pageWindow() as any).google?.maps || null;
}

export function whenGoogleMaps(timeout = 15000): Promise<any> {
  const existing = googleMaps();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const maps = googleMaps();
      if (maps || Date.now() - started > timeout) {
        clearInterval(timer);
        resolve(maps);
      }
    }, 200);
  });
}

function getFiber(element: Element | null): any {
  if (!element) return null;
  for (
    let node: Element | null = element, depth = 0;
    node && depth < 8;
    node = node.parentElement, depth++
  ) {
    const key = Object.keys(node).find(
      (name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"),
    );
    if (key) return (node as any)[key];
  }
  return null;
}

export function isGoogleMap(value: unknown): value is GoogleMapLike {
  const candidate = value as GoogleMapLike | null;
  return (
    !!candidate &&
    typeof candidate.getDiv === "function" &&
    typeof candidate.getCenter === "function" &&
    typeof candidate.addListener === "function"
  );
}

function mapDivInside(map: GoogleMapLike, canvas: Element): boolean {
  try {
    const div = map.getDiv();
    return !!div && (div === canvas || canvas.contains(div) || div.contains(canvas));
  } catch {
    return false;
  }
}

export function findMapForCanvas(
  canvas: Element,
  options: {
    allowOtherModes?: boolean;
    isExcludedProps?: (props: Record<string, unknown>) => boolean;
    isGuessMapProps?: (props: Record<string, unknown>) => boolean;
  } = {},
): MapFindResult | null {
  const fiber = getFiber(canvas);
  if (!fiber) return null;
  const isExcluded = options.isExcludedProps || (() => false);
  const isGuessMap = options.isGuessMapProps || (() => true);
  let node = fiber;
  let candidate: MapFindResult | null = null;
  let depth = 0;
  while (node && depth < 80) {
    const props = node.memoizedProps;
    if (props && typeof props === "object") {
      for (const map of [props.map, props.instance]) {
        if (isGoogleMap(map) && mapDivInside(map, canvas)) {
          if (isGuessMap(props) && !isExcluded(props)) {
            return { map, props, excluded: false };
          }
          if (!candidate && !isExcluded(props)) candidate = { map, props, excluded: false };
        }
      }
    }
    node = node.return;
    depth++;
  }
  if (candidate && options.allowOtherModes !== false && isGuessMap(candidate.props))
    return candidate;
  return null;
}

export function patchMapClick(
  map: GoogleMapLike,
  wrap: (handler: (...args: unknown[]) => void) => (...args: unknown[]) => void,
): number {
  if ((map as any).__ggKitClickPatched) return 0;
  const original = map.addListener;
  let count = 0;
  try {
    map.addListener = function (
      this: GoogleMapLike,
      name: string,
      handler: (...args: unknown[]) => void,
      ...rest: unknown[]
    ) {
      const next = name === "click" && typeof handler === "function" ? wrap(handler) : handler;
      if (next !== handler) count++;
      return (original as (...values: unknown[]) => unknown).call(this, name, next, ...rest);
    } as GoogleMapLike["addListener"];
    const once = map.addListenerOnce;
    if (typeof once === "function") {
      map.addListenerOnce = function (
        this: GoogleMapLike,
        name: string,
        handler: (...args: unknown[]) => void,
        ...rest: unknown[]
      ) {
        const next = name === "click" && typeof handler === "function" ? wrap(handler) : handler;
        if (next !== handler) count++;
        return (once as (...values: unknown[]) => unknown).call(this, name, next, ...rest);
      } as NonNullable<GoogleMapLike["addListenerOnce"]>;
    }
    (map as any).__ggKitClickPatched = true;
  } catch (error) {
    console.warn("[gg-kit] could not patch map listeners", error);
  }
  return count;
}
