// ==UserScript==
// @name         GeoGuessr Toolkit: GeoSurfer
// @namespace    https://github.com/HalloTheEngineer/geoguessr-userscripts
// @version      2026.11.19
// @description  Adds a lightweight optional video overlay to the in-game stats panel.
// @author       PixlPainter
// @license      MIT
// @homepageURL  https://github.com/HalloTheEngineer/geoguessr-userscripts
// @supportURL   https://github.com/HalloTheEngineer/geoguessr-userscripts/issues
// @updateURL    https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-geosurfer.user.js
// @downloadURL  https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-geosurfer.user.js
// @match        https://www.geoguessr.com/*
// @match        https://hallotheengineer.github.io/geoguessr-userscripts/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geoguessr.com
// @grant        GM_getResourceURL
// @run-at       document-start
// @noframes
// @resource gg-geosurfer-video https://github.com/HalloTheEngineer/geoguessr-userscripts/releases/download/userscripts-assets/brainrot.mp4?v=2026.11.19
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
    const start = () => {
      if (state.started) return;
      const root = document.documentElement;
      if (!root) {
        setTimeout(start, 50);
        return;
      }
      state.observer.observe(root, { childList: true, subtree: true });
      state.started = true;
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) schedule();
      });
    };
    start();
    win[KEY] = state;
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
      any: ['[class*="game-menu_settingsContainer__"]', '[data-qa="game-settings"]'],
      description: "Native in-game settings container"
    },
    "game.settingsOptions": {
      any: ['[class*="game-menu_optionsContainer__"]', '[class*="game-menu_options"]'],
      description: "Native in-game settings options list"
    },
    "game.settingsVolume": {
      any: ['[class*="game-menu_volumeContainer__"]'],
      description: "Native volume slider row"
    },
    "game.settingsSubHeader": {
      any: ['[class*="game-menu_subHeader__"]'],
      description: "Native settings sub-header"
    },
    "game.hudButton": {
      any: ['[class*="styles_hudButton__"]'],
      description: "Native round HUD button"
    },
    "game.menuRow": {
      any: ['[class*="game-menu_row__"]'],
      description: "Native settings row"
    },
    "game.menuDivider": {
      any: ['[class*="game-menu_divider__"]'],
      description: "Native settings divider"
    },
    "game.menuToggle": {
      any: ['[class*="toggle_toggle__"]'],
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
      any: ['[data-qa="guess-map"]'],
      description: "Guess map wrapper"
    },
    "guessMap.canvas": {
      any: ['[data-qa="guess-map-canvas"]', '[class*="guess-map_canvas__"]'],
      description: "Guess map canvas"
    },
    "guessMap.submit": {
      any: ['[data-qa="perform-guess"]'],
      description: "Guess submit button"
    },
    "guessMap.active": {
      any: ['[class*="guess-map_active__"]', '[class*="guess-map_guessMap__"]'],
      description: "Expanded guess map"
    },
    "profile.widgetRow": {
      any: ['[class*="profile-v2_widgetRow__"]'],
      description: "Profile widget row"
    },
    "duel.summaryRound": {
      any: ['[class*="game-summary_playedRound__"]'],
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
    row: '[class*="game-menu_row__"]',
    rowLabel: '[class*="game-menu_rowLabel__"]',
    rowControl: '[class*="game-menu_rowControl__"]',
    rowNote: '[class*="game-menu_rowNote__"]',
    rowState: '[class*="game-menu_rowState__"]',
    divider: '[class*="game-menu_divider__"]',
    toggle: '[class*="toggle_toggle__"]',
    toggleInput: '[class*="toggle_input__"]',
    rangeField: '[class*="range-slider_field__"]',
    rangeInput: '[class*="range-slider_rangeSlider__"]',
    rangeThumb: '[class*="range-slider_thumbvalue__"]',
    rangeBubble: '[class*="range-slider_bubble__"]',
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

  // src/config.ts
  var geosurferConfig = defineConfig({
    key: "gg.geosurfer.config",
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
      showOverlay: {
        type: "boolean",
        default: true,
        label: "Show the video overlay",
        hint: "Requires the in-game stats panel.",
        section: "general",
        order: 1
      },
      playOnlyVisible: {
        type: "boolean",
        default: true,
        label: "Play only while visible",
        hint: "Pauses playback when the overlay or tab is hidden.",
        section: "playback",
        order: 10
      },
      muted: {
        type: "boolean",
        default: true,
        label: "Mute playback",
        section: "playback",
        order: 11
      }
    }
  });

  // src/main.ts
  var ROOT_SELECTOR = '[class*="in-game-stats-overlay_root__"]';
  var CARD_SELECTOR = '[class*="in-game-stats-overlay_cardWrapper__"]';
  var CARD_ID = "gg-surfer-card";
  function resourceUrl() {
    try {
      if (typeof GM_getResourceURL === "function") {
        const value = GM_getResourceURL("gg-geosurfer-video");
        if (value) return value;
      }
    } catch (error) {
      console.warn("[geosurfer] could not resolve video resource", error);
    }
    return "https://github.com/HalloTheEngineer/geoguessr-userscripts/releases/download/userscripts-assets/brainrot.mp4?v=2026.11.19";
  }
  function applyConfig(video) {
    if (!video) return;
    video.muted = geosurferConfig.get("muted");
  }
  injectStyle(
    "gg-geosurfer-style",
    `
  #${CARD_ID} { overflow: hidden; }
  .gg-surfer-frame { width: 100%; height: 100%; min-height: 8rem; display: flex; align-items: center; justify-content: center; padding: .5rem; box-sizing: border-box; }
  .gg-surfer-video { width: 100%; height: 100%; max-height: 18rem; display: block; object-fit: cover; border-radius: .5rem; background: #12101f; }
`
  );
  startUserscript({
    name: "geosurfer",
    version: "2026.11.19",
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
        { id: "playback", title: "Playback", fields: ["playOnlyVisible", "muted"] }
      ]
    },
    setup(context) {
      let card = null;
      let video = null;
      let visibilityObserver = null;
      let scheduled = false;
      const play = () => {
        if (!video || document.hidden) return;
        if (!video.src) video.src = resourceUrl();
        video.play().catch(() => {
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
          { threshold: 0.15 }
        );
        visibilityObserver.observe(card);
      };
      const createCard = (root, existing) => {
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
        const root = document.querySelector(ROOT_SELECTOR);
        if (!root) {
          cleanup();
          return;
        }
        const cards = [...root.querySelectorAll(CARD_SELECTOR)].filter(
          (element) => element.id !== CARD_ID
        );
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
      const unsubscribe = context.config.subscribe((change) => {
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
    }
  });
})();
