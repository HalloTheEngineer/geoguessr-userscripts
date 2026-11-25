// ==UserScript==
// @name         GeoGuessr Toolkit: AdBlocker
// @namespace    https://github.com/HalloTheEngineer/geoguessr-userscripts
// @version      2026.11.20
// @description  Blocks known ad/analytics requests and cleans up selected GeoGuessr UI.
// @author       PixlPainter
// @license      MIT
// @homepageURL  https://github.com/HalloTheEngineer/geoguessr-userscripts
// @supportURL   https://github.com/HalloTheEngineer/geoguessr-userscripts/issues
// @updateURL    https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-adblocker.user.js
// @downloadURL  https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-adblocker.user.js
// @match        https://www.geoguessr.com/*
// @match        https://hallotheengineer.github.io/geoguessr-userscripts/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geoguessr.com
// @grant        none
// @run-at       document-start
// @webRequest {"selector":"*://*.googletagmanager.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.doubleclick.net/*","action":"cancel"}
// @webRequest {"selector":"*://*.amazon-adsystem.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.snigelweb.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.confiant-integrations.net/*","action":"cancel"}
// @webRequest {"selector":"*://*.btloader.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.anonymised.io/*","action":"cancel"}
// @webRequest {"selector":"*://*.profitwell.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.fastclick.net/*","action":"cancel"}
// @webRequest {"selector":"*://*.id5-sync.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.fundingchoicesmessages.google.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.crwdcntrl.net/*","action":"cancel"}
// @webRequest {"selector":"*://*.criteo.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.criteo.net/*","action":"cancel"}
// @webRequest {"selector":"*://*.uidapi.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.quantcast.com/*","action":"cancel"}
// @webRequest {"selector":"*://*.cmp.quantcast.com/*","action":"cancel"}
// ==/UserScript==

