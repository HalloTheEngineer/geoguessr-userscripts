// @ts-nocheck

import {
  type CustomControlContext,
  createJsonStore,
  findMapForCanvas as findGoogleMapForCanvas,
  injectStyle,
  onJsonMessage,
  onPanoramaChange,
  onSendMessage,
  onSocketClose,
  query,
  startUserscript,
} from "gg-kit";
import { type CountrySelection, type GeogambleConfig, geogambleConfig } from "./config.js";
import {
  buildCountryIndex,
  buildHeatmapRaster,
  CASE_CRATE_BY_ID,
  CASE_CRATES,
  CASE_HINT_TYPES,
  CASE_LEGACY_STORAGE_PREFIXES,
  CASE_MAX_HINTS,
  CASE_RARITIES,
  CASE_RARITY_BY_ID,
  CASE_STORAGE_PREFIX,
  CONFIG,
  CONFIG_DEFAULTS,
  COUNTRY_DATA,
  Core,
  caseAreaFilterPlan,
  caseBandRects,
  caseCompositeGeometry,
  caseHintBounds,
  caseHintCountryMatches,
  caseHintHasOverlay,
  caseHintIsAreaHint,
  caseModeAllowed,
  caseRoundKey,
  clamp,
  climateRegionsFor,
  createClickGate,
  DUEL_FRAME_HEADER_SIZE,
  decodePanoId,
  encodeDuelPinFrame,
  filterCountryOptions,
  findCountryAt,
  HEATMAP_UNIFORM_COLOR,
  heatmapColor,
  heatmapFootprint,
  makeFinalEvent,
  normalizeCaseSnapshot,
  normalizeLng,
  parseDuelJsonEvent,
  parseDuelStateEvent,
  pickCaseCrateOutcome,
  resolveConfig,
  runAnimation,
  shouldSkipAnimation,
  unwrapClickHandler,
  unwrapLng,
  weightedPick,
} from "./core/index.js";

(() => {
  const VERSION = __GEOGAMBLE_VERSION__;

  if (typeof globalThis !== "undefined" && globalThis.__GEOGAMBLE_TEST__) {
    globalThis.__GEOGAMBLE_EXPORTS__ = { VERSION, CONFIG, COUNTRY_DATA, Core };
    return;
  }

  Object.assign(CONFIG, geogambleConfig.get());
  const resolvedInitial = resolveConfig(CONFIG, COUNTRY_DATA);
  const settings = resolvedInitial.settings;
  let index = resolvedInitial.index;
  applyPerfTweaks();
  const trackedCanvases = new Map();
  const trackedMaps = new WeakMap();
  let staticHookInstalled = false;
  let audioContext = null;
  let masterGain = null;
  const GUESS_MAP_CANVAS_SELECTORS = '[data-qa="guess-map-canvas"], [class*="guess-map_canvas"]';

  let applyingFromStore = false;

  function applyResolved(trackedKeys) {
    const next = resolveConfig(CONFIG, COUNTRY_DATA);
    const structuralChange =
      jsonOf(next.settings, ["enabledCountries", "excludeCountries", "allowOtherModes"]) !==
      trackedKeys;
    Object.assign(settings, next.settings);
    index = next.index;
    applyPerfTweaks();
    if (structuralChange) detachAllMaps("config changed");
    syncHeatmapOverlays();
    if (masterGain && audioContext) masterGain.gain.value = settings.volume;
    return structuralChange;
  }

  function applyConfig(changes) {
    if (!changes || typeof changes !== "object") return false;
    const trackedKeys = jsonOf(CONFIG, ["enabledCountries", "excludeCountries", "allowOtherModes"]);
    applyingFromStore = true;
    geogambleConfig.patch(changes);
    applyingFromStore = false;
    return applyResolved(trackedKeys);
  }

  geogambleConfig.subscribe((change) => {
    const before = jsonOf(settings, ["enabledCountries", "excludeCountries", "allowOtherModes"]);
    CONFIG[change.key] = change.value;
    if (!applyingFromStore) applyResolved(before);
  });

  function applyPerfTweaks() {
    document.documentElement?.classList.toggle("gg-perf-off", !settings.perfTweaks);
  }

  function jsonOf(source, keys) {
    return JSON.stringify(keys.map((key) => source[key]));
  }

  function detachAllMaps(reason) {
    let count = 0;
    for (const [canvas, entry] of trackedCanvases) {
      try {
        cleanupEntry(entry);
        entry.gate.cancel();
      } catch (error) {
        debug("detach failed", error);
      }
      trackedCanvases.delete(canvas);
      trackedMaps.delete(entry.map);
      count++;
    }
    if (count) debug("detached all maps", reason, count);
  }

  function debug(...args) {
    if (settings.debug) console.log("[GeoGamble]", ...args);
  }

  let wsHookInstalled = false;
  let duelBridge = null;

  function toUint8Array(data) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return null;
  }

  function syncDuelRound(bytes) {
    if (!bytes || bytes.length < DUEL_FRAME_HEADER_SIZE) return;
    const round = bytes[17];
    if (round >= 1 && round <= 255) duelBridge.round = round;
  }

  function observeDuelSend(socket, data) {
    if (duelBridge) {
      if (socket === duelBridge.socket) {
        const bytes = toUint8Array(data);
        if (bytes && bytes.length >= DUEL_FRAME_HEADER_SIZE) {
          try {
            syncDuelRound(bytes);
          } catch (error) {
            debug("duel round sync failed", error);
          }
        }
      }
      return;
    }
    if (typeof data !== "string") return;
    let info: any;
    try {
      info = JSON.parse(data);
    } catch {
      return;
    }
    if (
      info?.code !== "SubscribeToLobby" ||
      typeof info.gameId !== "string" ||
      info.gameId.length !== 24
    )
      return;
    duelBridge = {
      socket,
      gameId: info.gameId,
      playerId: typeof info.playerId === "string" ? info.playerId : null,
      round: 1,
      confirmedDuel: false,
    };
    debug("duel socket identified", duelBridge.gameId);
  }

  function onDuelMessage(event) {
    try {
      const parsed = parseDuelJsonEvent(event?.data);
      const state = parseDuelStateEvent(event?.data);
      if (state) updateCaseDuel(state);
      if (!parsed || !duelBridge) return;
      if (parsed.kind === "round-start") {
        duelBridge.round = parsed.round || duelBridge.round;
        duelBridge.confirmedDuel = true;
      }
      if (parsed.kind === "round-end") {
        cancelActiveGambles("round ended");
        cancelCaseReel();
        closeCaseDialog(false);
      }
      debug("duel event", parsed.code, parsed.round ?? "");
    } catch (error) {
      debug("duel message failed", error);
    }
  }

  function installWsHooks() {
    if (wsHookInstalled) return;
    onSendMessage((data, socket) => {
      try {
        observeDuelSend(socket, data);
      } catch (error) {
        debug("duel send observe failed", error);
      }
    });
    onJsonMessage((data) => {
      try {
        onDuelMessage({ data: JSON.stringify(data) });
      } catch (error) {
        debug("duel message failed", error);
      }
    });
    onSocketClose((socket) => {
      if (duelBridge?.socket === socket) {
        debug("duel socket closed");
        duelBridge = null;
        clearCaseDuel();
      }
    });
    wsHookInstalled = true;
  }

  function cancelActiveGambles(reason) {
    let canceled = 0;
    for (const entry of trackedCanvases.values()) {
      try {
        if (!entry.animation && !entry.overlay && !entry.gate?.isActive()) continue;
        cleanupEntry(entry);
        entry.gate?.cancel();
        canceled++;
      } catch (error) {
        debug("gamble cancel failed", error);
      }
    }
    if (canceled) debug("gamble canceled", reason, canceled);
  }

  function sendDuelPin(point) {
    const bridge = duelBridge;
    if (!bridge?.confirmedDuel || !point) return false;
    if (bridge.socket?.readyState !== 1) return false;
    const frame = encodeDuelPinFrame({
      gameIdHex: bridge.gameId,
      round: bridge.round,
      timestampMs: Date.now(),
      lat: point.lat,
      lng: point.lng,
      headerType: 0x05,
    });
    if (!frame) return false;
    try {
      bridge.socket.send(frame);
      debug("duel pin sent", point, "round", bridge.round, frame.length, "bytes");
      return true;
    } catch (error) {
      debug("duel pin send failed", error);
      return false;
    }
  }

  const GG_CASE_STYLE_ID = "geogamble-case-style";
  const GG_CASE_DIALOG_ID = "geogamble-case-dialog";
  const GG_CASE_BUTTON_ID = "geogamble-case-button";
  const GG_CASE_WRAP_ID = "geogamble-case-wrap";
  const GG_CASE_HINT_DRAWER_ID = "geogamble-case-hint-drawer";
  const CASE_REEL_MS = 5200;
  const CASE_REEL_LAND_MS = 700;
  const CASE_REEL_TILES = 60;
  const CASE_REEL_WINNER_INDEX = 52;

  let casePagePath = location.pathname;
  let casePano = null;
  let casePanoPath = null;
  let caseDuel = null;
  let caseDuelPath = null;
  let caseLocation = null;
  let caseRound = { key: null, hints: [], opened: [], used: [] };
  let caseHiddenHints = new Set();
  let caseCountryIndex = null;
  let caseOverlayMap = null;
  let caseOverlaySignature = "";
  let caseOverlayBaseSignature = "";
  let caseOverlays = [];
  let caseFocusedHintIds = new Set();
  let caseDialogOpen = false;
  let caseReelTimer = null;
  let caseReelFrame = 0;
  let caseReelTarget = 0;
  let caseReelWinnerIndex = 0;
  let caseReelActive = false;
  let caseReelLanded = false;
  let caseDrawerMapDiv = null;
  let caseDrawerHostDiv = null;
  let caseDrawerClassObserver = null;
  let caseDrawerResizeObserver = null;
  let caseDrawerSyncTimer = null;
  let caseDrawerWindowListening = false;
  let caseLastFocus = null;
  let caseInitialStateReadFor = null;
  let caseRefreshScheduled = false;
  let caseUiDirty = true;

  function getCaseCountryIndex() {
    if (!caseCountryIndex) {
      caseCountryIndex = buildCountryIndex(COUNTRY_DATA, {
        enabledCountries: "all",
        excludeCountries: [],
      });
    }
    return caseCountryIndex;
  }

  function caseContextForLocation() {
    if (!caseLocation) return null;
    const hit = findCountryAt(caseLocation.lat, caseLocation.lng, getCaseCountryIndex());
    return { lat: caseLocation.lat, lng: caseLocation.lng, country: hit?.country || null };
  }

  function pointLat(point) {
    return typeof point?.lat === "function" ? point.lat() : Number(point?.lat);
  }

  function pointLng(point) {
    return typeof point?.lng === "function" ? point.lng() : Number(point?.lng);
  }

  function resolveCaseLocation() {
    const path = location.pathname;
    const gameId = caseDuel?.gameId || duelBridge?.gameId || null;
    const roundNumber = caseDuel?.roundNumber ?? duelBridge?.round ?? null;
    const isRated = caseDuel?.isRated ?? null;
    if (isDuelPath(path)) {
      if (!gameId || !caseDuel?.hasLocation) return null;
      if (!Number.isFinite(caseDuel.lat) || !Number.isFinite(caseDuel.lng)) return null;
      const key = caseRoundKey({ pathname: path, gameId, roundNumber, panoId: caseDuel.panoId });
      if (!key) return null;
      return {
        key,
        lat: caseDuel.lat,
        lng: caseDuel.lng,
        panoId: caseDuel.panoId,
        isRated,
        source: "duel",
      };
    }
    if (
      casePano &&
      Number.isFinite(casePano.lat) &&
      Number.isFinite(casePano.lng) &&
      casePano.panoId
    ) {
      const key = caseRoundKey({ pathname: path, gameId, roundNumber, panoId: casePano.panoId });
      if (key)
        return {
          key,
          lat: casePano.lat,
          lng: casePano.lng,
          panoId: casePano.panoId,
          isRated,
          source: "panorama",
        };
    }
    return null;
  }

  function isDuelPath(path) {
    return /^\/(?:duels|team-duels)\//i.test(String(path || ""));
  }

  function caseStorageKey(roundKey) {
    return `${CASE_STORAGE_PREFIX}${roundKey}`;
  }

  function saveCaseRound() {
    if (!caseRound.key) return;
    const store = createJsonStore({
      key: caseStorageKey(caseRound.key),
      version: 3,
      area: "session",
    });
    store.set({
      roundKey: caseRound.key,
      opened: caseRound.opened,
      hints: caseRound.hints,
      used: caseRound.used,
    });
  }

  function loadCaseRound(roundKey) {
    const store = createJsonStore({
      key: caseStorageKey(roundKey),
      version: 3,
      area: "session",
    });
    const snapshot = normalizeCaseSnapshot(store.get());
    return snapshot?.roundKey === roundKey ? snapshot : null;
  }

  function pruneCaseStorage(keepKey) {
    try {
      const keep = caseStorageKey(keepKey);
      for (const key of Object.keys(sessionStorage)) {
        if (CASE_LEGACY_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          sessionStorage.removeItem(key);
        } else if (key.startsWith(CASE_STORAGE_PREFIX) && key !== keep) {
          sessionStorage.removeItem(key);
        }
      }
    } catch (error) {
      debug("case prune failed", error);
    }
  }

  function resetCaseRoundState() {
    caseRound = { key: null, hints: [], opened: [], used: [] };
    caseLocation = null;
    caseHiddenHints = new Set();
    caseUiDirty = true;
    cancelCaseReel();
    closeCaseDialog(false);
    clearCaseOverlays();
    removeCaseButton();
  }

  function syncCaseRound(locationInfo) {
    if (!locationInfo) return;
    if (caseRound.key === locationInfo.key) {
      caseLocation = locationInfo;
      return;
    }
    saveCaseRound();
    const loaded = loadCaseRound(locationInfo.key);
    caseRound = loaded
      ? { key: locationInfo.key, hints: loaded.hints, opened: loaded.opened, used: loaded.used }
      : { key: locationInfo.key, hints: [], opened: [], used: [] };
    caseLocation = locationInfo;
    caseHiddenHints = new Set();
    caseUiDirty = true;
    cancelCaseReel();
    closeCaseDialog(false);
    clearCaseOverlays();
    pruneCaseStorage(locationInfo.key);
    debug("case round changed", locationInfo.key);
  }

  function hideCaseFeature() {
    removeCaseButton();
    if (caseDialogOpen) closeCaseDialog(false);
    clearCaseOverlays();
  }

  function syncCaseFeature() {
    if (location.pathname !== casePagePath) {
      saveCaseRound();
      casePagePath = location.pathname;
      if (casePanoPath !== casePagePath) casePano = null;
      if (caseDuelPath !== casePagePath) caseDuel = null;
      caseInitialStateReadFor = null;
      resetCaseRoundState();
    }
    if (isDuelPath(casePagePath) && !caseDuel) readInitialDuelState();
    const resolved = resolveCaseLocation();
    if (!resolved) {
      caseLocation = null;
      hideCaseFeature();
      return;
    }
    const allowed = caseModeAllowed({
      pathname: casePagePath,
      isRated: resolved.isRated,
      hasLocation: true,
    });
    if (!allowed) {
      caseLocation = resolved;
      hideCaseFeature();
      return;
    }
    syncCaseRound(resolved);
    ensureCaseButton();
    if (caseUiDirty) {
      renderCaseHints();
      if (caseDialogOpen) renderCaseCrates();
      caseUiDirty = false;
    }
    refreshCaseOverlays();
  }

  function scheduleCaseRefresh() {
    if (caseRefreshScheduled) return;
    caseRefreshScheduled = true;
    setTimeout(() => {
      caseRefreshScheduled = false;
      try {
        syncCaseFeature();
      } catch (error) {
        debug("case refresh failed", error);
      }
    }, 40);
  }

  function updateCaseDuel(summary) {
    if (!summary) return;
    if (caseDuel?.gameId && summary.gameId && caseDuel.gameId !== summary.gameId) {
      saveCaseRound();
      resetCaseRoundState();
    }
    const previous = caseDuel || {};
    const sameRound = previous.roundNumber !== null && previous.roundNumber === summary.roundNumber;
    const keepLocation = !summary.hasLocation && sameRound && previous.hasLocation;
    caseDuel = {
      ...previous,
      ...summary,
      gameId: summary.gameId || previous.gameId || null,
      isRated: summary.isRated ?? previous.isRated ?? null,
      isTeamDuels: summary.isTeamDuels ?? previous.isTeamDuels ?? false,
      hasLocation: keepLocation ? previous.hasLocation : summary.hasLocation,
      lat: keepLocation ? previous.lat : summary.lat,
      lng: keepLocation ? previous.lng : summary.lng,
      panoId: keepLocation ? previous.panoId : summary.panoId,
    };
    caseDuelPath = location.pathname;
    scheduleCaseRefresh();
  }

  function clearCaseDuel() {
    if (!caseDuel) return;
    caseDuel = null;
    caseDuelPath = null;
    scheduleCaseRefresh();
  }

  function setCasePano(lat, lng, panoId) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    const pano = decodePanoId(panoId);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !pano) return;
    if (
      casePano &&
      casePano.lat === latitude &&
      casePano.lng === longitude &&
      casePano.panoId === pano
    ) {
      return;
    }
    casePano = { lat: latitude, lng: longitude, panoId: pano };
    casePanoPath = location.pathname;
    scheduleCaseRefresh();
  }

  function updatePanoFromInstance(instance) {
    try {
      const panoId = decodePanoId(typeof instance.getPano === "function" ? instance.getPano() : "");
      const position = typeof instance.getPosition === "function" ? instance.getPosition() : null;
      if (!panoId || !position) return;
      if (instance.__ggCaseTargetPano && panoId !== instance.__ggCaseTargetPano) return;
      setCasePano(pointLat(position), pointLng(position), panoId);
    } catch (error) {
      debug("case pano read failed", error);
    }
  }

  function trackPanoInstance(instance, panoId = null) {
    if (!instance || typeof instance !== "object") return;
    if (panoId) {
      const target = decodePanoId(panoId);
      if (target) instance.__ggCaseTargetPano = target;
    }
    if (!instance.__ggCasePanoTracked) {
      instance.__ggCasePanoTracked = true;
      try {
        const eventApi = window.google?.maps?.event;
        for (const name of ["pano_changed", "position_changed", "status_changed"]) {
          eventApi?.addListener?.(instance, name, () => updatePanoFromInstance(instance));
        }
      } catch (error) {
        debug("case pano listener failed", error);
      }
    }
    updatePanoFromInstance(instance);
    setTimeout(() => updatePanoFromInstance(instance), 80);
  }

  let casePanoHookInstalled = false;

  function installPanoHook() {
    if (casePanoHookInstalled) return;
    onPanoramaChange((location) => {
      if (location.instance) trackPanoInstance(location.instance);
    });
    casePanoHookInstalled = true;
  }

  function findDuelStateObject(value) {
    if (!value || typeof value !== "object") return null;
    const stack = [value];
    const seen = new Set();
    let visited = 0;
    while (stack.length && visited < 30000) {
      const node = stack.pop();
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      visited++;
      if (node.options && typeof node.options.isRated === "boolean" && Array.isArray(node.rounds))
        return node;
      if (Array.isArray(node)) {
        for (const child of node) if (child && typeof child === "object") stack.push(child);
      } else {
        for (const key of Object.keys(node)) {
          const child = node[key];
          if (child && typeof child === "object") stack.push(child);
        }
      }
    }
    return null;
  }

  function readInitialDuelState() {
    if (caseInitialStateReadFor === casePagePath) return;
    const script = document.getElementById("__NEXT_DATA__");
    if (!script) return;
    caseInitialStateReadFor = casePagePath;
    try {
      const nextData = JSON.parse(script.textContent || "null");
      const state = findDuelStateObject(nextData);
      if (!state) return;
      const summary = parseDuelStateEvent(
        JSON.stringify({ gameId: state.gameId || null, duel: { state } }),
      );
      if (summary) updateCaseDuel(summary);
    } catch (error) {
      debug("case initial duel state failed", error);
    }
  }

  function handleCaseMapRemoved(map) {
    if (caseOverlayMap === map) clearCaseOverlays();
  }

  const CASE_CHEST_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.2h16V19H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3 9.2 5.2 5h13.6L21 9.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.8 9.2v3.2h4.4V9.2M12 12.4V19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

  function caseStyle(element, rarityId) {
    const rarity = CASE_RARITY_BY_ID.get(rarityId) || CASE_RARITIES[0];
    element.style.setProperty("--case-color", rarity.color);
    element.style.setProperty("--case-soft", rarity.soft);
    return rarity;
  }

  function ensureCaseStyles() {
    injectStyle(
      GG_CASE_STYLE_ID,
      `
#geogamble-case-wrap { position:absolute; left:calc(100% + .75rem); bottom:0; display:flex; flex-direction:column; align-items:flex-end; }
#geogamble-case-button { --size:5rem; --padding:1rem; position:relative; display:inline-flex; align-items:center; justify-content:center; width:var(--size); height:var(--size); padding:var(--padding); border:.0625rem solid rgba(255,255,255,.12); border-radius:50%; background:rgba(0,0,0,.6); color:var(--ds-color-white-100,#fff); font:inherit; cursor:pointer; box-shadow:0 .35rem 1rem rgba(0,0,0,.35); transition:background .15s ease,transform .15s ease; }
#geogamble-case-button:hover { background:rgba(0,0,0,.8); transform:translateY(-1px); }
#geogamble-case-button:active { background:rgba(0,0,0,.88); transform:translateY(0); }
#geogamble-case-button:focus-visible { outline:.125rem solid var(--ds-color-white-80,rgba(255,255,255,.8)); outline-offset:.125rem; }
.gg-case-icon { display:inline-flex; width:3rem; height:3rem; color:currentColor; }
.gg-case-icon svg { width:100%; height:100%; display:block; }
.gg-case-badge { position:absolute; top:.35rem; right:.35rem; display:inline-grid; place-items:center; min-width:1.25rem; height:1.25rem; padding:0 .3rem; border-radius:999px; background:var(--ds-color-green-50,#6cb928); color:#10140a; font:800 10px/1 var(--default-font,sans-serif); box-shadow:0 0 0 2px rgba(0,0,0,.6); }
.gg-case-badge[hidden] { display:none !important; }
#geogamble-case-hint-drawer { position:fixed; z-index:30; display:flex; flex-direction:column; align-items:stretch; gap:.45rem; width:min(21rem,calc(100vw - 2rem)); max-height:60vh; padding:.6rem; overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; border:.0625rem solid rgba(255,255,255,.08); border-radius:.875rem; background:linear-gradient(180deg,rgba(22,29,38,.97),rgba(11,16,23,.97)); box-shadow:0 1rem 2.5rem rgba(0,0,0,.5),inset 0 .0625rem 0 rgba(255,255,255,.05); pointer-events:auto; }
#geogamble-case-hint-drawer[hidden] { display:none !important; }
.gg-case-hintCard { display:flex; align-items:stretch; width:100%; border:.0625rem solid rgba(255,255,255,.08); border-left:.1875rem solid var(--case-color); border-radius:.75rem; background:linear-gradient(180deg,rgba(32,42,54,.96),rgba(20,28,38,.98)); color:var(--ds-color-white-100,#fff); box-shadow:0 .45rem 1rem rgba(0,0,0,.24); overflow:hidden; }
.gg-case-hintCard.is-off { opacity:.55; }
.gg-case-hintMain { flex:1; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:.24rem; padding:.68rem .75rem .72rem; border:0; background:transparent; color:inherit; font:inherit; text-align:left; }
button.gg-case-hintMain { cursor:pointer; }
button.gg-case-hintMain:hover { background:rgba(255,255,255,.055); }
.gg-case-hintMain.is-static { cursor:default; }
.gg-case-hintMeta { display:flex; align-items:center; justify-content:space-between; gap:.5rem; width:100%; }
.gg-case-hintFamily { display:inline-flex; align-items:center; color:rgba(255,255,255,.48); font:800 8px/1 var(--default-font,sans-serif); letter-spacing:.13em; text-transform:uppercase; }
.gg-case-hintFamily::before { content:""; width:.4rem; height:.4rem; margin-right:.35rem; border-radius:50%; background:var(--case-color); box-shadow:0 0 .35rem var(--case-color); }
.gg-case-hintStatus { flex:none; padding:.2rem .42rem; border-radius:999px; background:rgba(108,185,40,.13); color:#8bd642; font:800 7px/1 var(--default-font,sans-serif); letter-spacing:.08em; text-transform:uppercase; opacity:1; }
.gg-case-hintStatus.is-text { background:rgba(255,255,255,.07); color:rgba(255,255,255,.52); }
.gg-case-hintCard.is-off .gg-case-hintStatus { background:rgba(255,255,255,.07); color:rgba(255,255,255,.5); }
.gg-case-hintTitle { color:#fff; font:800 15px/1.25 var(--default-font,sans-serif); letter-spacing:.005em; }
.gg-case-hintDetail { color:rgba(255,255,255,.68); font:400 11.5px/1.42 var(--default-font,sans-serif); }
.gg-case-hintRemove { flex:none; width:2rem; border:0; border-left:.0625rem solid rgba(255,255,255,.075); background:rgba(255,255,255,.015); color:rgba(255,255,255,.55); font:700 14px/1 var(--default-font,sans-serif); cursor:pointer; transition:background .12s ease,color .12s ease; }
.gg-case-hintRemove:hover { background:rgba(235,75,75,.16); color:#fff; }
#geogamble-case-dialog { position:fixed; inset:0; z-index:2147483600; display:flex; align-items:center; justify-content:center; padding:1.25rem; background:rgba(26,26,46,.7); }
#geogamble-case-dialog[hidden] { display:none !important; }
.gg-case-panel { position:relative; width:min(60rem,calc(100vw - 2rem)); max-height:min(90vh,56rem); overflow:auto; padding:2rem; border:.0625rem solid rgba(255,255,255,.16); border-radius:1rem; background:linear-gradient(180deg,#211a3d 0,#10101c 62%,#10101c 100%); color:var(--ds-color-white-100,#fff); box-shadow:0 1.5rem 3rem rgba(0,0,0,.75); font-family:var(--default-font,inherit); text-align:left; }
.gg-case-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:1.25rem; }
.gg-case-titleWrap { display:flex; flex-direction:column; gap:.35rem; }
.gg-case-title { margin:0; font:italic 700 1.75rem/1.1 var(--default-font,sans-serif); letter-spacing:-.01em; }
.gg-case-close { width:2rem; height:2rem; flex:none; display:flex; align-items:center; justify-content:center; border:.0625rem solid var(--ds-color-white-80,rgba(255,255,255,.8)); border-radius:100%; background:transparent; color:var(--ds-color-white-100,#fff); font:400 18px/1 var(--default-font,sans-serif); cursor:pointer; transition:transform .1s ease; }
.gg-case-close:hover { transform:scale(1.05); }
.gg-case-close:focus-visible, .gg-case-crateButton:focus-visible, .gg-case-hintMain:focus-visible, .gg-case-hintRemove:focus-visible, .gg-case-resultClose:focus-visible { outline:.125rem solid var(--ds-color-white-80,rgba(255,255,255,.8)); outline-offset:.125rem; }
.gg-case-crates { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem; align-items:start; }
.gg-case-choice { display:flex; flex-direction:column; align-items:stretch; gap:.65rem; min-width:0; }
.gg-case-choiceLabel { color:var(--crate-color); font:italic 700 1rem/1.2 var(--default-font,sans-serif); letter-spacing:.02em; text-align:center; }
.gg-case-crateButton { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.85rem; width:100%; min-height:11rem; padding:1.25rem; border:.0625rem solid var(--crate-color); border-radius:1rem; background:radial-gradient(circle at 50% 32%,var(--crate-soft),rgba(0,0,0,.52) 70%); color:var(--crate-color); cursor:pointer; box-shadow:inset 0 0 0 .0625rem rgba(255,255,255,.04),0 .5rem 1.2rem rgba(0,0,0,.28); transition:transform .15s ease,box-shadow .15s ease,background .15s ease; }
.gg-case-crateButton .gg-case-icon { width:4.4rem; height:4.4rem; }
.gg-case-crateButton:hover:not(:disabled) { transform:translateY(-3px); box-shadow:inset 0 0 0 .0625rem rgba(255,255,255,.08),0 0 1.1rem var(--crate-soft),0 1rem 1.8rem rgba(0,0,0,.36); }
.gg-case-crateButton:active:not(:disabled) { transform:translateY(-1px); }
.gg-case-crateButton:disabled { cursor:default; opacity:.4; }
.gg-case-crateState { color:var(--ds-color-white-100,#fff); font:italic 700 10px/1 var(--default-font,sans-serif); letter-spacing:.12em; text-transform:uppercase; opacity:.72; }
.gg-case-reelView[hidden], .gg-case-cratesView[hidden], .gg-case-result[hidden] { display:none !important; }
.gg-case-reelWindow { position:relative; height:10.5rem; margin:.5rem 0 1.25rem; overflow:hidden; border:.0625rem solid rgba(255,255,255,.12); border-radius:.75rem; background:#0d0e12; transition:border-color .35s ease,box-shadow .35s ease; }
.gg-case-reelWindow.is-landed { border-color:var(--case-color); box-shadow:0 0 1.6rem -0.35rem var(--case-color),inset 0 0 2rem -1rem var(--case-color); }
.gg-case-reelWindow::before, .gg-case-reelWindow::after { content:""; position:absolute; z-index:3; top:0; bottom:0; width:5.5rem; pointer-events:none; }
.gg-case-reelWindow::before { left:0; background:linear-gradient(90deg,#0d0e12,rgba(13,14,18,0)); }
.gg-case-reelWindow::after { right:0; background:linear-gradient(270deg,#0d0e12,rgba(13,14,18,0)); }
.gg-case-reelMarker { position:absolute; z-index:5; left:50%; top:.6rem; bottom:.6rem; width:.125rem; transform:translateX(-.0625rem); background:#fbbf24; box-shadow:0 0 .8rem rgba(251,191,36,.7); pointer-events:none; }
.gg-case-reelMarker::before, .gg-case-reelMarker::after { content:""; position:absolute; left:50%; width:0; height:0; transform:translateX(-50%); border-left:.44rem solid transparent; border-right:.44rem solid transparent; }
.gg-case-reelMarker::before { top:-.2rem; border-top:.56rem solid #fbbf24; }
.gg-case-reelMarker::after { bottom:-.2rem; border-bottom:.56rem solid #fbbf24; }
.gg-case-reelTrack { display:flex; align-items:center; gap:.5rem; height:100%; padding:0; will-change:transform; }
.gg-case-reelCard { display:flex; flex:0 0 9.25rem; width:9.25rem; height:8.75rem; flex-direction:column; align-items:center; justify-content:center; gap:.5rem; padding:.55rem; border:.0625rem solid rgba(255,255,255,.08); border-bottom:.125rem solid var(--case-color); border-radius:.5rem; background:linear-gradient(180deg,#202127,#121318); color:var(--case-color); transition:opacity .4s ease,transform .4s ease,background .4s ease,box-shadow .4s ease; }
.gg-case-reelCard .gg-case-icon { width:3rem; height:3rem; color:var(--case-color); }
.gg-case-reelReward { color:var(--ds-color-white-80,rgba(255,255,255,.78)); font:400 11px/1.2 var(--default-font,sans-serif); letter-spacing:.01em; text-align:center; overflow-wrap:anywhere; }
.gg-case-reelCard.is-winner { transform:scale(1.08); border-color:var(--case-color); background:linear-gradient(180deg,var(--case-soft),#17181d 76%); box-shadow:0 0 2.1rem -0.15rem var(--case-color); z-index:6; }
.gg-case-reelCard.is-winner .gg-case-reelReward { color:var(--case-color); font-size:12px; font-weight:700; }
.gg-case-reelCard.is-dimmed { opacity:.25; }
.gg-case-result { position:relative; overflow:hidden; padding:1.75rem 1.15rem 1.4rem; border:.0625rem solid rgba(255,255,255,.14); border-top:.1875rem solid var(--case-color); border-radius:1rem; background:rgba(0,0,0,.5); text-align:center; }
.gg-case-resultRay { position:absolute; left:50%; top:10%; width:30rem; height:30rem; margin-left:-15rem; border-radius:50%; background:radial-gradient(circle,var(--case-soft),transparent 62%); opacity:.55; pointer-events:none; }
.gg-case-resultBody { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; gap:.45rem; animation:gg-case-pop .42s cubic-bezier(.16,1.4,.3,1) both; }
.gg-case-resultRarity { color:var(--case-color); font:italic 700 10px/1 var(--default-font,sans-serif); letter-spacing:.16em; text-transform:uppercase; }
.gg-case-resultIcon { display:grid; place-items:center; width:3.4rem; height:3.4rem; border-radius:100%; background:rgba(255,255,255,.06); color:var(--case-color); }
.gg-case-resultIcon svg { width:2.1rem; height:2.1rem; }
.gg-case-resultTitle { margin:.2rem 0 0; font:italic 700 1.7rem/1.15 var(--default-font,sans-serif); letter-spacing:-.01em; }
.gg-case-resultDetail { max-width:32rem; margin:0; color:var(--ds-color-white-80,rgba(255,255,255,.8)); font:400 13px/1.5 var(--default-font,sans-serif); }
.gg-case-resultNote { margin-top:.2rem; color:var(--ds-color-white-50,rgba(255,255,255,.5)); font:400 11px/1.4 var(--default-font,sans-serif); }
.gg-case-resultClose { margin-top:.7rem; min-width:8rem; padding:.65rem 1.1rem; border:0; border-radius:62.4375rem; background:var(--ds-color-green-50,#6cb928); color:#10140a; font:italic 700 12px/1 var(--default-font,sans-serif); cursor:pointer; }
.gg-case-resultClose:hover { background:var(--ds-color-green-40,#7bcf35); }
.gg-case-particle { position:absolute; z-index:2; left:50%; top:45%; width:.35rem; height:.35rem; border-radius:50%; background:var(--case-color); animation:gg-case-particle .9s ease-out forwards; pointer-events:none; }
.gg-case-mapMarker { position:absolute; width:0; height:0; pointer-events:none; z-index:2147483647; }
.gg-case-mapDot { position:absolute; left:-8px; top:-8px; width:16px; height:16px; border:2px solid #fff; border-radius:50%; background:var(--case-color); box-shadow:0 0 16px var(--case-color); }
.gg-case-mapPin { position:absolute; left:-13px; top:-34px; width:26px; height:26px; border:2px solid #fff; border-radius:50% 50% 50% 4px; background:var(--case-color); transform:rotate(-45deg); box-shadow:0 0 24px var(--case-color); }
.gg-case-mapPin::after { content:""; position:absolute; inset:6px; border-radius:50%; background:#fff; opacity:.85; }
.gg-case-mapPulse { position:absolute; left:-24px; top:-24px; width:48px; height:48px; border:2px solid var(--case-color); border-radius:50%; animation:gg-case-mapPulse 1.8s ease-out infinite; }
.gg-case-compositeOverlay { position:absolute; z-index:18; pointer-events:none; }
.gg-case-compositeCanvas { position:absolute; left:0; top:0; pointer-events:none; }
@keyframes gg-case-pop { from { opacity:0; transform:scale(.82); } to { opacity:1; transform:scale(1); } }
@keyframes gg-case-particle { from { opacity:.95; transform:rotate(var(--angle)) translateY(0) scale(1); } to { opacity:0; transform:rotate(var(--angle)) translateY(-112px) scale(.2); } }
@keyframes gg-case-mapPulse { 0% { opacity:.8; transform:scale(.45); } 100% { opacity:0; transform:scale(1.35); } }
@media (max-width:700px) {
  .gg-case-panel { padding:1.25rem; }
  .gg-case-title { font-size:1.5rem; }
  .gg-case-crates { gap:.6rem; }
  .gg-case-choiceLabel { font-size:.85rem; }
  .gg-case-crateButton { min-height:8.5rem; padding:.75rem; }
  .gg-case-crateButton .gg-case-icon { width:3.4rem; height:3.4rem; }
}
@media (prefers-reduced-motion: reduce) {
  .gg-case-resultBody, .gg-case-particle, .gg-case-mapPulse { animation:none !important; }
  .gg-case-reelTrack, .gg-case-reelCard, .gg-case-reelWindow { transition:none !important; }
  #geogamble-case-button, .gg-case-crateButton, .gg-case-close { transition:none !important; }
}
    `,
    );
  }

  function removeCaseButton() {
    document.getElementById(GG_CASE_WRAP_ID)?.remove();
    document.getElementById(GG_CASE_BUTTON_ID)?.remove();
    hideCaseHintDrawer();
  }

  function caseControlsRoot() {
    return query("game.controls");
  }

  function nativeTokenClasses(node, prefixes) {
    if (!node?.classList) return [];
    return [...node.classList].filter((name) => prefixes.some((prefix) => name.startsWith(prefix)));
  }

  function ensureCaseButton() {
    const controls = caseControlsRoot();
    if (!controls) return false;
    ensureCaseStyles();
    let wrap = document.getElementById(GG_CASE_WRAP_ID);
    if (wrap && controls.contains(wrap)) {
      updateCaseButton();
      return true;
    }
    wrap?.remove();
    const nativeHud = query("game.hudButton");
    const nativeWrapper = document.querySelector('[class*="styles_control__"]');
    wrap = el(
      "div",
      ["gg-case-wrap", ...nativeTokenClasses(nativeWrapper, ["styles_control__"])].join(" "),
    );
    wrap.id = GG_CASE_WRAP_ID;
    const hudClasses = nativeTokenClasses(nativeHud, [
      "styles_hudButton__",
      "styles_sizeSmall__",
      "styles_sizeLarge__",
    ]);
    const button = el("button", ["gg-case-button", ...hudClasses].join(" "));
    button.id = GG_CASE_BUTTON_ID;
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    const icon = el("span", "gg-case-icon");
    icon.innerHTML = CASE_CHEST_SVG;
    const badge = el("span", "gg-case-badge", "3");
    button.append(icon, badge);
    button.addEventListener("click", () => {
      if (caseDialogOpen) closeCaseDialog(true);
      else openCaseDialog();
    });
    wrap.append(button);
    controls.appendChild(wrap);
    updateCaseButton();
    renderCaseHints();
    caseUiDirty = false;
    return true;
  }

  function updateCaseButton() {
    const button = document.getElementById(GG_CASE_BUTTON_ID);
    if (!button) return;
    const remaining = Math.max(0, 3 - caseRound.opened.length);
    const badge = button.querySelector(".gg-case-badge");
    if (badge) {
      badge.textContent = String(remaining);
      badge.hidden = remaining === 0;
    }
    const text = remaining
      ? `Open cases (${remaining} left this round)`
      : "All cases opened this round";
    button.title = text;
    button.setAttribute("aria-label", text);
  }

  function ensureCaseDialog() {
    ensureCaseStyles();
    let dialog = document.getElementById(GG_CASE_DIALOG_ID);
    if (dialog) return dialog;
    dialog = el("div", "gg-case-dialog");
    dialog.id = GG_CASE_DIALOG_ID;
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "geogamble-case-title");
    const panel = el("div", "gg-case-panel");
    const header = el("div", "gg-case-header");
    const titleWrap = el("div", "gg-case-titleWrap");
    const title = el("h2", "gg-case-title", "Cases");
    title.id = "geogamble-case-title";
    titleWrap.append(title);
    const close = el("button", "gg-case-close", "\u00d7");
    close.type = "button";
    close.setAttribute("aria-label", "Close cases");
    close.addEventListener("click", () => closeCaseDialog(true));
    header.append(titleWrap, close);

    const cratesView = el("div", "gg-case-cratesView");
    const crates = el("div", "gg-case-crates");
    cratesView.append(crates);

    const reelView = el("div", "gg-case-reelView");
    reelView.hidden = true;
    const reelWindow = el("div", "gg-case-reelWindow");
    const marker = el("div", "gg-case-reelMarker");
    const track = el("div", "gg-case-reelTrack");
    reelWindow.append(marker, track);
    const result = el("div", "gg-case-result");
    result.hidden = true;
    reelView.append(reelWindow, result);

    panel.append(header, cratesView, reelView);
    dialog.append(panel);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeCaseDialog(true);
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function caseDialogParts() {
    const dialog = document.getElementById(GG_CASE_DIALOG_ID);
    if (!dialog) return null;
    return {
      dialog,
      cratesView: dialog.querySelector(".gg-case-cratesView"),
      crates: dialog.querySelector(".gg-case-crates"),
      reelView: dialog.querySelector(".gg-case-reelView"),
      reelWindow: dialog.querySelector(".gg-case-reelWindow"),
      track: dialog.querySelector(".gg-case-reelTrack"),
      result: dialog.querySelector(".gg-case-result"),
    };
  }

  function setCaseDialogTitle(text) {
    const title = document.getElementById("geogamble-case-title");
    if (title) title.textContent = text;
  }

  function switchCaseView(view) {
    const parts = caseDialogParts();
    if (!parts) return;
    if (view === "crates") setCaseDialogTitle("Cases");
    if (parts.cratesView) parts.cratesView.hidden = view !== "crates";
    if (parts.reelView) parts.reelView.hidden = view !== "reel";
  }

  function crateOddsText(crate) {
    return CASE_RARITIES.filter((rarity) => Number(crate.weights[rarity.id]) > 0)
      .map((rarity) => `${rarity.label} ${crate.weights[rarity.id]}%`)
      .join(" \u00b7 ");
  }

  function crateAccent(crate) {
    return (
      [...CASE_RARITIES].reverse().find((rarity) => Number(crate.weights[rarity.id]) > 0) ||
      CASE_RARITIES[0]
    );
  }

  function caseRewardLabel(rarityId, rng = Math.random) {
    const labels = CASE_HINT_TYPES.filter((hint) => hint.rarity === rarityId).map(
      (hint) => hint.label,
    );
    if (!labels.length) return (CASE_RARITY_BY_ID.get(rarityId) || CASE_RARITIES[0]).label;
    return labels[Math.min(labels.length - 1, Math.floor(rng() * labels.length))];
  }

  function renderCaseCrates() {
    const parts = caseDialogParts();
    if (!parts?.crates) return;
    parts.crates.textContent = "";
    for (const crate of CASE_CRATES) {
      const opened = caseRound.opened.includes(crate.id);
      const accent = crateAccent(crate);
      const choice = el("div", "gg-case-choice");
      choice.style.setProperty("--crate-color", accent.color);
      choice.style.setProperty("--crate-soft", accent.soft);
      const label = el("span", "gg-case-choiceLabel", crate.name);
      const button = el("button", "gg-case-crateButton");
      button.type = "button";
      button.disabled = opened || caseReelActive;
      button.title = `${crate.name}: ${crateOddsText(crate)}`;
      button.setAttribute(
        "aria-label",
        opened ? `${crate.name} already opened` : `Open ${crate.name}`,
      );
      const icon = el("span", "gg-case-icon");
      icon.innerHTML = CASE_CHEST_SVG;
      const state = el("span", "gg-case-crateState", opened ? "Opened" : "Open");
      button.append(icon, state);
      button.addEventListener("click", () => openCaseCrate(crate.id));
      choice.append(label, button);
      parts.crates.appendChild(choice);
    }
  }

  function makeCaseChip(hint) {
    const card = el("div", "gg-case-hintCard");
    const rarity = caseStyle(card, hint.rarity);
    const hasOverlay = caseHintHasOverlay(hint);
    const main = el(
      hasOverlay ? "button" : "div",
      hasOverlay ? "gg-case-hintMain" : "gg-case-hintMain is-static",
    );
    if (hasOverlay) {
      main.type = "button";
      main.setAttribute("aria-pressed", caseHiddenHints.has(hint.id) ? "false" : "true");
      main.title = `${rarity.label}: ${hint.title}. Click to toggle its map overlay.`;
      main.addEventListener("click", () => toggleCaseHint(hint.id));
    } else {
      main.title = `${rarity.label}: ${hint.title}. Text hint only.`;
    }
    const meta = el("span", "gg-case-hintMeta");
    const family = el("span", "gg-case-hintFamily", hint.family || "hint");
    const status = el(
      "span",
      "gg-case-hintStatus",
      hasOverlay ? (caseHiddenHints.has(hint.id) ? "Map off" : "Map") : "Text only",
    );
    if (!hasOverlay) status.classList.add("is-text");
    meta.append(family, status);
    const title = el("span", "gg-case-hintTitle", hint.title);
    const detail = el("span", "gg-case-hintDetail", hint.detail);
    main.append(meta, title, detail);
    const remove = el("button", "gg-case-hintRemove", "\u00d7");
    remove.type = "button";
    remove.title = "Remove hint";
    remove.setAttribute("aria-label", `Remove ${hint.title}`);
    remove.addEventListener("click", () => removeCaseHint(hint.id));
    card.classList.toggle("is-off", hasOverlay && caseHiddenHints.has(hint.id));
    card.append(main, remove);
    return card;
  }

  function ensureCaseHintDrawer() {
    let drawer = document.getElementById(GG_CASE_HINT_DRAWER_ID);
    if (!drawer) {
      drawer = el("aside", "gg-case-hintDrawer");
      drawer.id = GG_CASE_HINT_DRAWER_ID;
      drawer.hidden = true;
      drawer.setAttribute("aria-label", "Active case hints");
      document.body.appendChild(drawer);
    }
    return drawer;
  }

  function hideCaseHintDrawer() {
    const drawer = document.getElementById(GG_CASE_HINT_DRAWER_ID);
    if (drawer) drawer.hidden = true;
  }

  function detachCaseMapObservers() {
    caseDrawerClassObserver?.disconnect();
    caseDrawerResizeObserver?.disconnect();
    caseDrawerClassObserver = null;
    caseDrawerResizeObserver = null;
    caseDrawerMapDiv = null;
    caseDrawerHostDiv = null;
  }

  function observeCaseMapDiv(div) {
    const host = caseMapHostForDiv(div);
    if (!div || (caseDrawerMapDiv === div && caseDrawerHostDiv === host)) return;
    detachCaseMapObservers();
    caseDrawerMapDiv = div;
    caseDrawerHostDiv = host;
    if (!caseDrawerWindowListening) {
      caseDrawerWindowListening = true;
      window.addEventListener("resize", scheduleCaseDrawerSync, { passive: true });
    }
    if (typeof MutationObserver === "function") {
      caseDrawerClassObserver = new MutationObserver(scheduleCaseDrawerSync);
      caseDrawerClassObserver.observe(div, { attributes: true, attributeFilter: ["class"] });
      if (host && host !== div) {
        caseDrawerClassObserver.observe(host, { attributes: true, attributeFilter: ["class"] });
      }
    }
    if (typeof ResizeObserver === "function") {
      caseDrawerResizeObserver = new ResizeObserver(() => syncCaseHintDrawer());
      caseDrawerResizeObserver.observe(div);
      if (host && host !== div) caseDrawerResizeObserver.observe(host);
    }
  }

  function scheduleCaseDrawerSync() {
    if (caseDrawerSyncTimer !== null) return;
    caseDrawerSyncTimer = setTimeout(() => {
      caseDrawerSyncTimer = null;
      refreshCaseOverlays();
    }, 35);
  }

  function syncCaseHintDrawer(mapOverride) {
    const drawer = ensureCaseHintDrawer();
    const map = mapOverride === undefined ? getCaseMap() : mapOverride;
    if (!map) {
      drawer.hidden = true;
      detachCaseMapObservers();
      return;
    }
    const div = map.getDiv?.();
    if (!div) {
      drawer.hidden = true;
      detachCaseMapObservers();
      return;
    }
    observeCaseMapDiv(div);
    if (!caseRound.hints.length || !caseMapIsActive(map) || caseDialogOpen) {
      drawer.hidden = true;
      return;
    }
    drawer.hidden = false;
    const host = caseDrawerHostDiv || caseMapHostForDiv(div);
    const rect = (host || div).getBoundingClientRect();
    const width = drawer.offsetWidth || 304;
    let left = rect.left - width - 12;
    if (left < 8) left = Math.max(8, rect.left + 12);
    const top = Math.max(8, rect.top + 16);
    const maxHeight = Math.max(180, Math.min(rect.height - 32, window.innerHeight - top - 8));
    drawer.style.left = `${Math.round(left)}px`;
    drawer.style.top = `${Math.round(top)}px`;
    drawer.style.maxHeight = `${Math.round(maxHeight)}px`;
    drawer.dataset.side = left < rect.left ? "outside" : "inside";
  }

  function renderCaseHints() {
    const drawer = ensureCaseHintDrawer();
    drawer.textContent = "";
    for (const hint of caseRound.hints) drawer.appendChild(makeCaseChip(hint));
    if (!caseRound.hints.length) {
      drawer.hidden = true;
    } else {
      syncCaseHintDrawer();
    }
    for (const button of document.querySelectorAll(`#${GG_CASE_BUTTON_ID} .gg-case-badge`)) {
      const remaining = Math.max(0, 3 - caseRound.opened.length);
      button.textContent = String(remaining);
      button.hidden = remaining === 0;
    }
  }

  function toggleCaseHint(hintId) {
    if (caseHiddenHints.has(hintId)) {
      caseHiddenHints.delete(hintId);
    } else {
      caseHiddenHints.add(hintId);
      caseFocusedHintIds.delete(hintId);
    }
    saveCaseRound();
    renderCaseHints();
    caseUiDirty = false;
    refreshCaseOverlays();
  }

  function removeCaseHint(hintId) {
    caseRound.hints = caseRound.hints.filter((hint) => hint.id !== hintId);
    caseHiddenHints.delete(hintId);
    caseFocusedHintIds.delete(hintId);
    saveCaseRound();
    renderCaseHints();
    caseUiDirty = false;
    refreshCaseOverlays();
    if (caseDialogOpen) renderCaseCrates();
  }

  function openCaseDialog() {
    if (!caseLocation) return;
    if (
      !caseModeAllowed({ pathname: casePagePath, isRated: caseLocation.isRated, hasLocation: true })
    )
      return;
    const dialog = ensureCaseDialog();
    caseLastFocus = document.activeElement;
    caseDialogOpen = true;
    dialog.hidden = false;
    switchCaseView("crates");
    renderCaseCrates();
    renderCaseHints();
    caseUiDirty = false;
    refreshCaseOverlays();
    document.addEventListener("keydown", onCaseDialogKeydown, true);
    setTimeout(() => dialog.querySelector(".gg-case-close")?.focus(), 0);
  }

  function closeCaseDialog(restoreFocus = true) {
    const dialog = document.getElementById(GG_CASE_DIALOG_ID);
    if (!caseDialogOpen) {
      if (dialog) dialog.hidden = true;
      return;
    }
    const wasReeling = caseReelActive;
    cancelCaseReel();
    caseDialogOpen = false;
    if (dialog) dialog.hidden = true;
    document.removeEventListener("keydown", onCaseDialogKeydown, true);
    switchCaseView("crates");
    if (restoreFocus && caseLastFocus && typeof caseLastFocus.focus === "function") {
      try {
        caseLastFocus.focus();
      } catch {
        // ignore
      }
    }
    caseLastFocus = null;
    if (wasReeling) {
      renderCaseHints();
      refreshCaseOverlays();
    } else {
      syncCaseHintDrawer();
    }
  }

  function onCaseDialogKeydown(event) {
    if (!caseDialogOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeCaseDialog(true);
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = document.getElementById(GG_CASE_DIALOG_ID);
    if (!dialog) return;
    const focusable = [
      ...dialog.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function stopCaseReelFrame() {
    if (caseReelFrame) {
      cancelAnimationFrame(caseReelFrame);
      caseReelFrame = 0;
    }
  }

  function cancelCaseReel() {
    if (caseReelTimer !== null) {
      clearTimeout(caseReelTimer);
      caseReelTimer = null;
    }
    stopCaseReelFrame();
    caseReelActive = false;
    caseReelLanded = false;
  }

  function caseReducedMotion() {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  function cubicBezierEase(progress, x1, y1, x2, y2) {
    const x = clamp(progress, 0, 1);
    const bezier = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    const slope = (t, a, b) =>
      3 * (1 - t) * (1 - t) * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b);
    let t = x;
    for (let index = 0; index < 8; index++) {
      const current = bezier(t, x1, x2);
      const derivative = slope(t, x1, x2);
      if (Math.abs(current - x) < 1e-6 || Math.abs(derivative) < 1e-6) break;
      t = clamp(t - (current - x) / derivative, 0, 1);
    }
    if (Math.abs(bezier(t, x1, x2) - x) > 1e-4) {
      let low = 0;
      let high = 1;
      for (let index = 0; index < 16; index++) {
        t = (low + high) / 2;
        if (bezier(t, x1, x2) < x) low = t;
        else high = t;
      }
    }
    return bezier(t, y1, y2);
  }

  function openCaseCrate(crateId) {
    if (caseReelActive || !caseLocation) return;
    if (caseRound.opened.includes(crateId)) return;
    const context = caseContextForLocation();
    if (!context) return;
    const outcome = pickCaseCrateOutcome(crateId, context, new Set(caseRound.used));
    if (!outcome) {
      debug("case pull produced no hint", crateId);
      return;
    }
    const parts = caseDialogParts();
    if (!parts?.track || !parts.reelWindow) return;
    if (!caseRound.opened.includes(outcome.crateId)) caseRound.opened.push(outcome.crateId);
    if (
      !caseRound.hints.some((hint) => hint.id === outcome.hint.id) &&
      caseRound.hints.length < CASE_MAX_HINTS
    ) {
      caseRound.hints.push(outcome.hint);
    }
    if (!caseRound.used.includes(outcome.hint.id)) caseRound.used.push(outcome.hint.id);
    caseHiddenHints.delete(outcome.hint.id);
    saveCaseRound();
    caseUiDirty = false;
    updateCaseButton();
    caseReelActive = true;
    caseReelLanded = false;
    caseReelTarget = 0;
    caseReelWinnerIndex = CASE_REEL_WINNER_INDEX;
    switchCaseView("reel");
    if (parts.result) parts.result.hidden = true;
    if (parts.reelWindow) {
      parts.reelWindow.hidden = false;
      parts.reelWindow.classList.remove("is-landed");
      parts.reelWindow.style.removeProperty("--case-color");
    }
    parts.track.textContent = "";
    parts.track.style.transition = "none";
    parts.track.style.transform = "translate3d(0,0,0)";
    const targetIndex = CASE_REEL_WINNER_INDEX;
    const total = CASE_REEL_TILES;
    const crate = CASE_CRATE_BY_ID.get(crateId) || CASE_CRATES[0];
    setCaseDialogTitle(`Opening ${crate.name}`);
    const bandWeights = Object.entries(crate.weights).map(([rarity, weight]) => ({
      rarity,
      weight,
    }));
    for (let index = 0; index < total; index++) {
      const rarityId =
        index === targetIndex
          ? outcome.hint.rarity
          : weightedPick(bandWeights, Math.random)?.rarity || "common";
      const rarity = CASE_RARITY_BY_ID.get(rarityId) || CASE_RARITIES[0];
      const card = el("div", "gg-case-reelCard");
      card.style.setProperty("--case-color", rarity.color);
      card.style.setProperty("--case-soft", rarity.soft);
      card.dataset.rarity = rarityId;
      const icon = el("span", "gg-case-icon");
      icon.innerHTML = CASE_CHEST_SVG;
      const reward = el(
        "span",
        "gg-case-reelReward",
        index === targetIndex ? outcome.hint.label : caseRewardLabel(rarityId),
      );
      card.append(icon, reward);
      parts.track.appendChild(card);
    }
    renderCaseCrates();
    if (caseReducedMotion()) {
      finishCasePull(outcome, true);
      return;
    }
    const width = parts.reelWindow.clientWidth || 760;
    const targetCard = parts.track.children[targetIndex];
    const cardLefts = [...parts.track.children].map((card) => card.offsetLeft);
    let landingRatio = 0.5;
    if (targetCard) {
      const targetRect = targetCard.getBoundingClientRect();
      const windowRect = parts.reelWindow.getBoundingClientRect();
      landingRatio = 0.3 + Math.random() * 0.4;
      const landingX = targetRect.left + targetRect.width * landingRatio;
      const markerX = windowRect.left + windowRect.width / 2;
      caseReelTarget = Math.max(0, landingX - markerX);
    } else {
      caseReelTarget = 0;
    }
    let started = 0;
    let lastCardIndex = Number.NaN;
    let step = 0;
    const animate = (now) => {
      if (!caseReelActive) return;
      if (!started) started = now;
      const progress = clamp((now - started) / CASE_REEL_MS, 0, 1);
      const offset = caseReelTarget * cubicBezierEase(progress, 0.1, 0.82, 0.12, 1);
      parts.track.style.transform = `translate3d(-${offset}px,0,0)`;
      const marker = offset + width / 2;
      let cardIndex = 0;
      for (let index = 0; index < cardLefts.length; index++) {
        if (marker >= cardLefts[index]) cardIndex = index;
        else break;
      }
      if (cardIndex !== lastCardIndex) {
        lastCardIndex = cardIndex;
        playCaseReelTick(progress, step++);
      }
      if (progress < 1) {
        caseReelFrame = requestAnimationFrame(animate);
      } else {
        caseReelFrame = 0;
      }
    };
    caseReelFrame = requestAnimationFrame((first) => {
      caseReelFrame = requestAnimationFrame((second) => {
        if (!caseReelActive) return;
        started = second || first;
        animate(started);
      });
    });
    caseReelTimer = setTimeout(() => finishCasePull(outcome), CASE_REEL_MS + 80);
  }

  function finishCasePull(outcome, immediate = false) {
    if (!caseReelActive || !outcome) return;
    stopCaseReelFrame();
    if (caseReelTimer !== null) {
      clearTimeout(caseReelTimer);
      caseReelTimer = null;
    }
    const parts = caseDialogParts();
    if (parts?.track) {
      parts.track.style.transition = "none";
      parts.track.style.transform = `translate3d(-${caseReelTarget}px,0,0)`;
      for (const [index, card] of [...parts.track.children].entries()) {
        card.classList.toggle("is-winner", index === caseReelWinnerIndex);
        card.classList.toggle("is-dimmed", index !== caseReelWinnerIndex);
      }
    }
    if (parts?.reelWindow) {
      const rarity = CASE_RARITY_BY_ID.get(outcome.hint.rarity) || CASE_RARITIES[0];
      parts.reelWindow.style.setProperty("--case-color", rarity.color);
      parts.reelWindow.classList.add("is-landed");
    }
    caseReelLanded = true;
    refreshCaseOverlays();
    if (!immediate && !caseReducedMotion()) {
      playCaseLanding();
      caseReelTimer = setTimeout(() => completeCasePull(outcome), CASE_REEL_LAND_MS);
      return;
    }
    completeCasePull(outcome);
  }

  function completeCasePull(outcome) {
    if (!caseReelActive || !outcome) return;
    caseReelActive = false;
    caseReelLanded = false;
    if (caseReelTimer !== null) {
      clearTimeout(caseReelTimer);
      caseReelTimer = null;
    }
    renderCaseCrates();
    renderCaseHints();
    caseUiDirty = false;
    refreshCaseOverlays();
    showCaseResult(outcome.hint);
  }

  function showCaseResult(hint) {
    const parts = caseDialogParts();
    if (!parts?.result) return;
    const rarity = CASE_RARITY_BY_ID.get(hint.rarity) || CASE_RARITIES[0];
    parts.reelWindow.hidden = true;
    parts.result.hidden = false;
    parts.result.style.setProperty("--case-color", rarity.color);
    parts.result.style.setProperty("--case-soft", rarity.soft);
    parts.result.textContent = "";
    const ray = el("div", "gg-case-resultRay");
    const body = el("div", "gg-case-resultBody");
    const familyLabel = hint.family ? String(hint.family) : "location";
    const rarityLabel = el("span", "gg-case-resultRarity", `${rarity.label} ${familyLabel} hint`);
    const icon = el("span", "gg-case-resultIcon");
    icon.innerHTML = CASE_CHEST_SVG;
    const title = el("h3", "gg-case-resultTitle", hint.title);
    const detail = el("p", "gg-case-resultDetail", hint.detail);
    const note = el(
      "span",
      "gg-case-resultNote",
      caseHintHasOverlay(hint)
        ? "Added to active hints. Map updated."
        : "Added to active hints as a text hint.",
    );
    const close = el("button", "gg-case-resultClose", "Close");
    close.type = "button";
    close.addEventListener("click", () => closeCaseDialog(true));
    body.append(rarityLabel, icon, title, detail, note, close);
    parts.result.append(ray, body);
    if (!caseReducedMotion()) {
      for (let index = 0; index < 14; index++) {
        const particle = el("span", "gg-case-particle");
        particle.style.setProperty("--case-color", rarity.color);
        particle.style.setProperty("--angle", `${(360 / 14) * index + Math.random() * 10}deg`);
        particle.style.animationDelay = `${Math.random() * 0.16}s`;
        parts.result.appendChild(particle);
      }
    }
    if (settings.sound) playCaseReveal(hint.rarity);
    setTimeout(() => {
      if (caseDialogOpen) parts.dialog.querySelector(".gg-case-close")?.focus();
    }, 0);
  }

  function visibleElementArea(element) {
    if (!element?.isConnected || typeof element.getBoundingClientRect !== "function") return 0;
    try {
      if (typeof element.checkVisibility === "function") {
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return 0;
      }
      const rect = element.getBoundingClientRect();
      if (!rect || rect.width < 8 || rect.height < 8) return 0;
      const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
      const width = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
      const height = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
      return width >= 8 && height >= 8 ? width * height : 0;
    } catch {
      return 0;
    }
  }

  function caseMapVisibilityScore(entry) {
    try {
      const map = entry?.map;
      const canvas = entry?.canvas;
      const div = map?.getDiv?.();
      if (!map || !canvas?.isConnected || !div?.isConnected) return 0;
      const divArea = visibleElementArea(div);
      if (!divArea) return 0;
      const canvasArea = visibleElementArea(canvas);
      return canvasArea ? Math.min(divArea, canvasArea) : divArea;
    } catch {
      return 0;
    }
  }

  function caseMapHostForDiv(div) {
    if (!div?.closest) return div || null;
    return (
      div.closest('[class*="guess-map_active__"]') ||
      div.closest('[class*="guess-map_guessMap__"]') ||
      div.closest('[class*="guess-map_size3__"]') ||
      div
    );
  }

  function caseMapIsActive(map) {
    try {
      const div = map?.getDiv?.();
      if (!div) return false;
      if (div.matches?.('[class*="guess-map_active__"]')) return true;
      const host = caseMapHostForDiv(div);
      if (host?.matches?.('[class*="guess-map_active__"]')) return true;
      const active = document.querySelector('[class*="guess-map_active__"]');
      return !!active && (active === div || active.contains(div) || div.contains(active));
    } catch {
      return false;
    }
  }

  function getCaseMap() {
    let bestMap = null;
    let bestScore = 0;
    let activeMap = null;
    let activeScore = 0;
    for (const entry of trackedCanvases.values()) {
      const score = caseMapVisibilityScore(entry);
      if (score > bestScore) {
        bestScore = score;
        bestMap = entry.map;
      }
      if (score > activeScore && caseMapIsActive(entry.map)) {
        activeScore = score;
        activeMap = entry.map;
      }
    }
    return activeMap || bestMap;
  }

  function focusCaseBounds(map, bounds) {
    if (!map || !bounds) return false;
    const maps = window.google?.maps;
    if (!maps?.LatLngBounds) return false;
    const north = Number(bounds.north);
    const south = Number(bounds.south);
    const west = Number(bounds.west);
    const east = Number(bounds.east);
    if (![north, south, west, east].every(Number.isFinite)) return false;
    try {
      if (north - south < 0.0005 && east - west < 0.0005) {
        map.panTo({ lat: north, lng: east });
        const zoom = Number(typeof map.getZoom === "function" ? map.getZoom() : NaN);
        if (!Number.isFinite(zoom) || zoom < 5) map.setZoom(5);
        return true;
      }
      const latLngBounds = new maps.LatLngBounds(
        { lat: south, lng: west },
        { lat: north, lng: east },
      );
      map.fitBounds(latLngBounds, { top: 64, right: 64, bottom: 64, left: 64 });
      return true;
    } catch (error) {
      debug("case map focus failed", error);
      return false;
    }
  }

  function focusCaseMap(map, hints) {
    if (!map || !hints.length) return false;
    let north = -85;
    let south = 85;
    let west = Infinity;
    let east = -Infinity;
    let count = 0;
    for (const hint of hints) {
      const bounds = caseHintBounds(hint, getCaseCountryIndex());
      if (!bounds) continue;
      if (bounds.north > north) north = bounds.north;
      if (bounds.south < south) south = bounds.south;
      if (bounds.west < west) west = bounds.west;
      if (bounds.east > east) east = bounds.east;
      count++;
    }
    if (!count) return false;
    return focusCaseBounds(map, { north, south, west, east });
  }

  function createCaseMarkerOverlay(map, hint) {
    const maps = window.google?.maps;
    const OverlayView = maps?.OverlayView;
    const payload = hint.payload;
    if (!OverlayView || !payload) return null;
    if (!Number.isFinite(Number(payload.lat)) || !Number.isFinite(Number(payload.lng))) return null;
    const root = el("div", "gg-case-mapMarker");
    root.style.setProperty(
      "--case-color",
      (CASE_RARITY_BY_ID.get(hint.rarity) || CASE_RARITIES[0]).color,
    );
    if (hint.overlay === "pin") {
      root.append(el("span", "gg-case-mapPulse"));
      root.appendChild(el("span", "gg-case-mapPin"));
    } else {
      root.appendChild(el("span", "gg-case-mapDot"));
    }
    const position = new maps.LatLng(Number(payload.lat), Number(payload.lng));
    class CaseMarkerOverlay extends OverlayView {
      constructor() {
        super();
        this.setMap(map);
      }
      onAdd() {
        const panes = this.getPanes();
        (panes?.overlayMouseTarget || panes?.overlayLayer || panes?.floatPane)?.appendChild(root);
      }
      onRemove() {
        root.remove();
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const pixel = projection.fromLatLngToDivPixel(position);
        if (!pixel) return;
        root.style.left = `${pixel.x}px`;
        root.style.top = `${pixel.y}px`;
      }
      remove() {
        this.setMap(null);
      }
    }
    return new CaseMarkerOverlay();
  }

  function caseRarityRgb(hint) {
    const color = (CASE_RARITY_BY_ID.get(hint?.rarity) || CASE_RARITIES[0]).color;
    const hex = String(color).replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return { r: 108, g: 185, b: 40 };
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  function compositeCaseColor(hints) {
    if (!hints?.length) return "rgb(108,185,40)";
    let r = 0;
    let g = 0;
    let b = 0;
    for (const hint of hints) {
      const rgb = caseRarityRgb(hint);
      r += rgb.r;
      g += rgb.g;
      b += rgb.b;
    }
    r = Math.round(r / hints.length);
    g = Math.round(g / hints.length);
    b = Math.round(b / hints.length);
    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (luminance < 105) {
      const lift = (105 - luminance) / 255;
      r = Math.round(r + (255 - r) * lift);
      g = Math.round(g + (255 - g) * lift);
      b = Math.round(b + (255 - b) * lift);
    }
    return `rgb(${r},${g},${b})`;
  }

  function compositeCaseRgba(hints, alpha) {
    const color = compositeCaseColor(hints);
    const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
    const rgb = match ? `${match[1]},${match[2]},${match[3]}` : "108,185,40";
    return `rgba(${rgb},${alpha})`;
  }

  function addCaseNativeCompositeOverlay(map, geometry) {
    const maps = window.google?.maps;
    if (!maps?.Polygon || !geometry?.polygons?.length) return;
    const color = compositeCaseColor(geometry.areaHints);
    for (const rings of geometry.polygons) {
      if (!rings?.length) continue;
      const paths = rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
      const shape = new maps.Polygon({
        map,
        paths,
        clickable: false,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 1.5,
        fillColor: color,
        fillOpacity: 0.36,
        zIndex: 18,
      });
      caseOverlays.push({ remove: () => shape.setMap(null) });
    }
  }

  function addCaseCompositeOverlay(map, plan) {
    const maps = window.google?.maps;
    const OverlayView = maps?.OverlayView;
    if (!OverlayView || !plan?.layers?.length) return null;
    const wrapper = el("div", "gg-case-compositeOverlay");
    const canvas = document.createElement("canvas");
    canvas.className = "gg-case-compositeCanvas";
    canvas.style.visibility = "hidden";
    wrapper.appendChild(canvas);
    let frame = 0;
    let disposed = false;
    let moving = false;
    let listeners = [];
    let hideListeners = [];
    let observer = null;
    let overlay = null;

    function schedule() {
      if (disposed || moving || frame) return;
      if (document.hidden) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        try {
          render();
        } catch (error) {
          debug("case composite render failed", error);
        }
      });
    }

    function hideComposite() {
      moving = true;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      canvas.style.visibility = "hidden";
    }

    function handleIdle() {
      moving = false;
      schedule();
    }

    function countryTouchesBounds(country, bounds) {
      if (!bounds) return true;
      const polygon = Core.mainPolygon(country);
      if (!polygon) return false;
      return !(
        polygon.maxLat < bounds.south ||
        polygon.minLat > bounds.north ||
        polygon.maxLng < bounds.west ||
        polygon.minLng > bounds.east
      );
    }

    function project(projection, lat, lng) {
      return projection.fromLatLngToContainerPixel(new maps.LatLng(Number(lat), Number(lng)));
    }

    function addRectPath(context, rect, projection) {
      const north = Number(rect.north);
      const south = Number(rect.south);
      const west = Number(rect.west);
      const east = Number(rect.east);
      if (![north, south, west, east].every(Number.isFinite)) return false;
      const corners = [
        project(projection, north, west),
        project(projection, north, east),
        project(projection, south, east),
        project(projection, south, west),
      ];
      if (corners.some((point) => !point)) return false;
      context.moveTo(corners[0].x, corners[0].y);
      for (let index = 1; index < corners.length; index++)
        context.lineTo(corners[index].x, corners[index].y);
      context.closePath();
      return true;
    }

    function addCountryPath(context, country, projection, mainOnly, filterBounds) {
      if (!countryTouchesBounds(country, filterBounds)) return false;
      const polygons = mainOnly ? [Core.mainPolygon(country)].filter(Boolean) : country.polygons;
      let added = false;
      for (const polygon of polygons) {
        for (const ring of polygon.rings) {
          if (!ring.length) continue;
          let started = false;
          for (const [lng, lat] of ring) {
            const point = project(projection, lat, lng);
            if (!point) continue;
            if (!started) {
              context.moveTo(point.x, point.y);
              started = true;
            } else {
              context.lineTo(point.x, point.y);
            }
          }
          if (started) {
            context.closePath();
            added = true;
          }
        }
      }
      return added;
    }

    function drawMaskLayer(context, layer, projection, filterBounds) {
      context.beginPath();
      let added = false;
      if (layer.kind === "countries") {
        for (const country of layer.countries) {
          if (addCountryPath(context, country, projection, layer.mainOnly, filterBounds))
            added = true;
        }
      } else if (layer.kind === "bands") {
        for (const rect of layer.rects) {
          if (addRectPath(context, rect, projection)) added = true;
        }
      } else if (layer.kind === "climate") {
        for (const region of layer.regions) {
          if (addRectPath(context, region, projection)) added = true;
        }
      } else if (layer.kind === "cell") {
        if (addRectPath(context, layer, projection)) added = true;
      } else if (layer.kind === "circle") {
        const center = project(projection, layer.lat, layer.lng);
        const north = project(projection, layer.lat + layer.radiusKm / 111.195, layer.lng);
        if (center && north) {
          const radius = Math.hypot(north.x - center.x, north.y - center.y);
          if (Number.isFinite(radius) && radius > 0) {
            context.moveTo(center.x + radius, center.y);
            context.arc(center.x, center.y, radius, 0, Math.PI * 2);
            added = true;
          }
        }
      }
      if (!added) return false;
      context.fillStyle = "#fff";
      context.fill("evenodd");
      return true;
    }

    function render() {
      if (disposed || !overlay) return;
      const projection = overlay.getProjection?.();
      if (!projection?.fromLatLngToContainerPixel) return;
      const div = map.getDiv?.();
      const width = Math.max(0, div?.clientWidth || 0);
      const height = Math.max(0, div?.clientHeight || 0);
      if (width < 8 || height < 8) return;
      const dpr = 1;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const center = map.getCenter?.();
      if (!center) return;
      const centerLat = typeof center.lat === "function" ? center.lat() : center.lat;
      const centerLng = typeof center.lng === "function" ? center.lng() : center.lng;
      const centerDiv = projection.fromLatLngToDivPixel(new maps.LatLng(centerLat, centerLng));
      if (!centerDiv) return;
      wrapper.style.left = `${centerDiv.x - width / 2}px`;
      wrapper.style.top = `${centerDiv.y - height / 2}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.style.visibility = "hidden";
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
      for (let index = 0; index < plan.layers.length; index++) {
        if (index > 0) context.globalCompositeOperation = "destination-in";
        if (!drawMaskLayer(context, plan.layers[index], projection, plan.bounds)) {
          return;
        }
      }
      context.globalCompositeOperation = "source-in";
      context.fillStyle = compositeCaseRgba(plan.areaHints, 0.36);
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
      canvas.style.visibility = "visible";
    }

    class CaseCompositeOverlay extends OverlayView {
      constructor() {
        super();
        this.setMap(map);
      }
      onAdd() {
        const panes = this.getPanes?.();
        const pane = panes?.overlayLayer || panes?.overlayMouseTarget;
        if (!pane) return;
        pane.appendChild(wrapper);
        listeners = [map.addListener("idle", handleIdle)];
        hideListeners = ["zoom_changed", "bounds_changed", "dragstart"].map((name) =>
          map.addListener(name, hideComposite),
        );
        window.addEventListener("resize", schedule);
        document.addEventListener("visibilitychange", schedule);
        if (typeof ResizeObserver === "function") {
          observer = new ResizeObserver(schedule);
          try {
            observer.observe(map.getDiv());
          } catch {
            observer = null;
          }
        }
        schedule();
      }
      onRemove() {
        disposed = true;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        for (const listener of listeners) {
          try {
            listener?.remove?.();
          } catch {
            // ignore
          }
        }
        listeners = [];
        for (const listener of hideListeners) {
          try {
            listener?.remove?.();
          } catch {
            // ignore
          }
        }
        hideListeners = [];
        window.removeEventListener("resize", schedule);
        document.removeEventListener("visibilitychange", schedule);
        observer?.disconnect();
        observer = null;
        wrapper.remove();
      }
      draw() {
        if (!moving) schedule();
      }
      remove() {
        this.setMap(null);
      }
    }

    try {
      overlay = new CaseCompositeOverlay();
    } catch (error) {
      debug("case composite overlay failed", error);
      wrapper.remove();
      return null;
    }
    return overlay;
  }

  function addCaseOverlay(map, hint) {
    const maps = window.google?.maps;
    if (!maps || !hint) return;
    const rarity = CASE_RARITY_BY_ID.get(hint.rarity) || CASE_RARITIES[0];
    const payload = hint.payload;
    if (hint.overlay === "outline") {
      const iso = typeof payload?.iso === "string" ? payload.iso.toLowerCase() : "";
      const country = getCaseCountryIndex().byIso.get(iso);
      if (!country) return;
      for (const polygon of country.polygons) {
        const paths = polygon.rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
        const shape = new maps.Polygon({
          map,
          paths,
          clickable: false,
          strokeColor: rarity.color,
          strokeOpacity: 0.98,
          strokeWeight: 2.4,
          fillColor: rarity.color,
          fillOpacity: 0.22,
          zIndex: 20,
        });
        caseOverlays.push({ remove: () => shape.setMap(null) });
      }
      return;
    }
    if (hint.overlay === "region" || hint.overlay === "category") {
      if (!payload) return;
      const broad = hint.overlay === "category";
      for (const country of getCaseCountryIndex().all) {
        if (!caseHintCountryMatches(country, payload)) continue;
        const polygons =
          broad && payload.mainOnly
            ? [Core.mainPolygon(country)].filter(Boolean)
            : country.polygons;
        for (const polygon of polygons) {
          const paths = polygon.rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
          const shape = new maps.Polygon({
            map,
            paths,
            clickable: false,
            strokeColor: rarity.color,
            strokeOpacity: broad ? 0.72 : 0.8,
            strokeWeight: broad ? 1.15 : 1.3,
            fillColor: rarity.color,
            fillOpacity: broad ? 0.16 : 0.17,
            zIndex: 17,
          });
          caseOverlays.push({ remove: () => shape.setMap(null) });
        }
      }
      return;
    }
    if (hint.overlay === "climate") {
      const regions = climateRegionsFor(payload?.label);
      if (!regions.length) return;
      for (const region of regions) {
        const shape = new maps.Polygon({
          map,
          paths: [
            { lat: region.north, lng: region.west },
            { lat: region.north, lng: region.east },
            { lat: region.south, lng: region.east },
            { lat: region.south, lng: region.west },
          ],
          clickable: false,
          strokeColor: rarity.color,
          strokeOpacity: 0.45,
          strokeWeight: 0.75,
          fillColor: rarity.color,
          fillOpacity: 0.15,
          zIndex: 16,
        });
        caseOverlays.push({ remove: () => shape.setMap(null) });
      }
      return;
    }
    if (
      hint.overlay === "hemisphere" ||
      hint.overlay === "longitude-half" ||
      hint.overlay === "tropical-band"
    ) {
      const bands = caseBandRects(hint);
      if (!bands.length) return;
      for (const band of bands) {
        const paths = [
          { lat: band.north, lng: band.west },
          { lat: band.north, lng: band.east },
          { lat: band.south, lng: band.east },
          { lat: band.south, lng: band.west },
        ];
        const shape = new maps.Polygon({
          map,
          paths,
          clickable: false,
          strokeColor: rarity.color,
          strokeOpacity: 0.98,
          strokeWeight: 2,
          fillColor: rarity.color,
          fillOpacity: 0.22,
          zIndex: 15,
        });
        caseOverlays.push({ remove: () => shape.setMap(null) });
      }
      return;
    }
    if (hint.overlay === "cell") {
      const north = Number(payload?.north);
      const south = Number(payload?.south);
      const west = Number(payload?.west);
      const east = Number(payload?.east);
      if (![north, south, west, east].every(Number.isFinite)) return;
      const shape = new maps.Polygon({
        map,
        paths: [
          { lat: north, lng: west },
          { lat: north, lng: east },
          { lat: south, lng: east },
          { lat: south, lng: west },
        ],
        clickable: false,
        strokeColor: rarity.color,
        strokeOpacity: 0.98,
        strokeWeight: 2,
        fillColor: rarity.color,
        fillOpacity: 0.22,
        zIndex: 19,
      });
      caseOverlays.push({ remove: () => shape.setMap(null) });
      return;
    }
    if (
      hint.overlay === "circle" &&
      Number.isFinite(Number(payload?.lat)) &&
      Number.isFinite(Number(payload?.lng))
    ) {
      const center = { lat: Number(payload.lat), lng: Number(payload.lng) };
      const radiusKm = Number(payload.radiusKm);
      const shape = new maps.Circle({
        map,
        center,
        radius: Number.isFinite(radiusKm) ? Math.max(250, radiusKm * 1000) : 1000,
        clickable: false,
        strokeColor: rarity.color,
        strokeOpacity: 0.98,
        strokeWeight: 2,
        fillColor: rarity.color,
        fillOpacity: 0.2,
        zIndex: 19,
      });
      caseOverlays.push({ remove: () => shape.setMap(null) });
      return;
    }
    if (hint.overlay === "center" || hint.overlay === "pin") {
      const marker = createCaseMarkerOverlay(map, hint);
      if (marker) caseOverlays.push(marker);
    }
  }

  function clearCaseOverlays(resetFocus = true) {
    for (const overlay of caseOverlays) {
      try {
        overlay.remove?.();
      } catch {
        // ignore
      }
    }
    caseOverlays = [];
    caseOverlayMap = null;
    caseOverlaySignature = "";
    caseOverlayBaseSignature = "";
    if (resetFocus) caseFocusedHintIds = new Set();
  }

  function refreshCaseOverlays() {
    const map = getCaseMap();
    syncCaseHintDrawer(map);
    if (!map) {
      clearCaseOverlays();
      return;
    }
    if (caseReelActive && !caseReelLanded) return;
    const visible = caseRound.hints.filter(
      (hint) => !caseHiddenHints.has(hint.id) && caseHintHasOverlay(hint),
    );
    const baseSignature = `${caseRound.key || ""}|${visible.map((hint) => `${hint.id}:${hint.overlay}`).join("|")}`;
    if (
      caseOverlayMap === map &&
      caseOverlayBaseSignature === baseSignature &&
      (caseOverlays.length > 0 || caseOverlaySignature.includes("-empty"))
    ) {
      return;
    }
    const visibleAreaHints = visible.filter(caseHintIsAreaHint);
    const composite = visibleAreaHints.length > 1;
    const geometry = composite ? caseCompositeGeometry(visible, getCaseCountryIndex()) : null;
    const areaPlan =
      geometry?.mode === "canvas" ? caseAreaFilterPlan(visible, getCaseCountryIndex()) : null;
    const signature = `${caseRound.key || ""}|${geometry ? `${geometry.mode}${geometry.empty ? "-empty" : ""}` : "I"}|${visible.map((hint) => `${hint.id}:${hint.overlay}`).join("|")}`;
    if (
      caseOverlayMap === map &&
      caseOverlaySignature === signature &&
      (caseOverlays.length > 0 || signature.includes("-empty"))
    ) {
      return;
    }
    const sameMap = caseOverlayMap === map;
    clearCaseOverlays(!sameMap);
    if (!visible.length) {
      caseFocusedHintIds.clear();
      return;
    }
    caseOverlayMap = map;
    caseOverlayBaseSignature = baseSignature;
    caseOverlaySignature = signature;
    const newlyFocused = visible.filter((hint) => !caseFocusedHintIds.has(hint.id));
    const individual = composite ? visible.filter((hint) => !caseHintIsAreaHint(hint)) : visible;
    for (const hint of individual) {
      try {
        addCaseOverlay(map, hint);
      } catch (error) {
        debug("case overlay failed", error);
      }
    }
    if (geometry?.mode === "native" && !geometry.empty) {
      try {
        addCaseNativeCompositeOverlay(map, geometry);
      } catch (error) {
        debug("case native composite overlay failed", error);
      }
    } else if (areaPlan?.layers.length) {
      try {
        const compositeOverlay = addCaseCompositeOverlay(map, areaPlan);
        if (compositeOverlay) caseOverlays.push(compositeOverlay);
      } catch (error) {
        debug("case composite overlay failed", error);
      }
    }
    if (newlyFocused.length) {
      if (composite) {
        let focusBounds = geometry?.mode === "native" ? geometry.bounds : areaPlan?.bounds;
        for (const hint of newlyFocused) {
          if (caseHintIsAreaHint(hint)) continue;
          const bounds = caseHintBounds(hint, getCaseCountryIndex());
          if (!bounds) continue;
          focusBounds = focusBounds
            ? {
                north: Math.max(focusBounds.north, bounds.north),
                south: Math.min(focusBounds.south, bounds.south),
                west: Math.min(focusBounds.west, bounds.west),
                east: Math.max(focusBounds.east, bounds.east),
              }
            : bounds;
        }
        if (focusBounds) focusCaseBounds(map, focusBounds);
      } else {
        focusCaseMap(map, newlyFocused);
      }
      for (const hint of newlyFocused) caseFocusedHintIds.add(hint.id);
    }
  }

  function caseOverlayDiagnostics() {
    let trackedMaps = 0;
    let visibleMaps = 0;
    let selectedMapArea = 0;
    for (const entry of trackedCanvases.values()) {
      trackedMaps++;
      const score = caseMapVisibilityScore(entry);
      if (score > 0) visibleMaps++;
      if (entry.map === caseOverlayMap) selectedMapArea = score;
    }
    return {
      trackedMaps,
      visibleMaps,
      selectedMap: !!caseOverlayMap,
      selectedMapArea: Math.round(selectedMapArea),
      overlays: caseOverlays.length,
      activeMap: caseOverlayMap ? caseMapIsActive(caseOverlayMap) : false,
      drawer: !document.getElementById(GG_CASE_HINT_DRAWER_ID)?.hidden,
      focusedHints: [...caseFocusedHintIds],
      spatialHints: caseRound.hints
        .filter((hint) => caseHintHasOverlay(hint))
        .map((hint) => hint.id),
    };
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function countryName(iso) {
    const feature = COUNTRY_DATA.find((item) => item.iso === iso);
    return feature ? feature.name : iso.toUpperCase();
  }

  function countryListControl(context: CustomControlContext<GeogambleConfig>): () => void {
    const key = context.key as "enabledCountries" | "excludeCountries";
    const native = context.nativeClasses;
    const wrap = el("div", "gg-countryList");
    const allRow = el("div", "gg-countryAllRow");
    const allLabel = el("span", native.rowLabel || "gg-countryAllLabel", "All countries");
    const allControl = el("div", "gg-countryAllControl");
    const allToggle = el("label", native.toggle || "ggk-toggle");
    const allInput = el("input", native.toggleInput || "ggk-toggleInput") as HTMLInputElement;
    allInput.type = "checkbox";
    if (native.toggleInput) allInput.setAttribute("role", "switch");
    allToggle.append(allInput);
    if (!native.toggle) allToggle.append(el("span", "ggk-switch"));
    const allState = native.rowState ? el("span", native.rowState) : null;
    allControl.append(allToggle);
    if (allState) allControl.append(allState);
    allRow.append(allLabel, allControl);
    if (key !== "enabledCountries") allRow.hidden = true;
    const chips = el("div", "gg-countryChips");
    const input = document.createElement("input");
    input.type = "search";
    input.className = "gg-countrySearch";
    input.placeholder = "Type a country name or ISO code";
    const dropdown = el("div", "gg-countryDropdown");
    dropdown.hidden = true;
    wrap.append(allRow, chips, input, dropdown);

    const current = () => {
      const value = context.config.get(key);
      return Array.isArray(value) ? value : [];
    };
    const apply = (value: CountrySelection | string[]) => {
      context.config.set(key, value as never);
    };
    const add = (iso) => {
      if (key === "enabledCountries" && context.config.get(key) === "all") apply([]);
      const values = current();
      if (!values.includes(iso)) apply([...values, iso]);
      input.value = "";
      dropdown.hidden = true;
      input.focus();
    };
    const render = () => {
      const value = context.config.get(key);
      const isAll = value === "all";
      allInput.checked = isAll;
      if (allState) allState.textContent = isAll ? "On" : "Off";
      input.hidden = isAll;
      chips.textContent = "";
      if (isAll) {
        chips.append(el("span", "gg-countryEmpty", "Every country is enabled."));
      } else if (!value.length) {
        chips.append(
          el(
            "span",
            "gg-countryEmpty",
            key === "excludeCountries" ? "No excluded countries." : "No countries enabled.",
          ),
        );
      } else {
        for (const iso of value) {
          const chip = el("span", "gg-countryChip");
          chip.append(
            el("span", null, countryName(iso)),
            el("span", "gg-countryIso", iso.toUpperCase()),
          );
          const remove = el("button", "gg-countryRemove", "×");
          remove.type = "button";
          remove.addEventListener("mousedown", (event) => {
            event.preventDefault();
            apply(current().filter((item) => item !== iso));
          });
          chip.append(remove);
          chips.append(chip);
        }
      }
    };
    const renderOptions = () => {
      const queryText = input.value.trim().toLowerCase();
      const options = filterCountryOptions(COUNTRY_DATA, queryText, {
        exclude: current(),
        limit: 8,
      });
      dropdown.textContent = "";
      if (!options.length) {
        dropdown.append(el("div", "gg-countryEmpty", "No matching country."));
      } else {
        for (const feature of options) {
          const option = el(
            "label",
            native.toggle ? `${native.toggle} gg-countryToggleRow` : "gg-countryToggleRow",
          );
          const check = el("input", native.toggleInput || "gg-countryCheck") as HTMLInputElement;
          check.type = "checkbox";
          check.addEventListener("change", () => {
            if (check.checked) add(feature.iso);
          });
          option.append(
            check,
            el("span", "gg-countryName", feature.name),
            el("span", "gg-countryIso", feature.iso.toUpperCase()),
          );
          dropdown.append(option);
        }
      }
      dropdown.hidden = false;
    };

    allInput.addEventListener("change", () => apply(allInput.checked ? "all" : []));
    input.addEventListener("focus", renderOptions);
    input.addEventListener("input", renderOptions);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") dropdown.hidden = true;
      if (event.key === "Enter") {
        event.preventDefault();
        dropdown.querySelector<HTMLElement>(".gg-countryToggleRow")?.click();
      }
    });
    input.addEventListener("blur", () =>
      setTimeout(() => {
        dropdown.hidden = true;
      }, 120),
    );
    context.root.append(wrap);
    const unsubscribe = context.config.subscribe(render, [key]);
    render();
    return () => {
      unsubscribe();
      wrap.remove();
    };
  }

  injectStyle(
    "gg-geogamble-country-style",
    `
    .gg-countryList { display:flex; flex-direction:column; gap:6px; min-width:260px; }
    .gg-countryAllRow { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .gg-countryAllLabel, .gg-countryName { font:500 12px/1.2 var(--default-font, sans-serif); }
    .gg-countryAllControl { display:flex; align-items:center; gap:6px; }
    .gg-countryToggleRow { display:flex; align-items:center; gap:7px; padding:6px; border-radius:6px; cursor:pointer; }
    .gg-countryToggleRow:hover { background:rgba(255,255,255,.08); }
    .gg-countryCheck { width:16px; height:16px; accent-color:#7952e9; }
    .gg-countryChips { display:flex; flex-wrap:wrap; gap:5px; }
    .gg-countryChip { display:inline-flex; align-items:center; gap:5px; padding:4px 7px; border:1px solid rgba(255,255,255,.16); border-radius:999px; background:rgba(255,255,255,.06); font:600 11px/1.2 var(--default-font, sans-serif); }
    .gg-countryIso { opacity:.55; font-size:9px; }
    .gg-countryRemove { border:0; background:transparent; color:inherit; cursor:pointer; padding:0 0 0 2px; }
    .gg-countrySearch { padding:7px 9px; border:1px solid rgba(255,255,255,.18); border-radius:7px; background:rgba(0,0,0,.25); color:inherit; font:inherit; }
    .gg-countryDropdown { display:flex; flex-direction:column; gap:2px; max-height:220px; overflow:auto; padding:4px; border:1px solid rgba(255,255,255,.14); border-radius:8px; background:#171725; }
    .gg-countryOption { display:flex; justify-content:space-between; gap:10px; padding:7px 8px; border:0; border-radius:5px; background:transparent; color:inherit; text-align:left; cursor:pointer; }
    .gg-countryOption:hover { background:rgba(255,255,255,.1); }
    .gg-countryEmpty { opacity:.55; padding:4px 2px; font:400 11px/1.3 var(--default-font, sans-serif); }
  `,
  );

  function closestGuessMapCanvas(element) {
    return element?.closest(GUESS_MAP_CANVAS_SELECTORS) || null;
  }

  function findCanvases(scope = document) {
    return Array.from(scope.querySelectorAll(GUESS_MAP_CANVAS_SELECTORS));
  }

  function mapDivInside(map, canvas) {
    try {
      const div = map.getDiv();
      return !!div && (div === canvas || canvas.contains(div) || div.contains(canvas));
    } catch {
      return false;
    }
  }

  function isExcludedMapProps(props) {
    if (!props) return false;
    if (props.regionType || props.onRegionSelected) return true;
    if (props.selectedRegion !== undefined && props.setSelectedRegion) return true;
    if (props.mapType === "country" && (props.regionName || props.countryStreak)) return true;
    return false;
  }

  function isMarkerMapProps(props) {
    return (
      !!props &&
      (props.markerLocation !== undefined ||
        props.validateGuesses !== undefined ||
        props.onPinMount !== undefined)
    );
  }

  function isGuessMapProps(props) {
    if (!props) return false;
    return (
      isMarkerMapProps(props) ||
      typeof props.onMapClick === "function" ||
      typeof props.onPlacedPin === "function" ||
      typeof props.onRemovedPin === "function"
    );
  }

  function installStaticHook() {
    if (staticHookInstalled) return;
    const eventApi = window.google?.maps?.event;
    if (!eventApi || typeof eventApi.addListener !== "function") return;
    const original = eventApi.addListener;
    try {
      eventApi.addListener = function (instance, name, handler, ...rest) {
        const gate = trackedMaps.get(instance);
        if (name === "click" && gate && typeof handler === "function") {
          if (handler.__geogambleWrapped && handler.__geogambleGate !== gate)
            handler = unwrapClickHandler(handler);
          handler = gate.wrap(handler);
        }
        return original.call(this, instance, name, handler, ...rest);
      };
      staticHookInstalled = true;
    } catch (error) {
      debug("static addListener hook failed", error);
    }
  }

  function patchMapAddListener(map) {
    if (map.__geogambleAddListenerPatched) return;
    const original = map.addListener;
    if (typeof original !== "function") return;
    try {
      map.addListener = function (name, handler, ...rest) {
        const gate = trackedMaps.get(this) || trackedMaps.get(map);
        if (name === "click" && gate && typeof handler === "function") {
          if (handler.__geogambleWrapped && handler.__geogambleGate !== gate)
            handler = unwrapClickHandler(handler);
          handler = gate.wrap(handler);
        }
        return original.call(this, name, handler, ...rest);
      };
      if (typeof map.addListenerOnce === "function") {
        const originalOnce = map.addListenerOnce;
        map.addListenerOnce = function (name, handler, ...rest) {
          const gate = trackedMaps.get(this) || trackedMaps.get(map);
          if (name === "click" && gate && typeof handler === "function") {
            if (handler.__geogambleWrapped && handler.__geogambleGate !== gate)
              handler = unwrapClickHandler(handler);
            handler = gate.wrap(handler);
          }
          return originalOnce.call(this, name, handler, ...rest);
        };
      }
      map.__geogambleAddListenerPatched = true;
    } catch (error) {
      debug("map addListener hook failed", error);
    }
  }

  function wrapExistingClickHandlers(map, gate) {
    const click = map.__e3_?.click;
    if (!click) return 0;
    let count = 0;
    for (const entry of Object.values(click)) {
      if (!entry || typeof entry.zo !== "function") continue;
      try {
        let handler = entry.zo;
        if (handler.__geogambleWrapped && handler.__geogambleGate === gate) continue;
        if (handler.__geogambleWrapped) handler = unwrapClickHandler(handler);
        const wrapped = gate.wrap(handler);
        if (wrapped !== entry.zo) {
          entry.zo = wrapped;
          count++;
        }
      } catch (error) {
        debug("handler wrap failed", error);
      }
    }
    return count;
  }

  function canGamble(canvas, map) {
    try {
      return canvas.isConnected && !!map.getDiv()?.isConnected;
    } catch {
      return false;
    }
  }

  function cleanupEntry(entry) {
    if (!entry) return;
    handleCaseMapRemoved(entry.map);
    if (entry.animation) {
      entry.animation.cancel();
      entry.animation = null;
    }
    if (entry.overlay) {
      entry.overlay.remove();
      entry.overlay = null;
    }
    if (entry.heatmapOverlay) {
      entry.heatmapOverlay.remove();
      entry.heatmapOverlay = null;
    }
  }

  function getAudioContext() {
    if (!settings.sound) return null;
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        audioContext = new AudioCtor();
        masterGain = audioContext.createGain();
        masterGain.gain.value = settings.volume;
        masterGain.connect(audioContext.destination);
      } catch (error) {
        debug("audio unavailable", error);
        audioContext = null;
        masterGain = null;
        return null;
      }
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function playTick(progress) {
    const context = getAudioContext();
    if (!context || !masterGain) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(420 + 520 * clamp(progress, 0, 1), now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.07);
  }

  function playFinal() {
    const context = getAudioContext();
    if (!context || !masterGain) return;
    const now = context.currentTime;
    for (const [index, frequency] of [660, 990].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.055;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
    }
  }

  function playCaseReelTick(progress, step) {
    const context = getAudioContext();
    if (!context || !masterGain) return;
    const now = context.currentTime;
    const position = clamp(progress, 0, 1);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(480 + 640 * position + (step % 2 ? 44 : 0), now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.06);
  }

  function playCaseLanding() {
    const context = getAudioContext();
    if (!context || !masterGain) return;
    const now = context.currentTime;
    for (const [index, frequency] of [110, 165].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.025;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.065, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
    }
  }

  function playCaseReveal(rarityId) {
    const context = getAudioContext();
    if (!context || !masterGain) return;
    const now = context.currentTime;
    const rarity = CASE_RARITY_BY_ID.get(rarityId) || CASE_RARITIES[0];
    const notes = [523.25, 659.25, 783.99, 1046.5].map(
      (frequency) => frequency * 2 ** (rarity.rank / 36),
    );
    for (const [index, frequency] of notes.entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.06;
      oscillator.type = index < 2 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.065, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(start);
      oscillator.stop(start + 0.52);
    }
    const low = context.createOscillator();
    const lowGain = context.createGain();
    low.type = "sine";
    low.frequency.setValueAtTime(130.81, now);
    lowGain.gain.setValueAtTime(0.0001, now);
    lowGain.gain.exponentialRampToValueAtTime(0.055, now + 0.025);
    lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    low.connect(lowGain);
    lowGain.connect(masterGain);
    low.start(now);
    low.stop(now + 0.38);
  }

  function createHeatmapOverlay(map) {
    const maps = window.google?.maps;
    const OverlayView = maps?.OverlayView;
    if (!OverlayView) return null;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;";
    let frame = 0;
    let disposed = false;
    let listeners = [];
    let observer = null;
    let overlay = null;

    function schedule() {
      if (disposed || frame) return;
      if (document.hidden) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        try {
          render();
        } catch (error) {
          debug("heatmap render failed", error);
        }
      });
    }

    function onMapChange() {
      schedule();
    }

    function projectY(projection, lat, referenceLng) {
      const latLng = new maps.LatLng(lat, referenceLng);
      const pixel = projection.fromLatLngToContainerPixel(latLng);
      return pixel && Number.isFinite(pixel.y) ? pixel.y : NaN;
    }

    function projectPolygon(projection, polygon, view) {
      const rings = [];
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const ring of polygon.rings) {
        if (!ring.length) continue;
        const reference = ring[0][0];
        const offset = unwrapLng(reference, view.centerLng) - reference;
        const points = [];
        for (const [lng, lat] of ring) {
          const x =
            view.baseX + (unwrapLng(lng, reference) + offset - view.centerLng) * view.pixelsPerLng;
          const y = projectY(projection, lat, view.centerLng);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          points.push({ x, y });
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
        if (points.length) rings.push(points);
      }
      if (!rings.length || !Number.isFinite(left)) return null;
      return { rings, left, top, right, bottom };
    }

    function tracePath(context, projected) {
      context.beginPath();
      for (const ring of projected.rings) {
        if (!ring.length) continue;
        context.moveTo(ring[0].x, ring[0].y);
        for (let i = 1; i < ring.length; i++) context.lineTo(ring[i].x, ring[i].y);
        context.closePath();
      }
    }

    function colorizeRaster(raster, max) {
      const offscreen = document.createElement("canvas");
      offscreen.width = raster.width;
      offscreen.height = raster.height;
      const context = offscreen.getContext("2d");
      if (!context || max <= 0) return null;
      const image = context.createImageData(raster.width, raster.height);
      for (let index = 0; index < raster.data.length; index++) {
        const weight = raster.data[index];
        if (weight <= 0) continue;
        const [r, g, b, a] = heatmapColor(Math.sqrt(clamp(weight / max, 0, 1)));
        const offset = index * 4;
        image.data[offset] = Math.round(r);
        image.data[offset + 1] = Math.round(g);
        image.data[offset + 2] = Math.round(b);
        image.data[offset + 3] = Math.round(a * 255);
      }
      context.putImageData(image, 0, 0);
      return offscreen;
    }

    function drawMarkers(context, projection, view, labels) {
      const zoom = typeof map.getZoom === "function" ? map.getZoom() : 0;
      for (const country of index.selected) {
        const footprint = heatmapFootprint(country);
        if (!footprint) continue;
        const x =
          view.baseX +
          (unwrapLng(footprint.center.lng, view.centerLng) - view.centerLng) * view.pixelsPerLng;
        const y = projectY(projection, footprint.center.lat, view.centerLng);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < -10 || y < -10 || x > view.width + 10 || y > view.height + 10) continue;
        context.save();
        context.beginPath();
        context.arc(x, y, 5.2, 0, Math.PI * 2);
        context.fillStyle = "rgba(0,0,0,.72)";
        context.fill();
        context.beginPath();
        context.arc(x, y, 3.4, 0, Math.PI * 2);
        context.fillStyle = "#fff";
        context.fill();
        if (country.mainOnly === false) {
          context.beginPath();
          context.arc(x, y, 7.6, 0, Math.PI * 2);
          context.strokeStyle = "rgba(48,224,255,.95)";
          context.lineWidth = 1.5;
          context.stroke();
        }
        const bounds = labels.get(country);
        if (
          zoom >= 5 &&
          bounds &&
          bounds.right - bounds.left >= 90 &&
          bounds.bottom - bounds.top >= 50
        ) {
          context.font = "600 11px system-ui,sans-serif";
          context.textAlign = "left";
          context.textBaseline = "bottom";
          context.lineWidth = 3;
          context.strokeStyle = "rgba(0,0,0,.72)";
          context.strokeText(country.iso.toUpperCase(), x + 8, y - 5);
          context.fillStyle = "#fff";
          context.fillText(country.iso.toUpperCase(), x + 8, y - 5);
        }
        context.restore();
      }
    }

    function render() {
      if (disposed || !settings.heatmapOverlay) return;
      const projection = overlay?.getProjection?.();
      if (!projection) return;
      const div = map.getDiv?.();
      const width = Math.max(0, div?.clientWidth || 0);
      const height = Math.max(0, div?.clientHeight || 0);
      if (width < 8 || height < 8) return;
      const dpr = 1;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const center = map.getCenter?.();
      if (!center) return;
      const centerLat = typeof center.lat === "function" ? center.lat() : center.lat;
      const centerLng = normalizeLng(typeof center.lng === "function" ? center.lng() : center.lng);
      const centerDiv = projection.fromLatLngToDivPixel(center);
      const base = projection.fromLatLngToContainerPixel(center);
      if (!centerDiv || !base) return;
      canvas.style.left = `${centerDiv.x - width / 2}px`;
      canvas.style.top = `${centerDiv.y - height / 2}px`;

      const zoom = typeof map.getZoom === "function" ? map.getZoom() : NaN;
      let pixelsPerLng = Number.isFinite(zoom) ? (256 * 2 ** zoom) / 360 : 0;
      if (!Number.isFinite(pixelsPerLng) || pixelsPerLng <= 0) {
        const probeLng = normalizeLng(centerLng + 0.01);
        const probe = projection.fromLatLngToContainerPixel(new maps.LatLng(centerLat, probeLng));
        if (!probe) return;
        const deltaLng = unwrapLng(probeLng, centerLng) - centerLng;
        pixelsPerLng = (probe.x - base.x) / (deltaLng || 0.01);
      }
      if (!Number.isFinite(pixelsPerLng) || Math.abs(pixelsPerLng) < 1e-9) return;

      const view = { width, height, baseX: base.x, centerLng, pixelsPerLng };
      const bias = settings.centerBias;
      const labels = new Map();
      let globalBudget = 450000;

      for (const country of index.selected) {
        const footprint = heatmapFootprint(country);
        if (!footprint) continue;
        let countryBounds = null;
        const pieces = [];
        let countryMax = 0;

        if (bias > 0 && bias < 1) {
          let countryBudget = 2600;
          const polygons = [...country.polygons].sort((a, b) => b.area - a.area);
          for (const polygon of polygons) {
            if (polygon.minLat <= -84 || polygon.maxLat >= 84) continue;
            const projected = projectPolygon(projection, polygon, view);
            if (!projected) continue;
            if (
              projected.right < -2 ||
              projected.left > width + 2 ||
              projected.bottom < -2 ||
              projected.top > height + 2
            )
              continue;
            const left = Math.max(0, Math.floor(projected.left));
            const top = Math.max(0, Math.floor(projected.top));
            const right = Math.min(width, Math.ceil(projected.right));
            const bottom = Math.min(height, Math.ceil(projected.bottom));
            const rasterWidth = right - left;
            const rasterHeight = bottom - top;
            if (rasterWidth < 3 || rasterHeight < 3) continue;
            let columns = clamp(Math.ceil(rasterWidth / 8), 4, 72);
            let rows = clamp(Math.ceil(rasterHeight / 8), 4, 72);
            const allowance = Math.min(countryBudget, globalBudget);
            if (allowance < 16) break;
            if (columns * rows > allowance) {
              const scale = Math.sqrt(allowance / (columns * rows));
              columns = Math.max(2, Math.floor(columns * scale));
              rows = Math.max(2, Math.floor(rows * scale));
            }
            const cells = columns * rows;
            if (cells < 4) break;
            countryBudget -= cells;
            globalBudget -= cells;
            const cellWidth = rasterWidth / columns;
            const cellHeight = rasterHeight / rows;
            const lats = new Float64Array(rows);
            for (let row = 0; row < rows; row++) {
              const latLng = projection.fromContainerPixelToLatLng(
                new maps.Point(width / 2, top + (row + 0.5) * cellHeight),
              );
              lats[row] = latLng
                ? typeof latLng.lat === "function"
                  ? latLng.lat()
                  : latLng.lat
                : NaN;
            }
            const pointAt = (column, row) => {
              const lat = lats[row];
              if (!Number.isFinite(lat)) return null;
              const lng = centerLng + (left + (column + 0.5) * cellWidth - base.x) / pixelsPerLng;
              return { lat, lng };
            };
            const raster = buildHeatmapRaster({
              polygon,
              footprint,
              bias,
              width: columns,
              height: rows,
              pointAt,
            });
            if (raster.max > 0)
              pieces.push({
                projected,
                raster,
                left,
                top,
                width: rasterWidth,
                height: rasterHeight,
              });
            if (raster.max > countryMax) countryMax = raster.max;
            if (!countryBounds)
              countryBounds = {
                left: projected.left,
                top: projected.top,
                right: projected.right,
                bottom: projected.bottom,
              };
            else {
              countryBounds.left = Math.min(countryBounds.left, projected.left);
              countryBounds.top = Math.min(countryBounds.top, projected.top);
              countryBounds.right = Math.max(countryBounds.right, projected.right);
              countryBounds.bottom = Math.max(countryBounds.bottom, projected.bottom);
            }
          }
          for (const piece of pieces) {
            const image = colorizeRaster(piece.raster, countryMax);
            if (!image) continue;
            context.save();
            tracePath(context, piece.projected);
            context.clip("evenodd");
            context.imageSmoothingEnabled = true;
            context.drawImage(image, piece.left, piece.top, piece.width, piece.height);
            context.restore();
          }
        } else if (bias <= 0) {
          for (const polygon of country.polygons) {
            if (polygon.minLat <= -84 || polygon.maxLat >= 84) continue;
            const projected = projectPolygon(projection, polygon, view);
            if (!projected) continue;
            if (
              projected.right < 0 ||
              projected.left > width ||
              projected.bottom < 0 ||
              projected.top > height
            )
              continue;
            context.save();
            tracePath(context, projected);
            context.clip("evenodd");
            context.fillStyle = HEATMAP_UNIFORM_COLOR;
            context.fillRect(0, 0, width, height);
            context.restore();
            if (!countryBounds)
              countryBounds = {
                left: projected.left,
                top: projected.top,
                right: projected.right,
                bottom: projected.bottom,
              };
            else {
              countryBounds.left = Math.min(countryBounds.left, projected.left);
              countryBounds.top = Math.min(countryBounds.top, projected.top);
              countryBounds.right = Math.max(countryBounds.right, projected.right);
              countryBounds.bottom = Math.max(countryBounds.bottom, projected.bottom);
            }
          }
        }

        if (countryBounds) labels.set(country, countryBounds);
      }

      drawMarkers(context, projection, view, labels);
    }

    class HeatmapOverlay extends OverlayView {
      constructor() {
        super();
        this.setMap(map);
      }

      onAdd() {
        const panes = this.getPanes?.();
        const pane = panes?.overlayLayer || panes?.overlayMouseTarget;
        if (!pane) return;
        pane.appendChild(canvas);
        listeners = ["idle", "bounds_changed", "zoom_changed"].map((name) =>
          map.addListener(name, onMapChange),
        );
        window.addEventListener("resize", onMapChange);
        document.addEventListener("visibilitychange", onMapChange);
        if (typeof ResizeObserver === "function") {
          observer = new ResizeObserver(onMapChange);
          try {
            observer.observe(map.getDiv());
          } catch {
            observer = null;
          }
        }
        schedule();
      }

      onRemove() {
        disposed = true;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        for (const listener of listeners) {
          try {
            listener?.remove?.();
          } catch {
            // ignore
          }
        }
        listeners = [];
        window.removeEventListener("resize", onMapChange);
        document.removeEventListener("visibilitychange", onMapChange);
        observer?.disconnect();
        observer = null;
        canvas.remove();
      }

      draw() {
        schedule();
      }

      refresh() {
        schedule();
      }

      remove() {
        this.setMap(null);
      }
    }

    try {
      overlay = new HeatmapOverlay();
    } catch (error) {
      debug("heatmap overlay failed", error);
      canvas.remove();
      return null;
    }
    return overlay;
  }

  function syncHeatmapOverlays() {
    for (const entry of trackedCanvases.values()) {
      if (!settings.heatmapOverlay) {
        if (entry.heatmapOverlay) {
          entry.heatmapOverlay.remove();
          entry.heatmapOverlay = null;
        }
        continue;
      }
      if (!entry.heatmapOverlay) entry.heatmapOverlay = createHeatmapOverlay(entry.map);
      else entry.heatmapOverlay.refresh();
    }
  }

  function createPinOverlay(map) {
    const OverlayView = window.google.maps.OverlayView;
    const root = document.createElement("div");
    root.style.cssText =
      "position:absolute;width:0;height:0;pointer-events:none;z-index:2147483647;transition:left 55ms linear,top 55ms linear;";
    const ripple = document.createElement("div");
    ripple.style.cssText =
      "position:absolute;left:-12px;top:-12px;width:24px;height:24px;border:2px solid rgba(255,90,54,.9);border-radius:50%;opacity:0;pointer-events:none;";
    const tail = document.createElement("div");
    tail.style.cssText =
      "position:absolute;left:-6px;top:-12px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:12px solid #d92323;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35));";
    const head = document.createElement("div");
    head.style.cssText =
      "position:absolute;left:-17px;top:-44px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#ff6a3d,#d92323);border:3px solid #fff;box-shadow:0 5px 14px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 18px/1 system-ui,sans-serif;transform-origin:50% 100%;";
    head.textContent = "?";
    root.append(ripple, tail, head);

    class PinOverlay extends OverlayView {
      constructor() {
        super();
        this.position = null;
        this.setMap(map);
      }

      onAdd() {
        this.getPanes().overlayMouseTarget.appendChild(root);
      }

      onRemove() {
        root.remove();
      }

      draw() {
        if (!this.position) return;
        const projection = this.getProjection();
        if (!projection) return;
        const pixel = projection.fromLatLngToDivPixel(this.position);
        if (!pixel) return;
        root.style.left = `${pixel.x}px`;
        root.style.top = `${pixel.y}px`;
      }

      setPosition(point) {
        if (!point) return;
        this.position = new window.google.maps.LatLng(point.lat, point.lng);
        this.draw();
        if (typeof ripple.animate === "function") {
          ripple.animate(
            [
              { transform: "scale(.45)", opacity: 0.9 },
              { transform: "scale(1.9)", opacity: 0 },
            ],
            { duration: 360, easing: "ease-out" },
          );
        }
        if (typeof head.animate === "function") {
          head.animate(
            [
              { transform: "rotate(-7deg)" },
              { transform: "rotate(7deg)" },
              { transform: "rotate(0deg)" },
            ],
            { duration: 130, easing: "ease-out" },
          );
        }
      }

      project(latLng) {
        const projection = this.getProjection();
        if (!projection) return null;
        try {
          return projection.fromLatLngToContainerPixel(latLng);
        } catch {
          return null;
        }
      }

      remove() {
        this.setMap(null);
      }
    }

    return new PinOverlay();
  }

  function startGamble({ map, event, hit, finalPoint, entry }) {
    cleanupEntry(entry);
    try {
      const overlay = createPinOverlay(map);
      const clickPoint = {
        lat: typeof event.latLng.lat === "function" ? event.latLng.lat() : event.latLng.lat,
        lng: typeof event.latLng.lng === "function" ? event.latLng.lng() : event.latLng.lng,
      };
      overlay.setPosition(clickPoint);
      entry.overlay = overlay;
      const placeFinal = () => {
        if (!canGamble(entry.canvas, map)) {
          cleanupEntry(entry);
          entry.gate.cancel();
          return;
        }
        playFinal();
        const finalLatLng = new window.google.maps.LatLng(finalPoint.lat, finalPoint.lng);
        const projected = overlay.project(finalLatLng);
        const pixel = projected ? { x: projected.x, y: projected.y } : null;
        const jj =
          pixel && event.jj && typeof event.jj === "object" ? { x: pixel.x, y: pixel.y } : null;
        const finalEvent = makeFinalEvent(event, finalLatLng, pixel, jj);
        cleanupEntry(entry);
        entry.gate.finish(finalEvent);
      };
      if (shouldSkipAnimation(settings.centerBias)) {
        placeFinal();
        return;
      }
      getAudioContext();
      playTick(0);
      let hopPlonkPoint = null;
      const animation = runAnimation({
        country: hit.country,
        finalPoint,
        settings,
        onTick: (point, progress) => {
          overlay.setPosition(point);
          playTick(progress);
          if (
            settings.duelSubmitHop &&
            point &&
            !(hopPlonkPoint && hopPlonkPoint.lat === point.lat && hopPlonkPoint.lng === point.lng)
          ) {
            hopPlonkPoint = point;
            sendDuelPin(point);
          }
        },
        onDone: placeFinal,
        onError: (error) => {
          debug("animation error", error);
          cleanupEntry(entry);
          if (canGamble(entry.canvas, map)) entry.gate.failOpen(event);
          else entry.gate.cancel();
        },
        isAlive: () => canGamble(entry.canvas, map),
      });
      if (entry.gate.isActive()) entry.animation = animation;
      else animation.cancel();
    } catch (error) {
      cleanupEntry(entry);
      throw error;
    }
  }

  function submitGuess(map) {
    const canvas = closestGuessMapCanvas(map.getDiv());
    const root = canvas?.closest('[data-qa="guess-map"]') || document;
    let attempts = 0;
    function attempt() {
      const button =
        root.querySelector('[data-qa="perform-guess"]') ||
        document.querySelector('[data-qa="perform-guess"]');
      if (!button) {
        if (attempts++ < 6) setTimeout(attempt, 150);
        return;
      }
      if (button.disabled || button.getAttribute("aria-disabled") === "true") {
        if (attempts++ < 10) setTimeout(attempt, 150);
        return;
      }
      try {
        button.click();
        debug("guess submitted");
      } catch (error) {
        debug("guess submit failed", error);
      }
    }
    setTimeout(attempt, settings.submitDelayMs);
  }

  function attachToCanvas(canvas) {
    const existing = trackedCanvases.get(canvas);
    if (existing) {
      if (mapDivInside(existing.map, canvas)) {
        wrapExistingClickHandlers(existing.map, existing.gate);
        return existing;
      }
      cleanupEntry(existing);
      existing.gate.cancel();
      trackedCanvases.delete(canvas);
      trackedMaps.delete(existing.map);
    }
    const found = findGoogleMapForCanvas(canvas, {
      allowOtherModes: settings.allowOtherModes,
      isExcludedProps: isExcludedMapProps,
      isGuessMapProps: isGuessMapProps,
    });
    if (!found) return null;
    const entry = {
      canvas,
      map: found.map,
      gate: null,
      animation: null,
      overlay: null,
      heatmapOverlay: null,
      wrapped: 0,
    };
    const gate = createClickGate({
      map: found.map,
      settings,
      index,
      onStart: (info) => startGamble({ ...info, entry }),
      onGamblePoint: (point) => {
        if (settings.duelSubmitPin) sendDuelPin(point);
      },
      onFinish: () => {
        if (settings.autoSubmit) submitGuess(found.map);
      },
      trigger: (map, event) => window.google.maps.event.trigger(map, "click", event),
      canStart: () => canGamble(canvas, found.map),
      debug,
    });
    entry.gate = gate;
    trackedMaps.set(found.map, gate);
    patchMapAddListener(found.map);
    if (settings.heatmapOverlay) entry.heatmapOverlay = createHeatmapOverlay(found.map);
    entry.wrapped = wrapExistingClickHandlers(found.map, gate);
    trackedCanvases.set(canvas, entry);
    debug("attached", found.map, "handlers", entry.wrapped, "props", found.props);
    return entry;
  }

  function scan() {
    syncCaseFeature();
    installStaticHook();
    installPanoHook();
    if (!window.google?.maps?.Map) return;
    const canvases = findCanvases();
    if (settings.debug) debug("scan", { page: location.pathname, canvases: canvases.length });
    for (const canvas of canvases) {
      try {
        attachToCanvas(canvas);
      } catch (error) {
        debug("attach failed", error);
      }
    }
    for (const [canvas, entry] of trackedCanvases) {
      try {
        if (!canvas.isConnected || !entry.map.getDiv()?.isConnected) {
          cleanupEntry(entry);
          entry.gate.cancel();
          trackedCanvases.delete(canvas);
          trackedMaps.delete(entry.map);
          debug("detached");
          continue;
        }
        wrapExistingClickHandlers(entry.map, entry.gate);
      } catch (error) {
        debug("scan cleanup failed", error);
      }
    }
    syncCaseFeature();
  }

  function scheduleScan() {
    if (scheduleScan.pending) return;
    scheduleScan.pending = true;
    setTimeout(() => {
      scheduleScan.pending = false;
      scan();
    }, 50);
  }

  function init(context) {
    window.GeoGamble = {
      version: VERSION,
      config: CONFIG,
      defaults: CONFIG_DEFAULTS,
      settings,
      index,
      scan,
      trackedCanvases,
      applyConfig,
      getDuelBridge: () => duelBridge,
      getCaseState: () => ({
        page: casePagePath,
        location: caseLocation,
        round: caseRound,
        duel: caseDuel,
        panorama: casePano,
        dialogOpen: caseDialogOpen,
        maps: !!window.google?.maps?.Map,
        panoHook: casePanoHookInstalled,
        controls: !!caseControlsRoot(),
        button: !!document.getElementById(GG_CASE_BUTTON_ID),
        overlays: caseOverlayDiagnostics(),
      }),
      openCases: openCaseDialog,
      sendDuelPin: (lat, lng) => sendDuelPin({ lat, lng }),
    };
    installWsHooks();
    const observerRoot = document.documentElement || document;
    const scanObserver = observerRoot ? new MutationObserver(scheduleScan) : null;
    if (observerRoot) scanObserver?.observe(observerRoot, { childList: true, subtree: true });
    const scanTimer = setInterval(scan, 1000);
    context.onCleanup(() => clearInterval(scanTimer));
    context.onCleanup(() => scanObserver?.disconnect());
    if (!index.selected.length) debug("no enabled countries");
    if (index.unknown.length)
      console.warn("[GeoGamble] Unknown country codes:", index.unknown.join(", "));
    installStaticHook();
    installPanoHook();
    scan();
    setInterval(scan, 1000);
    if (observerRoot)
      new MutationObserver(scheduleScan).observe(observerRoot, { childList: true, subtree: true });
  }

  startUserscript({
    name: "geogamble",
    version: VERSION,
    config: geogambleConfig,
    topFrameOnly: true,
    cleanupKeys: ["geogamble.config.v1"],
    settings: {
      id: "geogamble",
      title: "GeoGamble",
      shortTitle: "GeoGamble",
      order: 15,
      config: geogambleConfig,
      sections: [
        { id: "gamble", title: "Gamble", fields: ["animationMs", "centerBias", "activationKey"] },
        { id: "countries", title: "Countries", fields: ["enabledCountries", "excludeCountries"] },
        {
          id: "submit",
          title: "Submit & duels",
          fields: ["autoSubmit", "submitDelayMs", "duelSubmitPin", "duelSubmitHop"],
        },
        { id: "audio", title: "Audio", fields: ["sound", "volume"] },
        {
          id: "misc",
          title: "Misc",
          fields: ["allowOtherModes", "perfTweaks", "heatmapOverlay", "debug"],
        },
      ],
      controls: { "country-list": countryListControl },
    },
    setup(context) {
      init(context);
    },
  });
})();