"use strict";
(() => {
  // ../gg-kit/src/window.ts
  var cached = null;
  function pageWindow() {
    if (cached) return cached;
    if (typeof unsafeWindow !== "undefined" && unsafeWindow) {
      cached = unsafeWindow;
      return cached;
    }
    const candidate = globalThis.window;
    cached = candidate && typeof candidate.addEventListener === "function" ? candidate : globalThis;
    return cached;
  }
  function hasDom() {
    return typeof document !== "undefined";
  }
  function isTopFrame() {
    try {
      return pageWindow().top === pageWindow().self;
    } catch {
      return false;
    }
  }

  // ../gg-kit/src/page.ts
  var RESERVED_STATIC_SEGMENTS = /* @__PURE__ */ new Set(["chunks", "css", "media", "image", "static", "_next"]);
  var cachedNextData = null;
  function isBuildId(value) {
    return typeof value === "string" && value.length > 0 && !RESERVED_STATIC_SEGMENTS.has(value.toLowerCase());
  }
  function nextData() {
    if (!hasDom()) return null;
    const script = document.getElementById("__NEXT_DATA__");
    const key = script?.textContent?.slice(0, 64) || "";
    if (cachedNextData && cachedNextData.build === key) return cachedNextData.value;
    let value = null;
    try {
      value = JSON.parse(script?.textContent || "null");
    } catch {
      value = null;
    }
    cachedNextData = { build: key, value };
    return value;
  }
  function siteBuild() {
    const data = nextData();
    if (isBuildId(data?.buildId)) return data.buildId;
    if (!hasDom()) return null;
    const win = pageWindow();
    if (isBuildId(win.__NEXT_DATA__?.buildId)) return win.__NEXT_DATA__.buildId;
    for (const script of document.querySelectorAll(
      'script[src*="/_next/static/"]'
    )) {
      const match = script.src.match(
        /\/_next\/static\/([^/]+)\/(?:_buildManifest|_ssgManifest|_middlewareManifest|_clientMiddlewareManifest)\.js(?:\?|$)/
      );
      if (isBuildId(match?.[1])) return match[1];
    }
    for (const script of document.querySelectorAll('script[src*="/_start/"]')) {
      const match = script.src.match(/\/index-([A-Za-z0-9_-]{4,})\.js(?:\?|$)/);
      if (isBuildId(match?.[1])) return match[1];
    }
    return null;
  }
  function pageKind(pathname = location.pathname) {
    if (pathname === "/" || pathname === "") return "home";
    if (pathname.startsWith("/singleplayer")) return "singleplayer";
    if (pathname.startsWith("/game/")) return "game";
    if (pathname.startsWith("/duels/")) return pathname.endsWith("/summary") ? "summary" : "duel";
    if (pathname.startsWith("/team-duels/"))
      return pathname.endsWith("/summary") ? "summary" : "team-duel";
    if (pathname.startsWith("/me/profile") || pathname.startsWith("/user/")) return "profile";
    if (pathname.startsWith("/me/settings")) return "settings";
    return "other";
  }

  // ../gg-kit/src/dom.ts
  var KEY = "__GG_KIT_DOM__";
  var API_VERSION = 1;
  function scheduler() {
    if (!hasDom()) return null;
    const win = pageWindow();
    if (win[KEY]) {
      if (win[KEY].apiVersion !== API_VERSION) {
        console.warn(
          `[gg-kit] shared DOM scheduler version mismatch (${win[KEY].apiVersion} vs ${API_VERSION})`
        );
      }
      return win[KEY];
    }
    if (typeof MutationObserver === "undefined") return null;
    const state = {
      observer: new MutationObserver(() => schedule()),
      apiVersion: API_VERSION,
      callbacks: /* @__PURE__ */ new Set(),
      timer: null,
      started: false
    };
    const schedule = () => {
      if (state.timer !== null) return;
      state.timer = setTimeout(() => {
        state.timer = null;
        if (document.hidden) return;
        for (const callback of [...state.callbacks]) {
          try {
            callback();
          } catch (error) {
            console.warn("[gg-kit] DOM callback failed", error);
          }
        }
      }, 50);
    };
    let observedRoot = null;
    let visibilityHooked = false;
    const start = () => {
      const root = document.documentElement;
      if (!root) {
        setTimeout(start, 50);
        return;
      }
      if (state.started && observedRoot === root) return;
      try {
        state.observer.observe(root, { childList: true, subtree: true });
      } catch {
        setTimeout(start, 50);
        return;
      }
      observedRoot = root;
      state.started = true;
      if (!visibilityHooked) {
        visibilityHooked = true;
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) schedule();
        });
      }
    };
    win[KEY] = state;
    start();
    return state;
  }
  function onDomChange(callback) {
    const state = scheduler();
    if (!state) return () => {
    };
    state.callbacks.add(callback);
    return () => state.callbacks.delete(callback);
  }
  function onRouteChange(callback) {
    if (!hasDom()) return () => {
    };
    const win = pageWindow();
    const stateKey = "__GG_KIT_ROUTE__";
    let state = win[stateKey];
    if (!state) {
      state = { callbacks: /* @__PURE__ */ new Set(), installed: false, last: location.href };
      win[stateKey] = state;
    }
    state.callbacks.add(callback);
    const current = state;
    if (!current.installed) {
      const notify = () => {
        if (current.last === location.href) return;
        current.last = location.href;
        const url = new URL(location.href);
        for (const fn of [...current.callbacks]) {
          try {
            fn(url);
          } catch (error) {
            console.warn("[gg-kit] route callback failed", error);
          }
        }
      };
      const history = win.history;
      for (const method of ["pushState", "replaceState"]) {
        const original = history[method];
        history[method] = function(...args) {
          const result = original.apply(this, args);
          setTimeout(notify, 0);
          return result;
        };
      }
      pageWindow().addEventListener("popstate", notify);
      current.installed = true;
    }
    return () => state?.callbacks.delete(callback);
  }

  // ../gg-kit/src/selectors.ts
  var SELECTORS = {
    "game.controls": {
      any: ['[data-qa="game-controls"]', '[class*="game_controls__"]'],
      description: "In-game bottom control bar",
      required: true
    },
    "game.settingsRoot": {
      any: [
        '[class*="game-menu_settingsContainer__"]',
        '[data-qa="game-settings"]',
        '[class*="_inGameMenuContentWrapper_"]',
        '[class*="_inGameMenuOverlay_"]'
      ],
      description: "Native in-game settings container"
    },
    "game.settingsOptions": {
      any: [
        '[class*="game-menu_optionsContainer__"]',
        '[class*="game-menu_options"]',
        '[class*="_panelBody_"]',
        '[class*="_sectionBody_"]'
      ],
      description: "Native in-game settings options list"
    },
    "game.settingsVolume": {
      any: ['[class*="game-menu_volumeContainer__"]'],
      description: "Native volume slider row"
    },
    "game.settingsSubHeader": {
      any: ['[class*="game-menu_subHeader__"]', '[class*="_subHeader_"]'],
      description: "Native settings sub-header"
    },
    "game.hudButton": {
      any: ['[class*="styles_hudButton__"]', '[class*="_hudButton_"]'],
      description: "Native round HUD button"
    },
    "game.menuRow": {
      any: ['[class*="game-menu_row__"]'],
      description: "Native settings row"
    },
    "game.menuDivider": {
      any: ['[class*="game-menu_divider__"]', '[class*="_divider_"]'],
      description: "Native settings divider"
    },
    "game.menuToggle": {
      any: ['[class*="toggle_toggle__"]', '[class*="_toggle_"]'],
      description: "Native settings toggle"
    },
    "game.menuRange": {
      any: ['[class*="range-slider_field__"]'],
      description: "Native settings range slider"
    },
    "game.menuButton": {
      any: ['[class*="button_button__"]'],
      description: "Native button"
    },
    "guessMap.root": {
      any: ['[data-qa="guess-map"]', '[class*="_guessMap_"]', "[data-game-hud]"],
      description: "Guess map wrapper"
    },
    "guessMap.canvas": {
      any: [
        '[data-qa="guess-map-canvas"]',
        '[class*="guess-map_canvas__"]',
        '[class*="_mapCanvas_"]'
      ],
      description: "Guess map canvas"
    },
    "guessMap.submit": {
      any: ['[data-qa="perform-guess"]'],
      description: "Guess submit button"
    },
    "guessMap.active": {
      any: [
        '[class*="guess-map_active__"]',
        '[class*="guess-map_guessMap__"]',
        '[class*="_guessMap_"]'
      ],
      description: "Expanded guess map"
    },
    "profile.widgetRow": {
      any: ['[class*="profile-v2_widgetRow__"]', '[class*="_widgetRow_"]'],
      description: "Profile widget row"
    },
    "duel.summaryRound": {
      any: ['[class*="game-summary_playedRound__"]', '[class*="_playedRound_"]'],
      description: "Duel summary round"
    }
  };
  function health(root = document) {
    return Object.entries(SELECTORS).map(([key, spec]) => {
      let found = null;
      if (hasDom()) {
        for (const selector of spec.any) {
          if (root.querySelector(selector)) {
            found = selector;
            break;
          }
        }
      }
      return { key, ok: !!found, selector: found, description: spec.description };
    });
  }

  // ../gg-kit/src/diagnostics.ts
  var KEY2 = "__GG_KIT_DIAGNOSTICS__";
  var API_VERSION2 = 1;
  var BUILD_KEY = "gg-kit.last-site-build";
  function registry() {
    const win = pageWindow();
    if (win[KEY2]) {
      if (win[KEY2].apiVersion !== API_VERSION2) {
        console.warn(
          `[gg-kit] diagnostics registry version mismatch (${win[KEY2].apiVersion} vs ${API_VERSION2})`
        );
      }
      return win[KEY2];
    }
    const value = {
      apiVersion: API_VERSION2,
      scripts: /* @__PURE__ */ new Map(),
      buildWarned: false
    };
    win[KEY2] = value;
    return value;
  }
  function registerScript(name, version) {
    registry().scripts.set(name, { name, version, loadedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
  function checkSiteBuild() {
    const build = siteBuild();
    if (!build || !hasDom()) return { build, changed: false, previous: null };
    let previous = null;
    try {
      const stored = localStorage.getItem(BUILD_KEY);
      previous = isBuildId(stored) ? stored : null;
      localStorage.setItem(BUILD_KEY, build);
    } catch {
    }
    const state = registry();
    const changed = !!previous && previous !== build;
    if (changed && !state.buildWarned) {
      state.buildWarned = true;
      console.warn(
        `[gg-kit] GeoGuessr build changed (${previous} -> ${build}); selectors may need updating`
      );
    }
    return { build, changed, previous };
  }
  function report() {
    const selectors = hasDom() ? health() : [];
    return {
      siteBuild: siteBuild(),
      page: hasDom() ? pageKind() : "unknown",
      url: hasDom() ? location.href : "",
      scripts: [...registry().scripts.values()],
      selectors,
      missingSelectors: selectors.filter((item) => !item.ok).map((item) => item.key)
    };
  }
  function logReport() {
    console.group("[gg-kit] diagnostics");
    console.log(report());
    console.groupEnd();
  }
  if (hasDom()) {
    pageWindow().__GG_DIAGNOSTICS__ = {
      report,
      log: logReport
    };
  }

  // ../gg-kit/src/ui.ts
  function injectStyle(id, css) {
    if (!hasDom()) return null;
    const existing = document.getElementById(id);
    if (existing && existing.tagName === "STYLE") return existing;
    const root = document.head || document.documentElement;
    if (!root) {
      setTimeout(() => injectStyle(id, css), 20);
      return null;
    }
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    root.appendChild(style);
    return style;
  }

  // ../gg-kit/src/settings/native-classes.ts
  var EMPTY_NATIVE_CLASSES = {
    tab: "",
    panel: "",
    row: "",
    rowLabel: "",
    rowControl: "",
    rowNote: "",
    rowState: "",
    divider: "",
    toggle: "",
    toggleInput: "",
    rangeField: "",
    rangeInput: "",
    rangeThumb: "",
    rangeBubble: "",
    selectWrap: "",
    select: "",
    selectArrow: "",
    button: "",
    buttonWrapper: "",
    buttonLabel: ""
  };
  var PREFIXES = {
    tab: '[role="tablist"] [role="tab"]',
    panel: '[role="tabpanel"]',
    row: '[class*="game-menu_row__"], [class*="_row_"]',
    rowLabel: '[class*="game-menu_rowLabel__"], [class*="_rowLabel_"]',
    rowControl: '[class*="game-menu_rowControl__"], [class*="_rowControl_"]',
    rowNote: '[class*="game-menu_rowNote__"], [class*="_rowNote_"]',
    rowState: '[class*="game-menu_rowState__"], [class*="_rowState_"]',
    divider: '[class*="game-menu_divider__"], [class*="_divider_"]',
    toggle: '[class*="toggle_toggle__"], [class*="_toggle_"]',
    toggleInput: '[class*="toggle_input__"], [class*="_toggle_"] input',
    rangeField: '[class*="range-slider_field__"]',
    rangeInput: '[class*="range-slider_rangeSlider__"], [class*="_rangeSlider_"]',
    rangeThumb: '[class*="range-slider_thumbvalue__"], [class*="_thumbvalue_"]',
    rangeBubble: '[class*="range-slider_bubble__"], [class*="_bubble_"]',
    selectWrap: '[class*="dropdown_dropdown__"]',
    select: '[class*="dropdown_select__"]',
    selectArrow: '[class*="dropdown_arrow__"]',
    button: '[class*="button_button__"]',
    buttonWrapper: '[class*="button_wrapper__"]',
    buttonLabel: '[class*="button_label__"]'
  };
  function fullClassIn(scope, selector) {
    for (const node of scope.querySelectorAll(selector)) {
      if (node.closest("#ggk-userscripts-panel")) continue;
      if (node.id.startsWith("ggk-")) continue;
      const value = typeof node.className === "string" ? node.className.trim() : "";
      if (value) return value;
    }
    return "";
  }
  function readNativeClasses(scope) {
    const result = { ...EMPTY_NATIVE_CLASSES };
    for (const key of Object.keys(PREFIXES)) {
      result[key] = fullClassIn(scope, PREFIXES[key]);
    }
    return result;
  }
  function settingsDialog() {
    const panel = document.querySelector("[data-settings-panel]");
    const dialog = panel?.closest("dialog") || document.querySelector("dialog[open]");
    return dialog || null;
  }
  function settingsTablist(dialog) {
    return dialog.querySelector('[role="tablist"]');
  }
  function settingsPanelsRoot(dialog, tablist) {
    const parent = tablist.parentElement?.parentElement;
    if (parent?.querySelector('[role="tabpanel"]')) return parent;
    return dialog;
  }

  // ../gg-kit/src/settings/host.ts
  var HOST_KEY = "__GG_KIT_SETTINGS__";
  var TAB_ID = "ggk-userscripts-tab";
  var PANEL_ID = "ggk-userscripts-panel";
  var STYLE_ID = "ggk-settings-style";
  var API_VERSION3 = 1;
  function hostState() {
    const win = pageWindow();
    if (win[HOST_KEY]) {
      if (win[HOST_KEY].apiVersion !== API_VERSION3) {
        console.warn(
          `[gg-kit] shared settings host version mismatch (${win[HOST_KEY].apiVersion} vs ${API_VERSION3})`
        );
      }
      return win[HOST_KEY];
    }
    const state = {
      apiVersion: API_VERSION3,
      registrations: /* @__PURE__ */ new Map(),
      installed: false
    };
    win[HOST_KEY] = state;
    return state;
  }
  function humanize(value) {
    return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("-", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  }
  function fieldMap(registration) {
    return registration.input.config.definition.fields;
  }
  function autoSections(registration) {
    if (registration.sections.length) return registration.sections;
    const fields = fieldMap(registration);
    const groups = /* @__PURE__ */ new Map();
    for (const [key, field] of Object.entries(fields)) {
      if (field.hidden) continue;
      const section = field.section || "general";
      const list = groups.get(section) || [];
      list.push(key);
      groups.set(section, list);
    }
    return [...groups.entries()].map(([id, keys], index) => ({
      id,
      title: humanize(id),
      order: index,
      fields: keys
    }));
  }
  function sectionFields(registration, section) {
    const fields = fieldMap(registration);
    if (section.fields)
      return [...section.fields].filter((key) => fields[key] && !fields[key].hidden);
    return Object.entries(fields).filter(([, field]) => (field.section || "general") === section.id && !field.hidden).map(([key]) => key);
  }
  function setHidden(element, hidden) {
    element.hidden = hidden;
    element.style.display = hidden ? "none" : "";
  }
  function buildRow(classes, label, hint) {
    const row = el("div", classes.row || "ggk-row");
    const labelNode = el(classes.rowLabel ? "p" : "span", classes.rowLabel || "ggk-label", label);
    const control = el("div", classes.rowControl || "ggk-control");
    row.append(labelNode, control);
    let note = null;
    if (hint) {
      note = el("div", classes.rowNote || "ggk-note", hint);
      row.append(note);
    }
    return { row, control, note };
  }
  function buildNativeButton(classes, label) {
    const button = el("button");
    button.type = "button";
    if (!classes.button) {
      button.className = "ggk-button";
      button.textContent = label;
      return button;
    }
    button.className = classes.button;
    if (classes.buttonWrapper) {
      const wrapper = el("div", classes.buttonWrapper);
      wrapper.append(el("span", classes.buttonLabel || "ggk-buttonLabel", label));
      button.append(wrapper);
    } else if (classes.buttonLabel) {
      button.append(el("span", classes.buttonLabel, label));
    } else {
      button.textContent = label;
    }
    return button;
  }
  function buildSelector(config, key, field, classes, cleanup) {
    const wrap = el("div", classes.selectWrap || "ggk-selectWrap");
    const select = el("select", classes.select || "ggk-select");
    for (const option of field.options || []) {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      select.append(item);
    }
    select.value = config.get(key);
    select.addEventListener("change", () => config.set(key, select.value));
    wrap.append(select);
    if (classes.selectArrow) wrap.append(el("span", classes.selectArrow));
    const update = () => {
      select.value = config.get(key);
    };
    cleanup.push(config.subscribe(update, [key]));
    return wrap;
  }
  function buildRange(config, key, field, classes, cleanup) {
    const input = el("input", classes.rangeInput || "ggk-range");
    input.type = "range";
    input.min = String(field.min ?? 0);
    input.max = String(field.max ?? 1);
    input.step = String(field.step ?? 0.01);
    input.value = String(config.get(key));
    const value = el("span", classes.rangeBubble || "ggk-rangeValue", input.value);
    let wrap;
    if (classes.rangeField && classes.rangeThumb) {
      const fieldWrap = el("div", classes.rangeField);
      const thumb = el("span", classes.rangeThumb);
      thumb.append(input, value);
      fieldWrap.append(thumb);
      wrap = fieldWrap;
    } else {
      wrap = el("div", classes.rangeField || "ggk-rangeField");
      wrap.append(input, value);
    }
    const paint = () => {
      const minimum = Number(input.min) || 0;
      const maximum = Number(input.max) || 1;
      const progress = (Number(input.value) - minimum) / (maximum - minimum || 1) * 100;
      value.textContent = input.value;
      wrap.style.setProperty("--range-progress", `${progress}%`);
      wrap.style.setProperty("--range-progress-num", String(progress / 100));
    };
    paint();
    input.addEventListener("input", () => {
      paint();
      config.set(key, Number(input.value));
    });
    cleanup.push(
      config.subscribe(() => {
        input.value = String(config.get(key));
        paint();
      }, [key])
    );
    return wrap;
  }
  function buildNumber(config, key, cleanup) {
    const input = el("input", "ggk-number");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = String(config.get(key));
    input.addEventListener("change", () => {
      const number = Number(input.value);
      if (input.value.trim() !== "" && Number.isFinite(number)) config.set(key, number);
      else input.value = String(config.get(key));
    });
    cleanup.push(
      config.subscribe(() => {
        input.value = String(config.get(key));
      }, [key])
    );
    return input;
  }
  function buildText(config, key, field, cleanup) {
    const input = el("input", "ggk-text");
    input.type = "text";
    if (field.placeholder) input.placeholder = field.placeholder;
    input.value = String(config.get(key) ?? "");
    input.addEventListener("change", () => config.set(key, input.value));
    cleanup.push(
      config.subscribe(() => {
        input.value = String(config.get(key) ?? "");
      }, [key])
    );
    return input;
  }
  function buildToggle(config, key, classes, cleanup, control) {
    const label = el("label", classes.toggle || "ggk-toggle");
    const input = el("input", classes.toggleInput || "ggk-toggleInput");
    input.type = "checkbox";
    input.checked = config.get(key) === true;
    if (classes.toggleInput) input.setAttribute("role", "switch");
    const state = classes.rowState ? el("span", classes.rowState) : null;
    label.append(input);
    if (!classes.toggle) label.append(el("span", "ggk-switch"));
    control.append(label);
    if (state) control.append(state);
    const sync = () => {
      const checked = config.get(key) === true;
      input.checked = checked;
      if (state) state.textContent = checked ? "On" : "Off";
    };
    input.addEventListener("change", () => config.set(key, input.checked));
    cleanup.push(config.subscribe(sync, [key]));
    sync();
  }
  function renderField(registration, section, classes, key, cleanup) {
    const field = fieldMap(registration)[key];
    if (!field) return null;
    const config = registration.input.config;
    const { row, control } = buildRow(classes, field.label || humanize(key), field.hint);
    const updateVisibility = () => {
      const values = config.get();
      const hidden = field.visibleWhen ? !field.visibleWhen(values) : false;
      setHidden(row, hidden);
      for (const input of control.querySelectorAll("input, select, button")) {
        input.disabled = field.disabledWhen ? field.disabledWhen(values) : false;
      }
    };
    const unsubscribeVisibility = config.subscribe(updateVisibility);
    cleanup.push(unsubscribeVisibility);
    updateVisibility();
    if (field.control) {
      const renderer = registration.controls[field.control];
      if (renderer) {
        const context = {
          key,
          field,
          config,
          root: control,
          section,
          nativeClasses: classes,
          button: (label) => buildNativeButton(classes, label)
        };
        const dispose = renderer(context);
        if (typeof dispose === "function") cleanup.push(dispose);
      } else {
        control.append(el("div", "ggk-note", `Missing control: ${field.control}`));
      }
    } else {
      switch (field.type) {
        case "boolean":
          buildToggle(config, key, classes, cleanup, control);
          break;
        case "range":
          control.append(buildRange(config, key, field, classes, cleanup));
          break;
        case "number":
          control.append(buildNumber(config, key, cleanup));
          break;
        case "select":
          control.append(buildSelector(config, key, field, classes, cleanup));
          break;
        case "text":
          control.append(buildText(config, key, field, cleanup));
          break;
        case "custom":
          control.append(el("div", "ggk-note", "Custom control required"));
          break;
      }
    }
    section.append(row);
    return row;
  }
  function renderRegistration(registration, container, classes) {
    const cleanup = container.__ggkCleanup || [];
    for (const dispose of cleanup) dispose();
    const nextCleanup = [];
    container.__ggkCleanup = nextCleanup;
    container.textContent = "";
    const sections = [...autoSections(registration)].sort(
      (left, right) => (left.order ?? 0) - (right.order ?? 0)
    );
    const config = registration.input.config;
    for (const spec of sections) {
      const fields = sectionFields(registration, spec);
      if (!fields.length) continue;
      const section = el("section", "ggk-section");
      section.dataset.ggkScript = registration.input.id;
      section.dataset.ggkSection = spec.id;
      if (spec.title) section.append(el("h3", "ggk-sectionTitle", spec.title));
      if (spec.description) section.append(el("p", "ggk-sectionDescription", spec.description));
      for (const key of fields) renderField(registration, section, classes, key, nextCleanup);
      const reset = buildNativeButton(classes, "Reset section");
      reset.addEventListener("click", () => {
        for (const key of fields) config.reset(key);
      });
      section.append(reset);
      container.append(section);
    }
    const resetAll = buildNativeButton(classes, "Reset all");
    resetAll.addEventListener("click", () => config.reset());
    container.append(resetAll);
  }
  function disposeTree(root) {
    const nodes = [root, ...root.querySelectorAll("*")];
    for (const node of nodes) {
      const cleanup = node.__ggkCleanup;
      if (!cleanup) continue;
      for (const dispose of cleanup) dispose();
      delete node.__ggkCleanup;
    }
  }
  function sanitizeId(value) {
    return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
  }
  function renderAll(container, classes) {
    const state = hostState();
    disposeTree(container);
    container.textContent = "";
    const registrations = [...state.registrations.values()].sort(
      (left, right) => (left.input.order ?? 0) - (right.input.order ?? 0)
    );
    if (!registrations.length) {
      container.append(el("p", "ggk-note", "No userscripts settings registered."));
      return;
    }
    const activeId = state.activeScriptId && registrations.some((item) => item.input.id === state.activeScriptId) ? state.activeScriptId : registrations[0].input.id;
    const subTabs = el("div", "ggk-subTabs");
    subTabs.setAttribute("role", "tablist");
    subTabs.setAttribute("aria-label", "Userscript settings sections");
    const buttons = /* @__PURE__ */ new Map();
    for (const registration of registrations) {
      const id = sanitizeId(registration.input.id);
      const button = el("button", "ggk-subTab");
      button.type = "button";
      button.id = `ggk-subtab-${id}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `ggk-subpanel-${id}`);
      button.setAttribute("aria-selected", String(registration.input.id === activeId));
      button.dataset.ggkScript = registration.input.id;
      button.textContent = registration.input.shortTitle || registration.input.title || humanize(registration.input.id);
      button.addEventListener("click", () => {
        state.activeScriptId = registration.input.id;
        renderAll(container, classes);
        container.querySelector(`#ggk-subtab-${id}`)?.focus();
      });
      buttons.set(registration.input.id, button);
      subTabs.append(button);
    }
    subTabs.addEventListener("keydown", (event) => {
      const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const ids = [...buttons.keys()];
      const current = state.activeScriptId || ids[0];
      let index = Math.max(0, ids.indexOf(current));
      if (event.key === "ArrowLeft") index = (index - 1 + ids.length) % ids.length;
      if (event.key === "ArrowRight") index = (index + 1) % ids.length;
      if (event.key === "Home") index = 0;
      if (event.key === "End") index = ids.length - 1;
      state.activeScriptId = ids[index];
      renderAll(container, classes);
      container.querySelector(`#ggk-subtab-${sanitizeId(ids[index])}`)?.focus();
    });
    container.append(subTabs);
    const active = registrations.find((item) => item.input.id === activeId) || registrations[0];
    const panelId = sanitizeId(active.input.id);
    const content = el("div", "ggk-subPanel");
    content.id = `ggk-subpanel-${panelId}`;
    content.setAttribute("role", "tabpanel");
    content.setAttribute("aria-labelledby", `ggk-subtab-${panelId}`);
    content.dataset.ggkScript = active.input.id;
    if (!active.input.config.available) {
      content.append(
        el("p", "ggk-note", "Storage is unavailable; settings will apply but will not persist.")
      );
    } else if (active.input.config.lastError) {
      content.append(el("p", "ggk-note", `Config warning: ${active.input.config.lastError.message}`));
    }
    const header = el("div", "ggk-scriptHeader");
    header.append(el("h2", "ggk-scriptTitle", active.input.title || humanize(active.input.id)));
    content.append(header);
    const body = el("div", "ggk-scriptBody");
    content.append(body);
    renderRegistration(active, body, classes);
    container.append(content);
    for (const [id, button] of buttons) {
      const selected = id === activeId;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  }
  function activateNative(dialog, tab) {
    const panel = dialog.querySelector(`#${PANEL_ID}`);
    const tablist = tab.closest('[role="tablist"]');
    if (!panel || !tablist) return;
    for (const other of tablist.querySelectorAll('[role="tab"]')) {
      const active = other === tab;
      other.setAttribute("aria-selected", String(active));
      other.dataset.state = active ? "active" : "inactive";
      other.tabIndex = active ? 0 : -1;
    }
    if (dialog instanceof Element) dialog.classList.add("ggk-userscripts-active");
    setHidden(panel, false);
    renderAll(panel, readNativeClasses(dialog));
  }
  function deactivateNative() {
    const dialog = document.querySelector(".ggk-userscripts-active");
    dialog?.classList.remove("ggk-userscripts-active");
    const tab = document.getElementById(TAB_ID);
    tab?.setAttribute("aria-selected", "false");
    if (tab instanceof HTMLElement) {
      tab.dataset.state = "inactive";
      tab.tabIndex = -1;
    }
    const panel = document.getElementById(PANEL_ID);
    if (panel) setHidden(panel, true);
  }
  function ensureNative() {
    const dialog = settingsDialog();
    if (!dialog) return;
    const tablist = settingsTablist(dialog);
    if (!tablist) return;
    const state = hostState();
    if (!state.registrations.size) {
      document.getElementById(TAB_ID)?.remove();
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    const classes = readNativeClasses(dialog);
    let tab = document.getElementById(TAB_ID);
    let panel = document.getElementById(PANEL_ID);
    if (tab && panel && tablist.contains(tab) && dialog.contains(panel)) return;
    tab?.remove();
    panel?.remove();
    tab = el("button", classes.tab || "ggk-tab");
    tab.id = TAB_ID;
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.setAttribute("aria-controls", PANEL_ID);
    tab.dataset.state = "inactive";
    tab.tabIndex = -1;
    tab.append(el("span", "ggk-tabLabel", "Userscripts"));
    tab.addEventListener("click", () => activateNative(dialog, tab));
    tablist.append(tab);
    panel = el("div", classes.panel || "ggk-panel");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", TAB_ID);
    panel.tabIndex = -1;
    panel.hidden = true;
    panel.style.display = "none";
    const panelsRoot = settingsPanelsRoot(dialog, tablist);
    const panels = panelsRoot.querySelectorAll('[role="tabpanel"]');
    if (panels.length) panels[panels.length - 1].after(panel);
    else panelsRoot.appendChild(panel);
    renderAll(panel, classes);
  }
  function ensureAll() {
    ensureNative();
  }
  function installHost() {
    const state = hostState();
    if (state.installed) return state;
    state.installed = true;
    state.ensureAll = ensureAll;
    state.refresh = () => {
      const native = document.getElementById(PANEL_ID);
      if (native) renderAll(native, readNativeClasses(settingsDialog() || document));
    };
    injectStyle(
      STYLE_ID,
      `
    .ggk-tab { padding: 8px 12px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
    .ggk-tab[aria-selected="true"] { color: var(--ds-color-white-100, #fff); }
    .ggk-panel { padding: 16px; color: inherit; font: inherit; }
    .ggk-userscripts-active [role="tabpanel"]:not(#ggk-userscripts-panel):not(.ggk-subPanel) { display: none !important; }
    .ggk-subTabs { display: flex; align-items: center; gap: 4px; padding: 4px; margin: 0 0 14px; overflow-x: auto; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(0,0,0,.2); scrollbar-width: thin; }
    .ggk-subTab { flex: none; padding: 8px 12px; border: 0; border-radius: 7px; background: transparent; color: rgba(255,255,255,.62); font: 700 11px/1 var(--default-font, sans-serif); letter-spacing: .02em; cursor: pointer; transition: background .15s ease, color .15s ease; }
    .ggk-subTab:hover { background: rgba(255,255,255,.08); color: #fff; }
    .ggk-subTab[aria-selected="true"] { background: #7952e9; color: #fff; box-shadow: 0 3px 10px rgba(121,82,233,.3); }
    .ggk-subTab:focus-visible, .ggk-tab:focus-visible { outline: 2px solid var(--ds-color-white-80, rgba(255,255,255,.8)); outline-offset: 2px; }
    .ggk-subPanel { display: flex; flex-direction: column; gap: 12px; }
    .ggk-scriptBody { display: flex; flex-direction: column; gap: 12px; }
    .ggk-scriptBody > .ggk-button, .ggk-scriptBody > button { align-self: flex-start; }
    .ggk-scriptHeader { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .ggk-scriptTitle { margin: 0; font: 800 18px/1.2 var(--default-font, sans-serif); }
    .ggk-section { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid rgba(255,255,255,.09); border-radius: 11px; background: rgba(255,255,255,.035); }
    .ggk-sectionTitle { margin: 0; font: 800 12px/1.2 var(--default-font, sans-serif); text-transform: uppercase; letter-spacing: .05em; opacity: .72; }
    .ggk-sectionDescription, .ggk-note { margin: 0; font: 400 11px/1.35 var(--default-font, sans-serif); opacity: .65; }
    .ggk-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 32px; }
    .ggk-label { font: 500 13px/1.2 var(--default-font, sans-serif); }
    .ggk-control { display: flex; align-items: center; gap: 8px; }
    .ggk-toggle { display: inline-flex; align-items: center; cursor: pointer; }
    .ggk-toggleInput { width: 18px; height: 18px; accent-color: #7952e9; }
    .ggk-switch { display: none; }
    .ggk-rangeField { display: flex; align-items: center; gap: 8px; min-width: 180px; }
    .ggk-range { width: 160px; accent-color: #7952e9; }
    .ggk-rangeValue { min-width: 34px; font: 700 11px/1 var(--default-font, sans-serif); opacity: .75; text-align: right; }
    .ggk-number, .ggk-text, .ggk-select { padding: 6px 8px; border: 1px solid rgba(255,255,255,.18); border-radius: 6px; background: rgba(0,0,0,.25); color: inherit; font: inherit; }
    .ggk-number::-webkit-outer-spin-button, .ggk-number::-webkit-inner-spin-button { appearance: none; margin: 0; }
    .ggk-selectWrap { display: inline-flex; align-items: center; gap: 4px; }
    .ggk-button { align-self: flex-start; padding: 6px 10px; border: 1px solid rgba(255,255,255,.18); border-radius: 6px; background: rgba(255,255,255,.08); color: inherit; font: 700 11px/1 var(--default-font, sans-serif); cursor: pointer; }
    .ggk-button:hover { background: rgba(255,255,255,.15); }
    @media (max-width: 640px) { .ggk-row { align-items: flex-start; flex-direction: column; gap: 4px; } .ggk-subTabs { border-radius: 8px; } }
  `
    );
    onDomChange(ensureAll);
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!target || target.closest(`#${TAB_ID}`) || target.closest(`#${PANEL_ID}`)) return;
        if (target.closest('[role="tab"]')) deactivateNative();
      },
      true
    );
    document.addEventListener(
      "focusin",
      (event) => {
        const target = event.target;
        if (!target || target.closest(`#${TAB_ID}`) || target.closest(`#${PANEL_ID}`)) return;
        if (target.closest('[role="tab"]')) deactivateNative();
      },
      true
    );
    ensureAll();
    return state;
  }
  function registerSettings(input) {
    const state = installHost();
    if (state.registrations.has(input.id)) {
      console.warn(`[gg-kit] duplicate settings registration for "${input.id}"; replacing`);
    }
    const registration = {
      input,
      sections: input.sections ? [...input.sections] : [],
      controls: input.controls || {}
    };
    state.registrations.set(input.id, registration);
    state.ensureAll?.();
    state.refresh?.();
    return {
      get element() {
        return document.getElementById(PANEL_ID);
      },
      refresh() {
        state.refresh?.();
      },
      dispose() {
        state.registrations.delete(input.id);
        state.ensureAll?.();
        state.refresh?.();
      }
    };
  }

  // ../gg-kit/src/app/start-userscript.ts
  function guardKey(name) {
    return `__GG_${name.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}_LOADED__`;
  }
  var TOOLKIT_LANDING_HOST = "hallotheengineer.github.io";
  var TOOLKIT_LANDING_PATH = "/geoguessr-userscripts";
  var INSTALLED_KEY_PREFIX = "gg-toolkit.installed.v1.";
  function isToolkitLandingPage(pathname = location.pathname) {
    if (location.hostname !== TOOLKIT_LANDING_HOST) return false;
    return pathname === TOOLKIT_LANDING_PATH || pathname.startsWith(`${TOOLKIT_LANDING_PATH}/`);
  }
  function installedMarkerKey(name) {
    return `${INSTALLED_KEY_PREFIX}${name}`;
  }
  function recordInstalledScript(name, version) {
    const win = pageWindow();
    try {
      win.localStorage.setItem(
        installedMarkerKey(name),
        JSON.stringify({ version, updatedAt: (/* @__PURE__ */ new Date()).toISOString() })
      );
    } catch {
    }
    try {
      win.dispatchEvent(
        new CustomEvent("gg-toolkit-installed", {
          detail: { name, version }
        })
      );
    } catch {
    }
  }
  function startUserscript(options) {
    if (isToolkitLandingPage()) {
      recordInstalledScript(options.name, options.version);
      return { started: false, context: null, stop: () => {
      } };
    }
    const win = pageWindow();
    const key = guardKey(options.name);
    if (win[key]) {
      return { started: false, context: null, stop: () => {
      } };
    }
    if (options.topFrameOnly !== false && !isTopFrame()) {
      return { started: false, context: null, stop: () => {
      } };
    }
    win[key] = true;
    registerScript(options.name, options.version);
    checkSiteBuild();
    for (const cleanupKey of options.cleanupKeys || []) {
      try {
        localStorage.removeItem(cleanupKey);
      } catch {
      }
    }
    const cleanups = [];
    const routeCleanups = [];
    const pageHideCallbacks = [];
    let settings = null;
    let stopped = false;
    const context = {
      config: options.config,
      get settings() {
        return settings;
      },
      log: (...args) => console.log(`[${options.name}]`, ...args),
      onCleanup(callback) {
        cleanups.push(callback);
      },
      onRoute(callback) {
        routeCleanups.push(onRouteChange(callback));
        try {
          callback(new URL(location.href));
        } catch {
        }
      },
      onPageHide(callback) {
        pageHideCallbacks.push(callback);
      }
    };
    if (options.settings && options.config) {
      settings = registerSettings(options.settings);
      cleanups.push(() => settings?.dispose());
    }
    try {
      const setupCleanup = options.setup(context);
      if (typeof setupCleanup === "function") cleanups.push(setupCleanup);
    } catch (error) {
      console.error(`[${options.name}] setup failed`, error);
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup();
        } catch (cleanupError) {
          console.warn(`[${options.name}] cleanup failed`, cleanupError);
        }
      }
      throw error;
    }
    const onPageHide = () => {
      for (const callback of pageHideCallbacks) {
        try {
          callback();
        } catch (error) {
          console.warn(`[${options.name}] pagehide callback failed`, error);
        }
      }
      options.config?.flush();
    };
    pageWindow().addEventListener("pagehide", onPageHide);
    cleanups.push(() => pageWindow().removeEventListener("pagehide", onPageHide));
    return {
      get started() {
        return true;
      },
      get context() {
        return context;
      },
      stop() {
        if (stopped) return;
        stopped = true;
        for (const cleanup of routeCleanups.splice(0).reverse()) {
          try {
            cleanup();
          } catch (error) {
            console.warn(`[${options.name}] route cleanup failed`, error);
          }
        }
        pageHideCallbacks.length = 0;
        for (const cleanup of cleanups.splice(0).reverse()) {
          try {
            cleanup();
          } catch (error) {
            console.warn(`[${options.name}] cleanup failed`, error);
          }
        }
        options.config?.dispose();
      }
    };
  }

  // ../gg-kit/src/config/define-config.ts
  var WRITE_DELAY_MS = 80;
  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }
  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function equal(left, right) {
    if (left === right) return true;
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  function clamp(value, min, max) {
    let next = value;
    if (typeof min === "number" && Number.isFinite(min)) next = Math.max(min, next);
    if (typeof max === "number" && Number.isFinite(max)) next = Math.min(max, next);
    return next;
  }
  function normalizeField(field, raw, all) {
    if (raw === void 0 || raw === null) return clone(field.default);
    if (field.parse) {
      const parsed = field.parse(raw);
      if (parsed !== void 0) return parsed;
      return clone(field.default);
    }
    switch (field.type) {
      case "boolean":
        if (typeof raw === "boolean") return raw;
        if (raw === "true") return true;
        if (raw === "false") return false;
        return clone(field.default);
      case "number":
      case "range": {
        const number = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(number)) return clone(field.default);
        const value = clamp(number, field.min, field.max);
        return field.validate?.(value, all) ? clone(field.default) : value;
      }
      case "select": {
        const value = String(raw);
        return field.options?.some((option) => option.value === value) ? value : clone(field.default);
      }
      case "text":
        return typeof raw === "string" ? raw : String(raw);
      case "custom":
        return clone(raw);
      default:
        return clone(field.default);
    }
  }
  function normalizeAll(definition, source) {
    const value = {};
    const errors = [];
    for (const [key, field] of Object.entries(definition.fields)) {
      if (source[key] === void 0) {
        value[key] = clone(field.default);
        continue;
      }
      const normalized = normalizeField(field, source[key], value);
      const validation = field.validate?.(normalized, value) ?? null;
      if (validation) {
        errors.push(`${key}: ${validation}`);
        value[key] = clone(field.default);
      } else {
        value[key] = normalized;
      }
    }
    return { value, errors };
  }
  function defaultsFor(definition) {
    const value = {};
    for (const [key, field] of Object.entries(definition.fields)) {
      value[key] = clone(field.default);
    }
    return value;
  }
  function area(definition) {
    try {
      return definition.area === "session" ? sessionStorage : localStorage;
    } catch {
      return null;
    }
  }
  function safeParse(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  function defineConfig(definition) {
    const storage = area(definition);
    const defaults = defaultsFor(definition);
    let state = defaultsFor(definition);
    let lastError = null;
    let writeTimer = null;
    let disposed = false;
    const listeners = /* @__PURE__ */ new Set();
    const report2 = (error) => {
      lastError = error instanceof Error ? error : new Error(String(error));
    };
    const notify = (change) => {
      for (const entry of [...listeners]) {
        if (entry.keys && !entry.keys.includes(change.key)) continue;
        try {
          entry.callback(change);
        } catch (error) {
          console.warn(`[gg-kit] config listener failed for ${definition.key}`, error);
        }
      }
    };
    const read = () => {
      if (!storage) {
        state = defaultsFor(definition);
        return;
      }
      let raw = null;
      try {
        raw = storage.getItem(definition.key);
      } catch (error) {
        report2(error);
        state = defaultsFor(definition);
        return;
      }
      if (!raw) {
        state = defaultsFor(definition);
        return;
      }
      const parsed = safeParse(raw);
      if (!isRecord(parsed) || typeof parsed.v !== "number" || !isRecord(parsed.data)) {
        state = defaultsFor(definition);
        return;
      }
      let version = parsed.v;
      let data = parsed.data;
      if (version > definition.version) {
        state = defaultsFor(definition);
        report2(new Error(`${definition.key}: stored config version ${version} is newer`));
        return;
      }
      if (version < definition.version) {
        try {
          storage.setItem(`${definition.key}.backup`, raw);
        } catch {
        }
        while (version < definition.version) {
          const migrate = definition.migrations?.[version];
          if (!migrate) {
            report2(
              new Error(
                `${definition.key}: missing migration from version ${version} to ${definition.version}`
              )
            );
            state = defaultsFor(definition);
            return;
          }
          data = migrate(data);
          version++;
        }
      }
      const normalized = normalizeAll(definition, data);
      state = normalized.value;
      if (normalized.errors.length) report2(new Error(normalized.errors.join("; ")));
    };
    const persisted = () => {
      const out = {};
      for (const [key, field] of Object.entries(definition.fields)) {
        if (field.persist === false) continue;
        const value = state[key];
        if (definition.write !== "full" && equal(value, field.default)) continue;
        if (field.omitDefaultFromStorage && equal(value, field.default)) continue;
        out[key] = value;
      }
      return out;
    };
    const write = () => {
      if (!storage || disposed) return;
      try {
        const data = persisted();
        if (Object.keys(data).length === 0) storage.removeItem(definition.key);
        else storage.setItem(definition.key, JSON.stringify({ v: definition.version, data }));
        lastError = null;
      } catch (error) {
        report2(error);
      }
    };
    const scheduleWrite = () => {
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(() => {
        writeTimer = null;
        write();
      }, WRITE_DELAY_MS);
    };
    const flush = () => {
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      write();
    };
    const update = (key, raw, source) => {
      const field = definition.fields[key];
      if (!field) return false;
      const next = normalizeField(field, raw, state);
      const validation = field.validate?.(next, state) ?? null;
      if (validation) {
        report2(new Error(`${String(key)}: ${validation}`));
        return false;
      }
      const previous = state[key];
      if (equal(previous, next)) return true;
      state = { ...state, [key]: next };
      notify({ key, value: next, previous, source });
      scheduleWrite();
      return true;
    };
    read();
    const onStorage = (event) => {
      if (event.key !== definition.key) return;
      const before = state;
      read();
      for (const key of Object.keys(definition.fields)) {
        if (equal(before[key], state[key])) continue;
        notify({
          key,
          value: state[key],
          previous: before[key],
          source: "storage"
        });
      }
    };
    if (storage && typeof window !== "undefined") {
      pageWindow().addEventListener("storage", onStorage);
    }
    return {
      key: definition.key,
      version: definition.version,
      definition,
      get available() {
        return !!storage;
      },
      get lastError() {
        return lastError;
      },
      get(key) {
        if (key === void 0) return state;
        return state[key];
      },
      set(key, value) {
        return update(key, value, "set");
      },
      patch(value) {
        for (const key of Object.keys(value)) {
          update(key, value[key], "patch");
        }
        scheduleWrite();
      },
      reset(key) {
        if (key !== void 0) {
          update(key, defaults[key], "reset");
          return;
        }
        const previous = state;
        state = defaultsFor(definition);
        for (const fieldKey of Object.keys(definition.fields)) {
          notify({
            key: fieldKey,
            value: state[fieldKey],
            previous: previous[fieldKey],
            source: "reset"
          });
        }
        scheduleWrite();
      },
      clear() {
        const previous = state;
        if (writeTimer) {
          clearTimeout(writeTimer);
          writeTimer = null;
        }
        state = defaultsFor(definition);
        try {
          storage?.removeItem(definition.key);
        } catch (error) {
          report2(error);
        }
        for (const key of Object.keys(definition.fields)) {
          notify({
            key,
            value: state[key],
            previous: previous[key],
            source: "reset"
          });
        }
      },
      flush,
      subscribe(listener, keys) {
        const entry = { callback: listener, keys };
        listeners.add(entry);
        return () => listeners.delete(entry);
      },
      export() {
        return { version: definition.version, data: clone(state) };
      },
      import(value) {
        const record = isRecord(value) && isRecord(value.data) ? value.data : value;
        if (!isRecord(record)) return { ok: false, errors: ["expected an object"] };
        const previous = state;
        const normalized = normalizeAll(definition, record);
        state = normalized.value;
        for (const key of Object.keys(definition.fields)) {
          notify({
            key,
            value: state[key],
            previous: previous[key],
            source: "import"
          });
        }
        scheduleWrite();
        return { ok: normalized.errors.length === 0, errors: normalized.errors };
      },
      dispose() {
        disposed = true;
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = null;
        listeners.clear();
        if (storage) pageWindow().removeEventListener("storage", onStorage);
      }
    };
  }

  // network-rules.json
  var network_rules_default = {
    blockedDomains: [
      "googletagmanager.com",
      "doubleclick.net",
      "amazon-adsystem.com",
      "snigelweb.com",
      "confiant-integrations.net",
      "btloader.com",
      "anonymised.io",
      "profitwell.com",
      "fastclick.net",
      "id5-sync.com",
      "fundingchoicesmessages.google.com",
      "crwdcntrl.net",
      "criteo.com",
      "criteo.net",
      "uidapi.com",
      "quantcast.com",
      "cmp.quantcast.com"
    ],
    webRequest: [
      { selector: "*://*.googletagmanager.com/*", action: "cancel" },
      { selector: "*://*.doubleclick.net/*", action: "cancel" },
      { selector: "*://*.amazon-adsystem.com/*", action: "cancel" },
      { selector: "*://*.snigelweb.com/*", action: "cancel" },
      { selector: "*://*.confiant-integrations.net/*", action: "cancel" },
      { selector: "*://*.btloader.com/*", action: "cancel" },
      { selector: "*://*.anonymised.io/*", action: "cancel" },
      { selector: "*://*.profitwell.com/*", action: "cancel" },
      { selector: "*://*.fastclick.net/*", action: "cancel" },
      { selector: "*://*.id5-sync.com/*", action: "cancel" },
      { selector: "*://*.fundingchoicesmessages.google.com/*", action: "cancel" },
      { selector: "*://*.crwdcntrl.net/*", action: "cancel" },
      { selector: "*://*.criteo.com/*", action: "cancel" },
      { selector: "*://*.criteo.net/*", action: "cancel" },
      { selector: "*://*.uidapi.com/*", action: "cancel" },
      { selector: "*://*.quantcast.com/*", action: "cancel" },
      { selector: "*://*.cmp.quantcast.com/*", action: "cancel" }
    ]
  };

  // src/app-ready.ts
  function abortError() {
    return new DOMException("Aborted", "AbortError");
  }
  function documentRoot() {
    const root = document.documentElement;
    return root && root.nodeType === 1 ? root : null;
  }
  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  function waitForLoad(signal) {
    if (document.readyState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const onAbort = () => {
        window.removeEventListener("load", onLoad);
        reject(abortError());
      };
      const onLoad = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      window.addEventListener("load", onLoad, { once: true });
    });
  }
  function waitForDocumentRoot(maxWaitMs, signal) {
    const root = documentRoot();
    if (root) return Promise.resolve(root);
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      let finished = false;
      let timer = null;
      let poll = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (poll) clearInterval(poll);
        timer = null;
        poll = null;
        document.removeEventListener("readystatechange", check);
        document.removeEventListener("DOMContentLoaded", check);
        signal?.removeEventListener("abort", onAbort);
      };
      const finish = (value) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(value);
      };
      const check = () => {
        const current = documentRoot();
        if (current) finish(current);
      };
      const onAbort = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(abortError());
      };
      document.addEventListener("readystatechange", check);
      document.addEventListener("DOMContentLoaded", check);
      signal?.addEventListener("abort", onAbort, { once: true });
      poll = setInterval(check, 16);
      timer = setTimeout(() => finish(documentRoot()), Math.max(0, maxWaitMs));
      check();
    });
  }
  async function waitForDomQuiet(quietMs, maxWaitMs, signal) {
    if (signal?.aborted) throw abortError();
    const root = await waitForDocumentRoot(maxWaitMs, signal);
    if (signal?.aborted) throw abortError();
    if (!root || typeof MutationObserver === "undefined") {
      await delay(quietMs, signal);
      return;
    }
    await new Promise((resolve, reject) => {
      let quietTimer = null;
      let maxTimer = null;
      let finished = false;
      const cleanup = () => {
        if (quietTimer) clearTimeout(quietTimer);
        if (maxTimer) clearTimeout(maxTimer);
        observer.disconnect();
        signal?.removeEventListener("abort", onAbort);
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve();
      };
      const onAbort = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(abortError());
      };
      const reset = () => {
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      };
      const observer = new MutationObserver(reset);
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        observer.observe(root, { childList: true, subtree: true });
      } catch {
        finish();
        return;
      }
      maxTimer = setTimeout(finish, Math.max(quietMs, maxWaitMs));
      reset();
    });
  }
  function waitForIdle() {
    return new Promise((resolve) => {
      const win = window;
      if (typeof win.requestIdleCallback === "function") {
        win.requestIdleCallback(() => resolve(), { timeout: 1e3 });
      } else {
        setTimeout(resolve, 50);
      }
    });
  }
  async function waitForAppReady(options = {}) {
    const quietMs = options.quietMs ?? 200;
    const maxWaitMs = options.maxWaitMs ?? 3e3;
    const signal = options.signal;
    if (signal?.aborted) throw abortError();
    await waitForLoad(signal);
    if (signal?.aborted) throw abortError();
    await waitForDomQuiet(quietMs, maxWaitMs, signal);
    if (signal?.aborted) throw abortError();
    await waitForIdle();
    if (signal?.aborted) throw abortError();
  }

  // src/config.ts
  var adblockerConfig = defineConfig({
    key: "gg.adblocker.config",
    version: 1,
    write: "diff",
    fields: {
      enabled: {
        type: "boolean",
        default: true,
        label: "Enabled",
        section: "general",
        order: 0
      },
      blockAdsAndAnalytics: {
        type: "boolean",
        default: true,
        label: "Clean ad scripts and iframes",
        hint: "Controls DOM cleanup only. Best-effort @webRequest rules depend on userscript-manager support.",
        section: "ads",
        order: 10
      },
      cleanupHome: {
        type: "boolean",
        default: true,
        label: "Clean the home page",
        section: "ui",
        order: 20
      },
      cleanupInGame: {
        type: "boolean",
        default: true,
        label: "Clean in-game UI",
        section: "ui",
        order: 21
      },
      cleanupMultiplayer: {
        type: "boolean",
        default: true,
        label: "Clean multiplayer UI",
        section: "ui",
        order: 22
      },
      homepageDuelShortcuts: {
        type: "boolean",
        default: true,
        label: "Show duel shortcuts on the home page",
        section: "ui",
        order: 23
      },
      debug: {
        type: "boolean",
        default: false,
        label: "Debug logging",
        section: "advanced",
        order: 30
      }
    }
  });

  // src/rules.ts
  var DIRECT_BLOCK_CONFIG = [
    { selector: '[class*="team-v2-matchmaking-layout_footer__"]', category: "multiplayer" },
    { selector: '[class*="ranked-v2-matchmaking-layout_footer__"]', category: "multiplayer" },
    { selector: '[class*="unranked-v2-matchmaking-layout_footer__"]', category: "multiplayer" },
    { selector: '[class*="team-matchmaking-layout_footer__"]', category: "multiplayer" },
    { selector: '[class*="ranked-matchmaking-layout_footer__"]', category: "multiplayer" },
    { selector: '[class*="unranked-matchmaking-layout_footer__"]', category: "multiplayer" },
    { selector: '[class*="styles_friendChatButton__"]', category: "inGame" },
    { selector: '[class*="live-players-count_container__"]', category: "inGame" },
    { selector: '[class*="home_footer__"]', category: "home", url_paths: ["/"] },
    { selector: '[class*="new-losp-footer_root__"]', category: "home", url_paths: ["/"] },
    { selector: '[class*="footer_footer__"]', category: "home", url_paths: ["/"] },
    { selector: '[class*="footer_root__"]', category: "multiplayer", url_paths: ["/multiplayer"] },
    { selector: '[class*="home_editButtonWrapper__"]', category: "home" },
    { selector: '[class*="pro-user-start-page_editButtonWrapper__"]', category: "home" },
    { selector: 'iframe[name="__tcfapiLocator"]', category: "ads" },
    { selector: 'iframe[name="__uspapiLocator"]', category: "ads" },
    { selector: 'iframe[name="__adconsentLocator"]', category: "ads" },
    { selector: 'iframe[name="googlefcPresent"]', category: "ads" },
    { selector: 'iframe[src*="criteo.com"]', category: "ads" },
    { selector: "#confiant_tag_holder", category: "ads" },
    { selector: ".snigel-adhesive", category: "ads" },
    { selector: "#adconsent-usp-banner-btn", category: "ads" }
  ];
  var CSS_HIDING_SELECTORS = [
    {
      selector: '[class*="home_left__"], [class*="pro-user-start-page_left__"]',
      category: "home"
    }
  ];
  var ANCESTOR_BLOCK_CONFIG = [
    {
      selector: '[class*="clubs-widget_promo"]',
      ancestor: '[class*="widget_root"]',
      category: "home"
    },
    {
      selector: '[class*="widget_explorer__"]',
      ancestor: '[class*="profile-v2_widgetRow__"]',
      category: "home"
    }
  ];
  var STRUCTURAL_MAPPINGS = [
    {
      source: '[class*="styles_columnTwo__"]',
      target: '[class*="styles_columnOne__"]',
      reverseOrder: true,
      category: "inGame"
    }
  ];
  var HTML_INSERTS = [
    {
      selector: '[class*="home_center__"], [class*="pro-user-start-page_center__"]',
      url_paths: ["/"],
      category: "home",
      insertId: "ggb-insert-links",
      position: "beforeend",
      html: `
      <div id="ggb-insert-links" style="display:flex;flex-direction:row;gap:1rem;margin-top:1rem;">
        <a href="/multiplayer" title="Solo duels" style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:1rem;background:rgba(121,82,233,.35);color:#fff;font:800 12px/1 var(--default-font,sans-serif);text-decoration:none;">1v1</a>
        <a href="/multiplayer/teams" title="Team duels" style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:1rem;background:rgba(121,82,233,.35);color:#fff;font:800 10px/1 var(--default-font,sans-serif);text-decoration:none;">TEAM</a>
      </div>
    `
    }
  ];

  // src/main.ts
  function categoryEnabled(category) {
    if (!adblockerConfig.get("enabled")) return false;
    switch (category) {
      case "ads":
        return adblockerConfig.get("blockAdsAndAnalytics");
      case "home":
        return adblockerConfig.get("cleanupHome");
      case "inGame":
        return adblockerConfig.get("cleanupInGame");
      case "multiplayer":
        return adblockerConfig.get("cleanupMultiplayer");
    }
  }
  var LOCALE_PREFIXES = /* @__PURE__ */ new Set([
    "cs",
    "da",
    "de",
    "en",
    "es",
    "fi",
    "fr",
    "hu",
    "it",
    "ja",
    "ko",
    "nl",
    "no",
    "pl",
    "pt",
    "ro",
    "ru",
    "sv",
    "tr",
    "uk",
    "zh"
  ]);
  function normalizedPath() {
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length > 1 && LOCALE_PREFIXES.has(segments[0].toLowerCase())) {
      return `/${segments.slice(1).join("/")}`;
    }
    return location.pathname || "/";
  }
  function pathMatches(urlPaths) {
    if (!urlPaths?.length) return true;
    const path = normalizedPath();
    return urlPaths.some((value) => path === value || path.startsWith(`${value}/`));
  }
  function log(...args) {
    if (adblockerConfig.get("debug")) console.log("[adblocker]", ...args);
  }
  function isBlockedUrl(url) {
    if (!url) return false;
    try {
      const hostname = new URL(url, location.href).hostname.toLowerCase();
      return network_rules_default.blockedDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }
  function syncCss() {
    const selectors = CSS_HIDING_SELECTORS.filter(
      (rule) => categoryEnabled(rule.category) && pathMatches(rule.url_paths)
    ).map((rule) => rule.selector);
    const css = `${selectors.length ? `${selectors.join(", ")} { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }` : ""}
       #ggb-insert-links a { transition: transform .2s ease, filter .2s ease; }
       #ggb-insert-links a:hover { transform: scale(1.05); filter: brightness(1.1); }
       .ggb-menu-image { display:block; width:56px; height:56px; object-fit:contain; }`;
    const existing = document.getElementById("geoguessr-adblocker-style");
    if (existing) existing.textContent = css;
    else injectStyle("geoguessr-adblocker-style", css);
  }
  function scanAndRemoveScripts(node) {
    if (!appReady || !node || !categoryEnabled("ads")) return;
    const element = node;
    if ((element.tagName === "SCRIPT" || element.tagName === "IFRAME") && isBlockedUrl(element.getAttribute("src"))) {
      element.remove();
      return;
    }
    const candidates = node.querySelectorAll("script, iframe");
    for (const candidate of candidates) {
      if (isBlockedUrl(candidate.getAttribute("src"))) {
        log("blocking", candidate.getAttribute("src"));
        candidate.remove();
      }
    }
  }
  var blockScheduled = false;
  function scheduleBlock() {
    if (blockScheduled) return;
    blockScheduled = true;
    const run = () => {
      blockScheduled = false;
      blockElements();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }
  function blockElements() {
    if (!appReady) {
      if (!adblockerConfig.get("enabled")) {
        document.getElementById("ggb-insert-links")?.remove();
      }
      syncCss();
      return;
    }
    if (!adblockerConfig.get("enabled")) {
      document.getElementById("ggb-insert-links")?.remove();
      syncCss();
      return;
    }
    let count = 0;
    for (const rule of DIRECT_BLOCK_CONFIG) {
      if (!categoryEnabled(rule.category) || !pathMatches(rule.url_paths)) continue;
      for (const element of document.querySelectorAll(rule.selector)) {
        element.remove();
        count++;
      }
    }
    for (const rule of ANCESTOR_BLOCK_CONFIG) {
      if (!categoryEnabled(rule.category)) continue;
      for (const element of document.querySelectorAll(rule.selector)) {
        element.closest(rule.ancestor)?.remove();
        count++;
      }
    }
    for (const rule of STRUCTURAL_MAPPINGS) {
      if (!categoryEnabled(rule.category)) continue;
      const sources = document.querySelectorAll(rule.source);
      const targets = document.querySelectorAll(rule.target);
      if (sources.length !== 1 || targets.length !== 1) continue;
      const source = sources[0];
      const target = targets[0];
      if (!source.children.length) continue;
      for (const child of [...source.children]) {
        if (rule.reverseOrder) target.prepend(child);
        else target.append(child);
      }
      source.remove();
      count++;
    }
    const shortcutsEnabled = adblockerConfig.get("homepageDuelShortcuts") && categoryEnabled("home");
    if (!shortcutsEnabled) document.getElementById("ggb-insert-links")?.remove();
    for (const insert of HTML_INSERTS) {
      if (!shortcutsEnabled || !categoryEnabled(insert.category) || !pathMatches(insert.url_paths))
        continue;
      for (const target of document.querySelectorAll(insert.selector)) {
        if (!target.querySelector(`#${insert.insertId}`)) {
          target.insertAdjacentHTML(insert.position, insert.html);
          count++;
        }
      }
    }
    syncCss();
    if (count) log("elements handled", count);
  }
  var appReady = false;
  startUserscript({
    name: "adblocker",
    version: "2026.11.20",
    config: adblockerConfig,
    topFrameOnly: false,
    settings: isTopFrame() ? {
      id: "adblocker",
      title: "AdBlocker & Debloater",
      shortTitle: "AdBlocker",
      order: 10,
      config: adblockerConfig,
      sections: [
        { id: "general", title: "General", fields: ["enabled"] },
        { id: "ads", title: "Ads and analytics", fields: ["blockAdsAndAnalytics"] },
        {
          id: "ui",
          title: "UI cleanup",
          fields: ["cleanupHome", "cleanupInGame", "cleanupMultiplayer", "homepageDuelShortcuts"]
        },
        { id: "advanced", title: "Advanced", fields: ["debug"] }
      ]
    } : null,
    setup(context) {
      const observer = new MutationObserver((mutations) => {
        if (!appReady || !adblockerConfig.get("enabled")) return;
        let changed = false;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              scanAndRemoveScripts(node);
              changed = true;
            }
          }
        }
        if (changed) scheduleBlock();
      });
      let observing = false;
      let observedRoot = null;
      let retry = null;
      let routeTimer = null;
      let readyController = null;
      let readyAttempts = 0;
      const stopObserver = () => {
        if (retry) {
          clearTimeout(retry);
          retry = null;
        }
        observer.disconnect();
        observing = false;
        observedRoot = null;
      };
      const startObserver = () => {
        if (!appReady || retry || !adblockerConfig.get("enabled")) return;
        const root = document.documentElement;
        if (!root) {
          retry = setTimeout(() => {
            retry = null;
            startObserver();
          }, 20);
          return;
        }
        const rootChanged = observedRoot !== root;
        if (observing && !rootChanged) return;
        if (observing) observer.disconnect();
        try {
          observer.observe(root, { childList: true, subtree: true });
        } catch (error) {
          observing = false;
          observedRoot = null;
          context.log("observer attach failed", error);
          retry = setTimeout(() => {
            retry = null;
            startObserver();
          }, 20);
          return;
        }
        observing = true;
        observedRoot = root;
        context.log("initialized");
        if (rootChanged) {
          scanAndRemoveScripts(root);
          scheduleBlock();
        }
      };
      const runCleanup = () => {
        if (!appReady || !adblockerConfig.get("enabled")) return;
        startObserver();
        blockElements();
        scanAndRemoveScripts(document.documentElement);
      };
      const stopReadyWait = () => {
        readyController?.abort();
        readyController = null;
      };
      const markReady = () => {
        if (appReady) return;
        appReady = true;
        runCleanup();
      };
      const scheduleReady = () => {
        if (appReady || readyController || !adblockerConfig.get("enabled")) return;
        const controller = new AbortController();
        readyController = controller;
        void waitForAppReady({ signal: controller.signal }).then(() => {
          if (controller.signal.aborted || !adblockerConfig.get("enabled")) return;
          markReady();
        }).catch((error) => {
          if (controller.signal.aborted) return;
          context.log("app readiness wait failed", error);
          readyAttempts++;
          if (readyAttempts >= 3) markReady();
        }).finally(() => {
          if (readyController !== controller) return;
          readyController = null;
          if (appReady || !adblockerConfig.get("enabled")) return;
          scheduleReady();
        });
      };
      const sync = () => {
        syncCss();
        if (!adblockerConfig.get("enabled")) {
          stopReadyWait();
          stopObserver();
          blockElements();
          return;
        }
        if (!appReady) {
          scheduleReady();
          return;
        }
        runCleanup();
      };
      const unsubscribe = adblockerConfig.subscribe(sync);
      context.onCleanup(unsubscribe);
      scheduleReady();
      syncCss();
      context.onRoute(() => {
        if (!adblockerConfig.get("enabled")) return;
        if (!appReady) {
          scheduleReady();
          return;
        }
        if (routeTimer) clearTimeout(routeTimer);
        routeTimer = setTimeout(() => {
          routeTimer = null;
          runCleanup();
        }, 100);
      });
      context.onCleanup(() => {
        stopReadyWait();
        stopObserver();
        if (routeTimer) clearTimeout(routeTimer);
        document.getElementById("geoguessr-adblocker-style")?.remove();
        document.getElementById("ggb-insert-links")?.remove();
      });
    }
  });
})();
