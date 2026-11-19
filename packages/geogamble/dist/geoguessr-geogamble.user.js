// ==UserScript==
// @name         GeoGuessr Toolkit: GeoGamble
// @namespace    https://github.com/HalloTheEngineer/geoguessr-userscripts
// @version      2026.11.19
// @description  Gambles random country points and adds per-round location cases.
// @author       PixlPainter
// @license      MIT
// @homepageURL  https://github.com/HalloTheEngineer/geoguessr-userscripts
// @supportURL   https://github.com/HalloTheEngineer/geoguessr-userscripts/issues
// @updateURL    https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-geogamble.user.js
// @downloadURL  https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-geogamble.user.js
// @match        https://www.geoguessr.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geoguessr.com
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

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
    const state3 = {
      observer: new MutationObserver(() => schedule()),
      apiVersion: API_VERSION,
      callbacks: /* @__PURE__ */ new Set(),
      timer: null,
      started: false
    };
    const schedule = () => {
      if (state3.timer !== null) return;
      state3.timer = setTimeout(() => {
        state3.timer = null;
        if (document.hidden) return;
        for (const callback of [...state3.callbacks]) {
          try {
            callback();
          } catch (error) {
            console.warn("[gg-kit] DOM callback failed", error);
          }
        }
      }, 50);
    };
    const start = () => {
      if (state3.started) return;
      const root = document.documentElement;
      if (!root) {
        setTimeout(start, 50);
        return;
      }
      state3.observer.observe(root, { childList: true, subtree: true });
      state3.started = true;
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) schedule();
      });
    };
    start();
    win[KEY] = state3;
    return state3;
  }
  function onDomChange(callback) {
    const state3 = scheduler();
    if (!state3) return () => {
    };
    state3.callbacks.add(callback);
    return () => state3.callbacks.delete(callback);
  }
  function onRouteChange(callback) {
    if (!hasDom()) return () => {
    };
    const win = pageWindow();
    const stateKey = "__GG_KIT_ROUTE__";
    let state3 = win[stateKey];
    if (!state3) {
      state3 = { callbacks: /* @__PURE__ */ new Set(), installed: false, last: location.href };
      win[stateKey] = state3;
    }
    state3.callbacks.add(callback);
    const current = state3;
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
    return () => state3?.callbacks.delete(callback);
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
  function query(key, root = document) {
    if (!hasDom()) return null;
    const spec = SELECTORS[key];
    for (const selector of spec.any) {
      const element = root.querySelector(selector);
      if (element) return element;
    }
    return null;
  }
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
    const state3 = registry();
    const changed = !!previous && previous !== build;
    if (changed && !state3.buildWarned) {
      state3.buildWarned = true;
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
    const state3 = {
      apiVersion: API_VERSION3,
      registrations: /* @__PURE__ */ new Map(),
      installed: false
    };
    win[HOST_KEY] = state3;
    return state3;
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
    const state3 = classes.rowState ? el("span", classes.rowState) : null;
    label.append(input);
    if (!classes.toggle) label.append(el("span", "ggk-switch"));
    control.append(label);
    if (state3) control.append(state3);
    const sync = () => {
      const checked = config.get(key) === true;
      input.checked = checked;
      if (state3) state3.textContent = checked ? "On" : "Off";
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
    const state3 = hostState();
    disposeTree(container);
    container.textContent = "";
    const registrations = [...state3.registrations.values()].sort(
      (left, right) => (left.input.order ?? 0) - (right.input.order ?? 0)
    );
    if (!registrations.length) {
      container.append(el("p", "ggk-note", "No userscripts settings registered."));
      return;
    }
    const activeId = state3.activeScriptId && registrations.some((item) => item.input.id === state3.activeScriptId) ? state3.activeScriptId : registrations[0].input.id;
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
        state3.activeScriptId = registration.input.id;
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
      const current = state3.activeScriptId || ids[0];
      let index = Math.max(0, ids.indexOf(current));
      if (event.key === "ArrowLeft") index = (index - 1 + ids.length) % ids.length;
      if (event.key === "ArrowRight") index = (index + 1) % ids.length;
      if (event.key === "Home") index = 0;
      if (event.key === "End") index = ids.length - 1;
      state3.activeScriptId = ids[index];
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
    const state3 = hostState();
    if (!state3.registrations.size) {
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
    const state3 = hostState();
    if (state3.installed) return state3;
    state3.installed = true;
    state3.ensureAll = ensureAll;
    state3.refresh = () => {
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
    return state3;
  }
  function registerSettings(input) {
    const state3 = installHost();
    if (state3.registrations.has(input.id)) {
      console.warn(`[gg-kit] duplicate settings registration for "${input.id}"; replacing`);
    }
    const registration = {
      input,
      sections: input.sections ? [...input.sections] : [],
      controls: input.controls || {}
    };
    state3.registrations.set(input.id, registration);
    state3.ensureAll?.();
    state3.refresh?.();
    return {
      get element() {
        return document.getElementById(PANEL_ID);
      },
      refresh() {
        state3.refresh?.();
      },
      dispose() {
        state3.registrations.delete(input.id);
        state3.ensureAll?.();
        state3.refresh?.();
      }
    };
  }

  // ../gg-kit/src/app/start-userscript.ts
  function guardKey(name) {
    return `__GG_${name.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}_LOADED__`;
  }
  function startUserscript(options) {
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
    let state3 = defaultsFor(definition);
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
        state3 = defaultsFor(definition);
        return;
      }
      let raw = null;
      try {
        raw = storage.getItem(definition.key);
      } catch (error) {
        report2(error);
        state3 = defaultsFor(definition);
        return;
      }
      if (!raw) {
        state3 = defaultsFor(definition);
        return;
      }
      const parsed = safeParse(raw);
      if (!isRecord(parsed) || typeof parsed.v !== "number" || !isRecord(parsed.data)) {
        state3 = defaultsFor(definition);
        return;
      }
      let version = parsed.v;
      let data = parsed.data;
      if (version > definition.version) {
        state3 = defaultsFor(definition);
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
            state3 = defaultsFor(definition);
            return;
          }
          data = migrate(data);
          version++;
        }
      }
      const normalized = normalizeAll(definition, data);
      state3 = normalized.value;
      if (normalized.errors.length) report2(new Error(normalized.errors.join("; ")));
    };
    const persisted = () => {
      const out = {};
      for (const [key, field] of Object.entries(definition.fields)) {
        if (field.persist === false) continue;
        const value = state3[key];
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
      const next = normalizeField(field, raw, state3);
      const validation = field.validate?.(next, state3) ?? null;
      if (validation) {
        report2(new Error(`${String(key)}: ${validation}`));
        return false;
      }
      const previous = state3[key];
      if (equal(previous, next)) return true;
      state3 = { ...state3, [key]: next };
      notify({ key, value: next, previous, source });
      scheduleWrite();
      return true;
    };
    read();
    const onStorage = (event) => {
      if (event.key !== definition.key) return;
      const before = state3;
      read();
      for (const key of Object.keys(definition.fields)) {
        if (equal(before[key], state3[key])) continue;
        notify({
          key,
          value: state3[key],
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
        if (key === void 0) return state3;
        return state3[key];
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
        const previous = state3;
        state3 = defaultsFor(definition);
        for (const fieldKey of Object.keys(definition.fields)) {
          notify({
            key: fieldKey,
            value: state3[fieldKey],
            previous: previous[fieldKey],
            source: "reset"
          });
        }
        scheduleWrite();
      },
      clear() {
        const previous = state3;
        if (writeTimer) {
          clearTimeout(writeTimer);
          writeTimer = null;
        }
        state3 = defaultsFor(definition);
        try {
          storage?.removeItem(definition.key);
        } catch (error) {
          report2(error);
        }
        for (const key of Object.keys(definition.fields)) {
          notify({
            key,
            value: state3[key],
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
        return { version: definition.version, data: clone(state3) };
      },
      import(value) {
        const record = isRecord(value) && isRecord(value.data) ? value.data : value;
        if (!isRecord(record)) return { ok: false, errors: ["expected an object"] };
        const previous = state3;
        const normalized = normalizeAll(definition, record);
        state3 = normalized.value;
        for (const key of Object.keys(definition.fields)) {
          notify({
            key,
            value: state3[key],
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

  // ../gg-kit/src/duel.ts
  var DUEL_SAMPLE_PIN = 5;
  var DUEL_FRAME_HEADER_SIZE = 20;
  var DUEL_ROUND_START_CODES = ["DuelStarted", "DuelNewRound", "RoundStarted"];
  var DUEL_ROUND_END_CODES = ["DuelRoundTimedOut", "DuelFinished", "RoundEnded"];
  function hexToBytes(hex) {
    if (typeof hex !== "string" || hex.length % 2 !== 0) return null;
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index++) {
      const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
      if (!Number.isFinite(value)) return null;
      bytes[index] = value;
    }
    return bytes;
  }
  function decodePanoId(value) {
    if (typeof value !== "string" || !value) return null;
    if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) return value;
    try {
      const bytes = hexToBytes(value);
      if (!bytes) return value;
      return new TextDecoder().decode(bytes);
    } catch {
      return value;
    }
  }
  function encodeDuelPinPayload({
    timestampMs,
    lat,
    lng
  }) {
    const payload = new Uint8Array(17);
    const view = new DataView(payload.buffer);
    view.setFloat64(0, Number(timestampMs), false);
    view.setUint8(8, DUEL_SAMPLE_PIN);
    view.setFloat32(9, Number(lat), false);
    view.setFloat32(13, Number(lng), false);
    return payload;
  }
  function encodeDuelPinFrame({
    gameIdHex,
    round = 1,
    timestampMs,
    lat,
    lng,
    headerType = 3,
    zeroBlock = null
  }) {
    const gameId = typeof gameIdHex === "string" ? hexToBytes(gameIdHex) : gameIdHex;
    if (gameId?.length !== 12) return null;
    const roundNumber = Math.min(255, Math.max(1, Math.trunc(Number(round) || 1)));
    const payload = encodeDuelPinPayload({ timestampMs, lat, lng });
    const frame = new Uint8Array(DUEL_FRAME_HEADER_SIZE + payload.length);
    const view = new DataView(frame.buffer);
    frame[0] = headerType & 255;
    frame.set(gameId, 1);
    if (zeroBlock) frame.set(zeroBlock.subarray(0, 4), 13);
    frame[17] = roundNumber;
    view.setUint16(18, payload.length, false);
    frame.set(payload, 20);
    return frame;
  }
  function parseDuelJsonEvent(message) {
    if (typeof message !== "string") return null;
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return null;
    }
    const code = typeof data?.code === "string" ? data.code : null;
    if (!code) return null;
    if (DUEL_ROUND_START_CODES.includes(code)) {
      const round = data?.duel?.state?.currentRoundNumber;
      return {
        code,
        kind: "round-start",
        round: Number.isFinite(Number(round)) && Number(round) > 0 ? Number(round) : null
      };
    }
    if (DUEL_ROUND_END_CODES.includes(code)) {
      return { code, kind: code === "DuelFinished" ? "finished" : "round-end", round: null };
    }
    return { code, kind: "other", round: null };
  }
  function parseDuelStateEvent(message) {
    if (typeof message !== "string") return null;
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return null;
    }
    const state3 = data?.duel?.state;
    if (!state3 || typeof state3 !== "object") return null;
    const options = state3.options && typeof state3.options === "object" ? state3.options : {};
    const roundNumberValue = Number(state3.currentRoundNumber);
    const roundNumber = Number.isFinite(roundNumberValue) && roundNumberValue > 0 ? Math.trunc(roundNumberValue) : null;
    const rounds = Array.isArray(state3.rounds) ? state3.rounds : [];
    let currentRound = rounds.find((round) => Number(round?.roundNumber) === roundNumber) || null;
    if (!currentRound && roundNumber && rounds[roundNumber - 1])
      currentRound = rounds[roundNumber - 1];
    const panorama = currentRound?.panorama || state3.panorama || data?.duel?.panorama || null;
    const latValue = Number(panorama?.lat ?? currentRound?.lat);
    const lngValue = Number(panorama?.lng ?? currentRound?.lng);
    const panoId = decodePanoId(panorama?.panoId ?? currentRound?.panoId ?? state3.panoId);
    const lat = Number.isFinite(latValue) ? latValue : null;
    const lng = Number.isFinite(lngValue) ? lngValue : null;
    const isRated = typeof options.isRated === "boolean" ? options.isRated : typeof state3.isRated === "boolean" ? state3.isRated : null;
    const isTeamDuels = typeof options.isTeamDuels === "boolean" ? options.isTeamDuels : typeof state3.isTeamDuels === "boolean" ? state3.isTeamDuels : false;
    const gameIdValue = data?.gameId ?? state3.gameId;
    return {
      code: typeof data?.code === "string" ? data.code : null,
      gameId: typeof gameIdValue === "string" && gameIdValue ? gameIdValue : null,
      roundNumber,
      panoId,
      lat,
      lng,
      hasLocation: lat !== null && lng !== null && !!panoId,
      isRated,
      isTeamDuels,
      gameContext: typeof options.gameContext === "string" ? options.gameContext : null
    };
  }

  // ../gg-kit/src/maps.ts
  function getFiber(element) {
    if (!element) return null;
    for (let node = element, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
      const key = Object.keys(node).find(
        (name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$")
      );
      if (key) return node[key];
    }
    return null;
  }
  function isGoogleMap(value) {
    const candidate = value;
    return !!candidate && typeof candidate.getDiv === "function" && typeof candidate.getCenter === "function" && typeof candidate.addListener === "function";
  }
  function mapDivInside(map, canvas) {
    try {
      const div = map.getDiv();
      return !!div && (div === canvas || canvas.contains(div) || div.contains(canvas));
    } catch {
      return false;
    }
  }
  function findMapForCanvas(canvas, options = {}) {
    const fiber = getFiber(canvas);
    if (!fiber) return null;
    const isExcluded = options.isExcludedProps || (() => false);
    const isGuessMap = options.isGuessMapProps || (() => true);
    let node = fiber;
    let candidate = null;
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

  // ../gg-kit/src/panorama.ts
  var KEY3 = "__GG_KIT_PANORAMA__";
  var API_VERSION4 = 1;
  function state() {
    const win = pageWindow();
    if (win[KEY3]) {
      if (win[KEY3].apiVersion !== API_VERSION4) {
        console.warn(
          `[gg-kit] shared panorama hook version mismatch (${win[KEY3].apiVersion} vs ${API_VERSION4})`
        );
      }
      return win[KEY3];
    }
    const value = {
      installed: false,
      apiVersion: API_VERSION4,
      listeners: /* @__PURE__ */ new Set(),
      last: null,
      retry: null
    };
    win[KEY3] = value;
    return value;
  }
  function emit(location2) {
    const current = state();
    if (current.last && current.last.lat === location2.lat && current.last.lng === location2.lng && current.last.panoId === location2.panoId) {
      return;
    }
    current.last = location2;
    for (const listener of [...current.listeners]) {
      try {
        listener(location2);
      } catch (error) {
        console.warn("[gg-kit] panorama listener failed", error);
      }
    }
  }
  function readPanorama(pano, source) {
    try {
      const position = typeof pano?.getPosition === "function" ? pano.getPosition() : null;
      const panoId = typeof pano?.getPano === "function" ? pano.getPano() : null;
      const lat = Number(position?.lat?.());
      const lng = Number(position?.lng?.());
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        emit({ lat, lng, panoId: panoId || null, source, instance: pano });
      }
    } catch {
    }
  }
  function installPanoramaHook() {
    const current = state();
    if (current.installed) return true;
    const google = pageWindow().google;
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
        }, 500);
      }
      return false;
    }
    const originalSetPano = proto.setPano;
    if (typeof originalSetPano === "function") {
      proto.setPano = function(...args) {
        const result = originalSetPano.apply(this, args);
        readPanorama(this, "setPano");
        return result;
      };
    }
    const originalSetPosition = proto.setPosition;
    if (typeof originalSetPosition === "function") {
      proto.setPosition = function(...args) {
        const result = originalSetPosition.apply(this, args);
        readPanorama(this, "setPosition");
        return result;
      };
    }
    current.installed = true;
    return true;
  }
  function onPanoramaChange(listener) {
    const current = state();
    current.listeners.add(listener);
    if (current.last) listener(current.last);
    installPanoramaHook();
    return () => current.listeners.delete(listener);
  }

  // ../gg-kit/src/storage/json-store.ts
  function area2(kind) {
    try {
      return kind === "session" ? sessionStorage : localStorage;
    } catch {
      return null;
    }
  }
  function isEnvelope(value) {
    return !!value && typeof value === "object" && "v" in value && "data" in value;
  }
  function createJsonStore(options) {
    const storage = area2(options.area);
    return {
      key: options.key,
      get available() {
        return !!storage;
      },
      get() {
        if (!storage) return null;
        try {
          const raw = storage.getItem(options.key);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!isEnvelope(parsed) || parsed.v !== options.version) return null;
          return parsed.data;
        } catch {
          return null;
        }
      },
      set(value) {
        if (!storage) return;
        try {
          storage.setItem(options.key, JSON.stringify({ v: options.version, data: value }));
        } catch (error) {
          console.warn(`[gg-kit] could not persist ${options.key}`, error);
        }
      },
      remove() {
        try {
          storage?.removeItem(options.key);
        } catch {
        }
      },
      dispose() {
      }
    };
  }

  // ../gg-kit/src/ws.ts
  var KEY4 = "__GG_KIT_WS__";
  var API_VERSION5 = 1;
  function state2() {
    const win = pageWindow();
    if (win[KEY4]) {
      if (win[KEY4].apiVersion !== API_VERSION5) {
        console.warn(
          `[gg-kit] shared WebSocket hook version mismatch (${win[KEY4].apiVersion} vs ${API_VERSION5})`
        );
      }
      return win[KEY4];
    }
    const target = pageWindow();
    const Original = target.WebSocket;
    if (typeof Original !== "function") return null;
    const next = {
      installed: false,
      apiVersion: API_VERSION5,
      json: /* @__PURE__ */ new Set(),
      binary: /* @__PURE__ */ new Set(),
      send: /* @__PURE__ */ new Set(),
      open: /* @__PURE__ */ new Set(),
      close: /* @__PURE__ */ new Set(),
      sockets: /* @__PURE__ */ new Set()
    };
    const Wrapped = new Proxy(Original, {
      construct(Target, args, newTarget) {
        const socket = Reflect.construct(
          Target,
          args,
          newTarget === Wrapped ? Target : newTarget
        );
        next.sockets.add(socket);
        socket.addEventListener("open", () => {
          for (const callback of next.open) safe(() => callback(socket));
        });
        socket.addEventListener("close", () => {
          next.sockets.delete(socket);
          for (const callback of next.close) safe(() => callback(socket));
        });
        socket.addEventListener("message", (event) => {
          if (typeof event.data === "string") {
            let parsed;
            try {
              parsed = JSON.parse(event.data);
            } catch {
              return;
            }
            for (const callback of next.json) safe(() => callback(parsed, socket));
            return;
          }
          const binary = toView(event.data);
          if (!binary) return;
          for (const callback of next.binary) safe(() => callback(binary, socket));
        });
        const originalSend = socket.send;
        socket.send = function(data) {
          for (const callback of next.send)
            safe(() => callback(data, socket));
          return originalSend.call(this, data);
        };
        return socket;
      }
    });
    target.WebSocket = Wrapped;
    next.installed = true;
    win[KEY4] = next;
    return next;
  }
  function safe(callback) {
    try {
      callback();
    } catch (error) {
      console.warn("[gg-kit] websocket listener failed", error);
    }
  }
  function toView(data) {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) return data;
    return null;
  }
  function onJsonMessage(callback) {
    const current = state2();
    if (!current) return () => {
    };
    current.json.add(callback);
    return () => current.json.delete(callback);
  }
  function onSendMessage(callback) {
    const current = state2();
    if (!current) return () => {
    };
    current.send.add(callback);
    return () => current.send.delete(callback);
  }
  function onSocketClose(callback) {
    const current = state2();
    if (!current) return () => {
    };
    current.close.add(callback);
    return () => current.close.delete(callback);
  }

  // src/core/config.ts
  var config_exports = {};
  __export(config_exports, {
    ACTIVATION_KEYS: () => ACTIVATION_KEYS,
    filterCountryOptions: () => filterCountryOptions,
    resolveConfig: () => resolveConfig
  });

  // src/core/constants.ts
  var constants_exports = {};
  __export(constants_exports, {
    CASE_CRATES: () => CASE_CRATES,
    CASE_CRATE_BY_ID: () => CASE_CRATE_BY_ID,
    CASE_HINT_TYPES: () => CASE_HINT_TYPES,
    CASE_LEGACY_STORAGE_PREFIXES: () => CASE_LEGACY_STORAGE_PREFIXES,
    CASE_MAX_HINTS: () => CASE_MAX_HINTS,
    CASE_RARITIES: () => CASE_RARITIES,
    CASE_RARITY_BY_ID: () => CASE_RARITY_BY_ID,
    CASE_STORAGE_PREFIX: () => CASE_STORAGE_PREFIX,
    CENTER_BIAS_FALLOFF: () => CENTER_BIAS_FALLOFF,
    CONFIG: () => CONFIG,
    CONFIG_DEFAULTS: () => CONFIG_DEFAULTS,
    DEG: () => DEG,
    HEATMAP_RAMP: () => HEATMAP_RAMP,
    HEATMAP_UNIFORM_COLOR: () => HEATMAP_UNIFORM_COLOR
  });
  var CENTER_BIAS_FALLOFF = 12;
  var HEATMAP_RAMP = [
    [0, [56, 132, 255, 0]],
    [0.35, [72, 193, 255, 0.24]],
    [0.65, [255, 214, 64, 0.38]],
    [0.85, [255, 122, 48, 0.5]],
    [1, [255, 56, 40, 0.58]]
  ];
  var HEATMAP_UNIFORM_COLOR = "rgba(64, 150, 255, 0.16)";
  var CASE_MAX_HINTS = 3;
  var CASE_STORAGE_PREFIX = "geogamble.cases.v3:";
  var CASE_LEGACY_STORAGE_PREFIXES = ["geogamble.cases.v2:"];
  var CASE_RARITIES = [
    { id: "common", label: "Common", color: "#4b69ff", soft: "rgba(75,105,255,.18)", rank: 0 },
    { id: "uncommon", label: "Uncommon", color: "#8847ff", soft: "rgba(136,71,255,.2)", rank: 1 },
    { id: "rare", label: "Rare", color: "#d32ce6", soft: "rgba(211,44,230,.22)", rank: 2 },
    { id: "epic", label: "Epic", color: "#eb4b4b", soft: "rgba(235,75,75,.24)", rank: 3 },
    { id: "legendary", label: "Legendary", color: "#ffd700", soft: "rgba(255,215,0,.26)", rank: 4 },
    { id: "mythic", label: "Mythic", color: "#fff4b0", soft: "rgba(255,244,176,.32)", rank: 5 }
  ];
  var CASE_RARITY_BY_ID = new Map(CASE_RARITIES.map((rarity) => [rarity.id, rarity]));
  var CASE_CRATES = [
    {
      id: "scout",
      name: "Scout Case",
      blurb: "A reliable field kit with broad terrain clues.",
      weights: { common: 60, uncommon: 30, rare: 9, epic: 1 }
    },
    {
      id: "surveyor",
      name: "Surveyor Case",
      blurb: "Survey tools for narrowing down the search area.",
      weights: { common: 10, uncommon: 40, rare: 35, epic: 13, legendary: 2 }
    },
    {
      id: "relic",
      name: "Relic Case",
      blurb: "A rare cache with precision coordinates and exact finds.",
      weights: { uncommon: 10, rare: 30, epic: 35, legendary: 20, mythic: 5 }
    }
  ];
  var CASE_CRATE_BY_ID = new Map(CASE_CRATES.map((crate) => [crate.id, crate]));
  var CASE_HINT_TYPES = [
    {
      id: "hemisphere",
      family: "position",
      rarity: "common",
      label: "Hemisphere",
      requiresCountry: false,
      scope: "global",
      source: "geometry"
    },
    {
      id: "longitude-half",
      family: "position",
      rarity: "common",
      label: "Longitude Half",
      requiresCountry: false,
      scope: "global",
      source: "geometry"
    },
    {
      id: "tropical-band",
      family: "position",
      rarity: "common",
      label: "Tropical or Not",
      requiresCountry: false,
      scope: "global",
      source: "geometry"
    },
    {
      id: "landlocked",
      family: "environment",
      rarity: "common",
      label: "Coastal or Landlocked",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "island-nation",
      family: "environment",
      rarity: "common",
      label: "Island or Mainland",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "continent",
      family: "environment",
      rarity: "uncommon",
      label: "Continent",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "climate-group",
      family: "environment",
      rarity: "uncommon",
      label: "Climate Group",
      requiresCountry: false,
      scope: "local",
      source: "climateGrid"
    },
    {
      id: "elevation-band",
      family: "environment",
      rarity: "uncommon",
      label: "Elevation Band",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "population-density",
      family: "environment",
      rarity: "uncommon",
      label: "Population Density",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "subregion",
      family: "society",
      rarity: "rare",
      label: "UN Subregion",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "script-family",
      family: "society",
      rarity: "rare",
      label: "Script Family",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "language-family",
      family: "society",
      rarity: "rare",
      label: "Language Family",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "currency",
      family: "society",
      rarity: "rare",
      label: "Currency",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "tld",
      family: "society",
      rarity: "rare",
      label: "Internet TLD",
      requiresCountry: true,
      scope: "country",
      source: "countryTraits"
    },
    {
      id: "country-name",
      family: "identity",
      rarity: "epic",
      label: "Country Name",
      requiresCountry: true,
      scope: "country",
      source: "countryData"
    },
    {
      id: "country-flag",
      family: "identity",
      rarity: "epic",
      label: "Country Flag",
      requiresCountry: true,
      scope: "country",
      source: "countryData"
    },
    {
      id: "country-outline",
      family: "identity",
      rarity: "epic",
      label: "Country Outline",
      requiresCountry: true,
      scope: "country",
      source: "countryData"
    },
    {
      id: "country-iso",
      family: "identity",
      rarity: "epic",
      label: "Country Code",
      requiresCountry: true,
      scope: "country",
      source: "countryData"
    },
    {
      id: "nearest-city",
      family: "precision",
      rarity: "legendary",
      label: "Nearest Major City",
      requiresCountry: false,
      scope: "local",
      source: "majorCities"
    },
    {
      id: "radius-50",
      family: "precision",
      rarity: "legendary",
      label: "50 km Radius",
      requiresCountry: false,
      scope: "local",
      source: "geometry"
    },
    {
      id: "radius-20",
      family: "precision",
      rarity: "legendary",
      label: "20 km Radius",
      requiresCountry: false,
      scope: "local",
      source: "geometry"
    },
    {
      id: "coords-01",
      family: "precision",
      rarity: "legendary",
      label: "1 Degree Coordinates",
      requiresCountry: false,
      scope: "local",
      source: "geometry"
    },
    {
      id: "coords-005",
      family: "precision",
      rarity: "legendary",
      label: "0.05 Degree Coordinates",
      requiresCountry: false,
      scope: "local",
      source: "geometry"
    },
    {
      id: "exact",
      family: "precision",
      rarity: "mythic",
      label: "Exact Location",
      requiresCountry: false,
      scope: "exact",
      source: "geometry"
    }
  ];
  var CONFIG = {
    enabledCountries: "all",
    excludeCountries: [],
    animationMs: 2800,
    startIntervalMs: 45,
    endIntervalMs: 320,
    finalHoldMs: 250,
    sound: true,
    volume: 0.35,
    autoSubmit: false,
    submitDelayMs: 250,
    duelSubmitPin: true,
    duelSubmitHop: false,
    activationKey: "none",
    allowOtherModes: true,
    perfTweaks: true,
    centerBias: 0,
    heatmapOverlay: false,
    debug: false
  };
  var CONFIG_DEFAULTS = { ...CONFIG };
  var DEG = Math.PI / 180;

  // src/core/countries.generated.js
  var COUNTRY_DATA = [
    { "iso": "af", "name": "Afghanistan", "polygons": [[[[66.52, 37.36], [67.08, 37.36], [67.83, 37.14], [68.14, 37.02], [68.86, 37.34], [69.2, 37.15], [69.52, 37.61], [70.12, 37.59], [70.27, 37.74], [70.38, 38.14], [70.81, 38.49], [71.35, 38.26], [71.24, 37.95], [71.54, 37.91], [71.45, 37.07], [71.84, 36.74], [72.19, 36.95], [72.64, 37.05], [73.26, 37.5], [73.95, 37.42], [74.98, 37.42], [75.16, 37.13], [74.58, 37.02], [74.07, 36.84], [72.92, 36.72], [71.85, 36.51], [71.26, 36.07], [71.5, 35.65], [71.61, 35.15], [71.12, 34.73], [71.16, 34.35], [70.88, 33.99], [69.93, 34.02], [70.32, 33.36], [69.69, 33.11], [69.26, 32.5], [69.32, 31.9], [68.93, 31.62], [68.56, 31.71], [67.79, 31.58], [67.68, 31.3], [66.94, 31.3], [66.38, 30.74], [66.35, 29.89], [65.05, 29.47], [64.35, 29.56], [64.15, 29.34], [63.55, 29.47], [62.55, 29.32], [60.87, 29.83], [61.78, 30.74], [61.7, 31.38], [60.94, 31.55], [60.86, 32.18], [60.54, 32.98], [60.96, 33.53], [60.53, 33.68], [60.8, 34.4], [61.21, 35.65], [62.23, 35.27], [62.98, 35.4], [63.19, 35.86], [63.98, 36.01], [64.55, 36.31], [64.75, 37.11], [65.59, 37.31], [65.75, 37.66], [66.22, 37.39], [66.52, 37.36]]]], "mainOnly": true },
    { "iso": "al", "name": "Albania", "polygons": [[[[21.02, 40.84], [21, 40.58], [20.67, 40.44], [20.62, 40.11], [20.15, 39.62], [19.98, 39.69], [19.96, 39.92], [19.41, 40.25], [19.32, 40.73], [19.4, 41.41], [19.54, 41.72], [19.37, 41.88], [19.3, 42.2], [19.74, 42.69], [19.8, 42.5], [20.07, 42.59], [20.28, 42.32], [20.52, 42.22], [20.59, 41.86], [20.46, 41.52], [20.61, 41.09], [21.02, 40.84]]]], "mainOnly": true },
    { "iso": "dz", "name": "Algeria", "polygons": [[[[-8.68, 27.4], [-8.67, 27.59], [-8.67, 27.66], [-8.67, 28.84], [-7.06, 29.58], [-6.06, 29.73], [-5.24, 30], [-4.86, 30.5], [-3.69, 30.9], [-3.65, 31.64], [-3.07, 31.72], [-2.62, 32.09], [-1.31, 32.26], [-1.12, 32.65], [-1.39, 32.86], [-1.73, 33.92], [-1.79, 34.53], [-2.17, 35.17], [-1.21, 35.71], [-0.13, 35.89], [0.5, 36.3], [1.47, 36.61], [3.16, 36.78], [4.82, 36.87], [5.32, 36.72], [6.26, 37.11], [7.33, 37.12], [7.74, 36.89], [8.42, 36.95], [8.22, 36.43], [8.38, 35.48], [8.14, 34.66], [7.52, 34.1], [7.61, 33.34], [8.43, 32.75], [8.44, 32.51], [9.06, 32.1], [9.48, 30.31], [9.81, 29.42], [9.86, 28.96], [9.68, 28.14], [9.76, 27.69], [9.63, 27.14], [9.72, 26.51], [9.32, 26.09], [9.91, 25.37], [9.95, 24.94], [10.3, 24.38], [10.77, 24.56], [11.56, 24.1], [12, 23.47], [8.57, 21.57], [5.68, 19.6], [4.27, 19.16], [3.16, 19.06], [3.15, 19.69], [2.68, 19.86], [2.06, 20.14], [1.82, 20.61], [-1.55, 22.79], [-4.92, 24.97], [-8.68, 27.4]]]], "mainOnly": true },
    { "iso": "ao", "name": "Angola", "polygons": [[[[13, -4.78], [12.63, -4.99], [12.47, -5.25], [12.44, -5.68], [12.18, -5.79], [11.91, -5.04], [12.32, -4.61], [12.62, -4.44], [13, -4.78]]], [[[12.32, -6.1], [12.74, -5.97], [13.02, -5.98], [13.38, -5.86], [16.33, -5.88], [16.57, -6.62], [16.86, -7.22], [17.09, -7.55], [17.47, -8.07], [18.13, -7.99], [18.46, -7.85], [19.02, -7.99], [19.17, -7.74], [19.42, -7.16], [20.04, -7.12], [20.09, -6.94], [20.6, -6.94], [20.51, -7.3], [21.73, -7.29], [21.75, -7.92], [21.95, -8.31], [21.8, -8.91], [21.88, -9.52], [22.21, -9.89], [22.16, -11.08], [22.4, -10.99], [22.84, -11.02], [23.46, -10.87], [23.91, -10.93], [24.02, -11.24], [23.9, -11.72], [24.08, -12.19], [23.93, -12.57], [24.02, -12.91], [21.93, -12.9], [21.89, -16.08], [22.56, -16.9], [23.22, -17.52], [21.38, -17.93], [18.96, -17.79], [18.26, -17.31], [14.21, -17.35], [14.06, -17.42], [13.46, -16.97], [12.81, -16.94], [12.22, -17.11], [11.73, -17.3], [11.64, -16.67], [11.78, -15.79], [12.12, -14.88], [12.18, -14.45], [12.5, -13.55], [12.74, -13.14], [13.31, -12.48], [13.63, -12.04], [13.74, -11.3], [13.69, -10.73], [13.39, -10.37], [13.12, -9.77], [12.88, -9.17], [12.93, -8.96], [13.24, -8.56], [12.93, -7.6], [12.73, -6.93], [12.23, -6.29], [12.32, -6.1]]]], "mainOnly": true },
    { "iso": "aq", "name": "Antarctica", "polygons": [[[[-48.66, -78.05], [-48.15, -78.05], [-46.66, -77.83], [-45.15, -78.05], [-43.92, -78.48], [-43.49, -79.09], [-43.37, -79.52], [-43.33, -80.03], [-44.88, -80.34], [-46.51, -80.59], [-48.39, -80.83], [-50.48, -81.03], [-52.85, -80.97], [-54.16, -80.63], [-53.99, -80.22], [-51.85, -79.95], [-50.99, -79.61], [-50.36, -79.18], [-49.91, -78.81], [-49.31, -78.46], [-48.66, -78.05]]], [[[-66.29, -80.26], [-64.04, -80.29], [-61.88, -80.39], [-61.14, -79.98], [-60.61, -79.63], [-59.57, -80.04], [-59.87, -80.55], [-60.16, -81], [-62.26, -80.86], [-64.49, -80.92], [-65.74, -80.59], [-65.74, -80.55], [-66.29, -80.26]]], [[[-73.92, -71.27], [-73.23, -71.15], [-72.07, -71.19], [-71.78, -70.68], [-71.72, -70.31], [-71.74, -69.51], [-71.17, -69.04], [-70.25, -68.88], [-69.72, -69.25], [-69.49, -69.62], [-69.06, -70.07], [-68.73, -70.51], [-68.45, -70.96], [-68.33, -71.41], [-68.51, -71.8], [-68.78, -72.17], [-69.96, -72.31], [-71.08, -72.5], [-72.39, -72.48], [-71.9, -72.09], [-73.07, -72.23], [-74.19, -72.37], [-74.95, -72.07], [-75.01, -71.66], [-73.92, -71.27]]], [[[-102.33, -71.89], [-101.7, -71.72], [-100.43, -71.85], [-98.98, -71.93], [-97.88, -72.07], [-96.79, -71.95], [-96.2, -72.52], [-96.98, -72.44], [-98.2, -72.48], [-99.43, -72.44], [-100.78, -72.5], [-101.8, -72.31], [-102.33, -71.89]]], [[[-122.62, -73.66], [-122.41, -73.32], [-121.21, -73.5], [-119.92, -73.66], [-118.72, -73.48], [-119.29, -73.83], [-120.23, -74.09], [-121.62, -74.01], [-122.62, -73.66]]], [[[-127.28, -73.46], [-126.56, -73.25], [-125.56, -73.48], [-124.03, -73.87], [-124.62, -73.83], [-125.91, -73.74], [-127.28, -73.46]]], [[[-163.71, -78.6], [-163.11, -78.22], [-161.25, -78.38], [-160.25, -78.69], [-159.48, -79.05], [-159.21, -79.5], [-161.13, -79.63], [-162.44, -79.28], [-163.03, -78.93], [-163.07, -78.87], [-163.71, -78.6]]], [[[180, -84.71], [180, -90], [-180, -90], [-180, -84.71], [-179.94, -84.72], [-179.06, -84.14], [-177.26, -84.45], [-177.14, -84.42], [-176.08, -84.1], [-175.95, -84.11], [-175.83, -84.12], [-174.38, -84.53], [-173.12, -84.12], [-172.89, -84.06], [-169.95, -83.88], [-169, -84.12], [-168.53, -84.24], [-167.02, -84.57], [-164.18, -84.83], [-161.93, -85.14], [-158.07, -85.37], [-155.19, -85.1], [-150.94, -85.3], [-148.53, -85.61], [-145.89, -85.32], [-143.11, -85.04], [-142.89, -84.57], [-146.83, -84.53], [-150.06, -84.3], [-150.9, -83.9], [-153.59, -83.69], [-153.41, -83.24], [-153.04, -82.83], [-152.67, -82.45], [-152.86, -82.04], [-154.53, -81.77], [-155.29, -81.42], [-156.84, -81.1], [-154.41, -81.16], [-152.1, -81], [-150.65, -81.34], [-148.87, -81.04], [-147.22, -80.67], [-146.42, -80.34], [-146.77, -79.93], [-148.06, -79.65], [-149.53, -79.36], [-151.59, -79.3], [-153.39, -79.16], [-155.33, -79.06], [-155.98, -78.69], [-157.27, -78.38], [-158.05, -78.03], [-158.37, -76.89], [-157.88, -76.99], [-156.97, -77.3], [-155.33, -77.2], [-153.74, -77.07], [-152.92, -77.5], [-151.33, -77.4], [-150, -77.18], [-148.75, -76.91], [-147.61, -76.58], [-146.1, -76.48], [-146.14, -76.11], [-146.5, -75.73], [-146.2, -75.38], [-144.91, -75.2], [-144.32, -75.54], [-142.79, -75.34], [-141.64, -75.09], [-140.21, -75.07], [-138.86, -74.97], [-137.51, -74.73], [-136.43, -74.52], [-135.21, -74.3], [-134.43, -74.36], [-133.75, -74.44], [-132.26, -74.3], [-130.93, -74.48], [-129.55, -74.46], [-128.24, -74.32], [-126.89, -74.42], [-125.4, -74.52], [-124.01, -74.48], [-122.56, -74.5], [-121.07, -74.52], [-119.7, -74.48], [-118.68, -74.19], [-117.47, -74.03], [-116.22, -74.24], [-115.02, -74.07], [-113.94, -73.71], [-113.3, -74.03], [-112.95, -74.38], [-112.3, -74.71], [-111.26, -74.42], [-110.07, -74.79], [-108.71, -74.91], [-107.56, -75.18], [-106.15, -75.13], [-104.88, -74.95], [-103.37, -74.99], [-102.02, -75.13], [-100.65, -75.3], [-100.12, -74.87], [-100.76, -74.54], [-101.25, -74.19], [-102.55, -74.11], [-103.11, -73.73], [-103.33, -73.36], [-103.68, -72.62], [-102.92, -72.75], [-101.61, -72.81], [-100.31, -72.75], [-99.14, -72.91], [-98.12, -73.21], [-97.69, -73.56], [-96.34, -73.62], [-95.04, -73.48], [-93.67, -73.28], [-92.44, -73.17], [-91.42, -73.4], [-90.09, -73.32], [-89.23, -72.56], [-88.42, -73.01], [-87.27, -73.19], [-86.01, -73.09], [-85.19, -73.48], [-83.88, -73.52], [-82.67, -73.64], [-81.47, -73.85], [-80.69, -73.48], [-80.3, -73.13], [-79.3, -73.52], [-77.93, -73.42], [-76.91, -73.64], [-76.22, -73.97], [-74.89, -73.87], [-73.85, -73.66], [-72.83, -73.4], [-71.62, -73.26], [-70.21, -73.15], [-68.94, -73.01], [-67.96, -72.79], [-67.37, -72.48], [-67.13, -72.05], [-67.25, -71.64], [-67.56, -71.25], [-67.92, -70.85], [-68.23, -70.46], [-68.49, -70.11], [-68.54, -69.72], [-68.45, -69.33], [-67.98, -68.95], [-67.58, -68.54], [-67.43, -68.15], [-67.62, -67.72], [-67.74, -67.33], [-67.25, -66.88], [-66.7, -66.58], [-66.06, -66.21], [-65.37, -65.9], [-64.57, -65.6], [-64.18, -65.17], [-63.63, -64.9], [-63, -64.64], [-62.04, -64.58], [-61.41, -64.27], [-60.71, -64.07], [-59.89, -63.96], [-59.16, -63.7], [-58.59, -63.39], [-57.81, -63.27], [-57.22, -63.53], [-57.6, -63.86], [-58.61, -64.15], [-59.05, -64.37], [-59.79, -64.21], [-60.61, -64.31], [-61.3, -64.54], [-62.02, -64.8], [-62.51, -65.09], [-62.65, -65.48], [-62.59, -65.86], [-62.12, -66.19], [-62.81, -66.43], [-63.75, -66.5], [-64.29, -66.84], [-64.88, -67.15], [-65.51, -67.58], [-65.67, -67.95], [-65.31, -68.37], [-64.78, -68.68], [-63.96, -68.91], [-63.2, -69.23], [-62.79, -69.62], [-62.57, -69.99], [-62.28, -70.38], [-61.81, -70.72], [-61.51, -71.09], [-61.38, -72.01], [-61.08, -72.38], [-61, -72.77], [-60.69, -73.17], [-60.83, -73.7], [-61.38, -74.11], [-61.96, -74.44], [-63.3, -74.58], [-63.75, -74.93], [-64.35, -75.26], [-65.86, -75.64], [-67.19, -75.79], [-68.45, -76.01], [-69.8, -76.22], [-70.6, -76.63], [-72.21, -76.67], [-73.97, -76.63], [-75.56, -76.71], [-77.24, -76.71], [-76.93, -77.1], [-75.4, -77.28], [-74.28, -77.56], [-73.66, -77.91], [-74.77, -78.22], [-76.5, -78.12], [-77.93, -78.38], [-77.98, -78.79], [-78.02, -79.18], [-76.85, -79.51], [-76.63, -79.89], [-75.36, -80.26], [-73.24, -80.42], [-71.44, -80.69], [-70.01, -81], [-68.19, -81.32], [-65.7, -81.47], [-63.26, -81.75], [-61.55, -82.04], [-59.69, -82.38], [-58.71, -82.85], [-58.22, -83.22], [-57.01, -82.87], [-55.36, -82.57], [-53.62, -82.26], [-51.54, -82], [-49.76, -81.73], [-47.27, -81.71], [-44.83, -81.85], [-42.81, -82.08], [-42.16, -81.65], [-40.77, -81.36], [-38.24, -81.34], [-36.27, -81.12], [-34.39, -80.91], [-32.31, -80.77], [-30.1, -80.59], [-28.55, -80.34], [-29.25, -79.99], [-29.69, -79.63], [-29.69, -79.26], [-31.62, -79.3], [-33.68, -79.46], [-35.64, -79.46], [-35.91, -79.08], [-35.78, -78.34], [-35.33, -78.12], [-33.9, -77.89], [-32.21, -77.65], [-31, -77.36], [-29.78, -77.07], [-28.88, -76.67], [-27.51, -76.5], [-26.16, -76.36], [-25.47, -76.28], [-23.93, -76.24], [-22.46, -76.11], [-21.22, -75.91], [-20.01, -75.67], [-18.91, -75.44], [-17.52, -75.13], [-16.64, -74.79], [-15.7, -74.5], [-15.41, -74.11], [-16.47, -73.87], [-16.11, -73.46], [-15.45, -73.15], [-14.41, -72.95], [-13.31, -72.72], [-12.29, -72.4], [-11.51, -72.01], [-11.02, -71.54], [-10.3, -71.27], [-9.1, -71.32], [-8.61, -71.66], [-7.42, -71.7], [-7.38, -71.32], [-6.87, -70.93], [-5.79, -71.03], [-5.54, -71.4], [-4.34, -71.46], [-3.05, -71.29], [-1.8, -71.17], [-0.66, -71.23], [-0.23, -71.64], [0.87, -71.3], [1.89, -71.13], [3.02, -70.99], [4.14, -70.85], [5.16, -70.62], [6.27, -70.46], [7.14, -70.25], [7.74, -69.89], [8.49, -70.15], [9.53, -70.01], [10.25, -70.48], [10.82, -70.83], [11.95, -70.64], [12.4, -70.25], [13.42, -69.97], [14.73, -70.03], [15.13, -70.4], [15.95, -70.03], [17.03, -69.91], [18.2, -69.87], [19.26, -69.89], [20.38, -70.01], [21.45, -70.07], [21.92, -70.4], [22.57, -70.7], [23.67, -70.52], [24.84, -70.48], [25.98, -70.48], [27.09, -70.46], [28.09, -70.32], [29.15, -70.21], [30.03, -69.93], [30.97, -69.76], [31.99, -69.66], [32.75, -69.38], [33.3, -68.84], [33.87, -68.5], [34.91, -68.66], [35.3, -69.01], [36.16, -69.25], [37.2, -69.17], [37.91, -69.52], [38.65, -69.78], [39.67, -69.54], [40.02, -69.11], [40.92, -68.93], [41.96, -68.6], [42.94, -68.46], [44.11, -68.27], [44.9, -68.05], [45.72, -67.82], [46.5, -67.6], [47.44, -67.72], [48.34, -67.37], [48.99, -67.09], [49.93, -67.11], [50.75, -66.88], [50.95, -66.52], [51.79, -66.25], [52.61, -66.05], [53.61, -65.9], [54.53, -65.82], [55.41, -65.88], [56.36, -65.97], [57.16, -66.25], [57.26, -66.68], [58.14, -67.01], [58.74, -67.29], [59.94, -67.41], [60.61, -67.68], [61.43, -67.95], [62.39, -68.01], [63.19, -67.82], [64.05, -67.41], [64.99, -67.62], [65.97, -67.74], [66.91, -67.86], [67.89, -67.93], [68.89, -67.93], [69.71, -68.97], [69.67, -69.23], [69.56, -69.68], [68.6, -69.93], [67.81, -70.31], [67.95, -70.7], [69.07, -70.68], [68.93, -71.07], [68.42, -71.44], [67.95, -71.85], [68.71, -72.17], [69.87, -72.26], [71.02, -72.09], [71.57, -71.7], [71.91, -71.32], [72.45, -71.01], [73.08, -70.72], [73.34, -70.36], [73.86, -69.87], [74.49, -69.78], [75.63, -69.74], [76.63, -69.62], [77.64, -69.46], [78.13, -69.07], [78.43, -68.7], [79.11, -68.33], [80.09, -68.07], [80.94, -67.88], [81.48, -67.54], [82.05, -67.37], [82.78, -67.21], [83.78, -67.31], [84.68, -67.21], [85.66, -67.09], [86.75, -67.15], [87.48, -66.88], [87.99, -66.21], [88.36, -66.48], [88.83, -66.95], [89.67, -67.15], [90.63, -67.23], [91.59, -67.11], [92.61, -67.19], [93.55, -67.21], [94.18, -67.11], [95.02, -67.17], [95.78, -67.39], [96.68, -67.25], [97.76, -67.25], [98.68, -67.11], [99.72, -67.25], [100.38, -66.92], [100.89, -66.58], [101.58, -66.31], [102.83, -65.56], [103.48, -65.7], [104.24, -65.97], [104.91, -66.33], [106.18, -66.93], [107.16, -66.95], [108.08, -66.95], [109.16, -66.84], [110.24, -66.7], [111.06, -66.43], [111.74, -66.13], [112.86, -66.09], [113.6, -65.88], [114.39, -66.07], [114.9, -66.39], [115.6, -66.7], [116.7, -66.66], [117.38, -66.92], [118.58, -67.17], [119.83, -67.27], [120.87, -67.19], [121.65, -66.88], [122.32, -66.56], [123.22, -66.48], [124.12, -66.62], [125.16, -66.72], [126.1, -66.56], [127, -66.56], [127.88, -66.66], [128.8, -66.76], [129.7, -66.58], [130.78, -66.43], [131.8, -66.39], [132.94, -66.39], [133.86, -66.29], [134.76, -66.21], [135.03, -65.72], [135.07, -65.31], [135.7, -65.58], [135.87, -66.03], [136.21, -66.45], [136.62, -66.78], [137.46, -66.95], [138.6, -66.9], [139.91, -66.88], [140.81, -66.82], [142.12, -66.82], [143.06, -66.8], [144.37, -66.84], [145.49, -66.92], [146.2, -67.23], [146, -67.6], [146.65, -67.9], [147.72, -68.13], [148.84, -68.39], [150.13, -68.56], [151.48, -68.72], [152.5, -68.87], [153.64, -68.89], [154.28, -68.56], [155.17, -68.84], [155.93, -69.15], [156.81, -69.38], [158.03, -69.48], [159.18, -69.6], [159.67, -69.99], [160.81, -70.23], [161.57, -70.58], [162.69, -70.74], [163.84, -70.72], [164.92, -70.78], [166.11, -70.76], [167.31, -70.83], [168.43, -70.97], [169.46, -71.21], [170.5, -71.4], [171.21, -71.7], [171.09, -72.09], [170.56, -72.44], [170.11, -72.89], [169.76, -73.24], [169.29, -73.66], [167.98, -73.81], [167.39, -74.17], [166.09, -74.38], [165.64, -74.77], [164.96, -75.15], [164.23, -75.46], [163.82, -75.87], [163.57, -76.24], [163.47, -76.69], [163.49, -77.07], [164.06, -77.46], [164.27, -77.83], [164.74, -78.18], [166.6, -78.32], [167, -78.75], [165.19, -78.91], [163.67, -79.12], [161.77, -79.16], [160.92, -79.73], [160.75, -80.2], [160.32, -80.57], [159.79, -80.95], [161.12, -81.28], [161.63, -81.69], [162.49, -82.06], [163.71, -82.4], [165.1, -82.71], [166.6, -83.02], [168.9, -83.34], [169.4, -83.83], [172.28, -84.04], [172.48, -84.12], [173.22, -84.41], [175.99, -84.16], [178.28, -84.47], [180, -84.71]]]], "mainOnly": true },
    { "iso": "ar", "name": "Argentina", "polygons": [[[[-68.63, -52.64], [-68.25, -53.1], [-67.75, -53.85], [-66.45, -54.45], [-65.05, -54.7], [-65.5, -55.2], [-66.45, -55.25], [-66.96, -54.9], [-67.56, -54.87], [-68.63, -54.87], [-68.63, -52.64]]], [[[-57.63, -30.22], [-57.87, -31.02], [-58.14, -32.04], [-58.13, -33.04], [-58.35, -33.26], [-58.43, -33.91], [-58.5, -34.43], [-57.23, -35.29], [-57.36, -35.98], [-56.74, -36.41], [-56.79, -36.9], [-57.75, -38.18], [-59.23, -38.72], [-61.24, -38.93], [-62.34, -38.83], [-62.13, -39.42], [-62.33, -40.17], [-62.15, -40.68], [-62.75, -41.03], [-63.77, -41.17], [-64.73, -40.8], [-65.12, -41.06], [-64.98, -42.06], [-64.3, -42.36], [-63.76, -42.04], [-63.46, -42.56], [-64.38, -42.87], [-65.18, -43.5], [-65.33, -44.5], [-65.57, -45.04], [-66.51, -45.04], [-67.29, -45.55], [-67.58, -46.3], [-66.6, -47.03], [-65.64, -47.24], [-65.99, -48.13], [-67.17, -48.7], [-67.82, -49.87], [-68.73, -50.26], [-69.14, -50.73], [-68.82, -51.77], [-68.15, -52.35], [-68.57, -52.3], [-69.5, -52.14], [-71.91, -52.01], [-72.33, -51.43], [-72.31, -50.68], [-72.98, -50.74], [-73.33, -50.38], [-73.42, -49.32], [-72.65, -48.88], [-72.33, -48.24], [-72.45, -47.74], [-71.92, -46.88], [-71.55, -45.56], [-71.66, -44.97], [-71.22, -44.78], [-71.33, -44.41], [-71.79, -44.21], [-71.46, -43.79], [-71.92, -43.41], [-72.15, -42.25], [-71.75, -42.05], [-71.92, -40.83], [-71.68, -39.81], [-71.41, -38.92], [-70.81, -38.55], [-71.12, -37.58], [-71.12, -36.66], [-70.36, -36.01], [-70.39, -35.17], [-69.82, -34.19], [-69.81, -33.27], [-70.07, -33.09], [-70.54, -31.37], [-69.92, -30.34], [-70.01, -29.37], [-69.66, -28.46], [-69, -27.52], [-68.3, -26.9], [-68.59, -26.51], [-68.39, -26.19], [-68.42, -24.52], [-67.33, -24.03], [-66.99, -22.99], [-67.11, -22.74], [-66.27, -21.83], [-64.96, -22.08], [-64.38, -22.8], [-63.99, -21.99], [-62.85, -22.03], [-62.69, -22.25], [-60.85, -23.88], [-60.03, -24.03], [-58.81, -24.77], [-57.78, -25.16], [-57.63, -25.6], [-58.62, -27.12], [-57.61, -27.4], [-56.49, -27.55], [-55.7, -27.39], [-54.79, -26.62], [-54.63, -25.74], [-54.13, -25.55], [-53.63, -26.12], [-53.65, -26.92], [-54.49, -27.47], [-55.16, -27.88], [-56.29, -28.85], [-57.63, -30.22]]]], "mainOnly": true },
    { "iso": "am", "name": "Armenia", "polygons": [[[[46.51, 38.77], [46.14, 38.74], [45.74, 39.32], [45.74, 39.47], [45.3, 39.47], [45, 39.74], [44.79, 39.71], [44.4, 40.01], [43.66, 40.25], [43.75, 40.74], [43.58, 41.09], [44.97, 41.25], [45.18, 40.99], [45.56, 40.81], [45.36, 40.56], [45.89, 40.22], [45.61, 39.9], [46.03, 39.63], [46.48, 39.46], [46.51, 38.77]]]], "mainOnly": true },
    { "iso": "au", "name": "Australia", "polygons": [[[[147.69, -40.81], [148.29, -40.88], [148.36, -42.06], [148.02, -42.41], [147.91, -43.21], [147.56, -42.94], [146.87, -43.63], [146.66, -43.58], [146.05, -43.55], [145.43, -42.69], [145.3, -42.03], [144.72, -41.16], [144.74, -40.7], [145.4, -40.79], [146.36, -41.14], [146.91, -41], [147.69, -40.81]]], [[[126.15, -32.22], [125.09, -32.73], [124.22, -32.96], [124.03, -33.48], [123.66, -33.89], [122.81, -33.91], [122.18, -34], [121.3, -33.82], [120.58, -33.93], [119.89, -33.98], [119.3, -34.51], [119.01, -34.46], [118.51, -34.75], [118.02, -35.06], [117.3, -35.03], [116.63, -35.03], [115.56, -34.39], [115.03, -34.2], [115.05, -33.62], [115.55, -33.49], [115.71, -33.26], [115.68, -32.9], [115.8, -32.21], [115.69, -31.61], [115.16, -30.6], [115, -30.03], [115.04, -29.46], [114.64, -28.81], [114.62, -28.52], [114.17, -28.12], [114.05, -27.33], [113.48, -26.54], [113.34, -26.12], [113.78, -26.55], [113.44, -25.62], [113.94, -25.91], [114.23, -26.3], [114.22, -25.79], [113.72, -25], [113.63, -24.68], [113.39, -24.38], [113.5, -23.81], [113.71, -23.56], [113.84, -23.06], [113.74, -22.48], [114.15, -21.76], [114.23, -22.52], [114.65, -21.83], [115.46, -21.5], [115.95, -21.07], [116.71, -20.7], [117.17, -20.62], [117.44, -20.75], [118.23, -20.37], [118.84, -20.26], [118.99, -20.04], [119.25, -19.95], [119.81, -19.98], [120.86, -19.68], [121.4, -19.24], [121.66, -18.71], [122.24, -18.2], [122.29, -17.8], [122.31, -17.25], [123.01, -16.41], [123.43, -17.27], [123.86, -17.07], [123.5, -16.6], [123.82, -16.11], [124.26, -16.33], [124.38, -15.57], [124.93, -15.08], [125.17, -14.68], [125.67, -14.51], [125.69, -14.23], [126.13, -14.35], [126.14, -14.1], [126.58, -13.95], [127.07, -13.82], [127.8, -14.28], [128.36, -14.87], [128.99, -14.88], [129.62, -14.97], [129.41, -14.42], [129.89, -13.62], [130.34, -13.36], [130.18, -13.11], [130.62, -12.54], [131.22, -12.18], [131.74, -12.3], [132.58, -12.11], [132.56, -11.6], [131.82, -11.27], [132.36, -11.13], [133.02, -11.38], [133.55, -11.79], [134.39, -12.04], [134.68, -11.94], [135.3, -12.25], [135.88, -11.96], [136.26, -12.05], [136.49, -11.86], [136.95, -12.35], [136.69, -12.89], [136.31, -13.29], [135.96, -13.32], [136.08, -13.72], [135.78, -14.22], [135.43, -14.72], [135.5, -15], [136.3, -15.55], [137.07, -15.87], [137.58, -16.22], [138.3, -16.81], [138.59, -16.81], [139.11, -17.06], [139.26, -17.37], [140.22, -17.71], [140.88, -17.37], [141.07, -16.83], [141.27, -16.39], [141.4, -15.84], [141.7, -15.04], [141.56, -14.56], [141.64, -14.27], [141.52, -13.7], [141.65, -12.94], [141.84, -12.74], [141.69, -12.41], [141.93, -11.88], [142.12, -11.33], [142.14, -11.04], [142.52, -10.67], [142.8, -11.16], [142.87, -11.78], [143.12, -11.91], [143.16, -12.33], [143.52, -12.83], [143.6, -13.4], [143.56, -13.76], [143.92, -14.55], [144.56, -14.17], [144.89, -14.59], [145.37, -14.98], [145.27, -15.43], [145.49, -16.29], [145.64, -16.78], [145.89, -16.91], [146.16, -17.76], [146.06, -18.28], [146.39, -18.96], [147.47, -19.48], [148.18, -19.96], [148.85, -20.39], [148.72, -20.63], [149.29, -21.26], [149.68, -22.34], [150.08, -22.12], [150.48, -22.56], [150.73, -22.4], [150.9, -23.46], [151.61, -24.08], [152.07, -24.46], [152.86, -25.27], [153.14, -26.07], [153.16, -26.64], [153.09, -27.26], [153.57, -28.11], [153.51, -29], [153.34, -29.46], [153.07, -30.35], [153.09, -30.92], [152.89, -31.64], [152.45, -32.55], [151.71, -33.04], [151.34, -33.82], [151.01, -34.31], [150.71, -35.17], [150.33, -35.67], [150.08, -36.42], [149.95, -37.11], [150, -37.43], [149.42, -37.77], [148.3, -37.81], [147.38, -38.22], [146.92, -38.61], [146.32, -39.04], [145.49, -38.59], [144.88, -38.42], [145.03, -37.9], [144.49, -38.09], [143.61, -38.81], [142.75, -38.54], [142.18, -38.38], [141.61, -38.31], [140.64, -38.02], [139.99, -37.4], [139.81, -36.64], [139.57, -36.14], [139.08, -35.73], [138.12, -35.61], [138.45, -35.13], [138.21, -34.38], [137.72, -35.08], [136.83, -35.26], [137.35, -34.71], [137.5, -34.13], [137.89, -33.64], [137.81, -32.9], [137, -33.75], [136.37, -34.09], [135.99, -34.89], [135.21, -34.48], [135.24, -33.95], [134.61, -33.22], [134.09, -32.85], [134.27, -32.62], [132.99, -32.01], [132.29, -31.98], [131.33, -31.5], [129.54, -31.59], [128.24, -31.95], [127.1, -32.28], [126.15, -32.22]]]], "mainOnly": true },
    { "iso": "at", "name": "Austria", "polygons": [[[[16.98, 48.12], [16.9, 47.71], [16.34, 47.71], [16.53, 47.5], [16.2, 46.85], [16.01, 46.68], [15.14, 46.66], [14.63, 46.43], [13.81, 46.51], [12.38, 46.77], [12.15, 47.12], [11.16, 46.94], [11.05, 46.75], [10.44, 46.89], [9.93, 46.92], [9.48, 47.1], [9.63, 47.35], [9.59, 47.53], [9.9, 47.58], [10.4, 47.3], [10.54, 47.57], [11.43, 47.52], [12.14, 47.7], [12.62, 47.67], [12.93, 47.47], [13.03, 47.64], [12.88, 48.29], [13.24, 48.42], [13.6, 48.88], [14.34, 48.56], [14.9, 48.96], [15.25, 49.04], [16.03, 48.73], [16.5, 48.79], [16.96, 48.6], [16.88, 48.47], [16.98, 48.12]]]], "mainOnly": true },
    { "iso": "az", "name": "Azerbaijan", "polygons": [[[[46.4, 41.86], [46.69, 41.83], [47.37, 41.22], [47.82, 41.15], [47.99, 41.41], [48.58, 41.81], [49.11, 41.28], [49.62, 40.57], [50.08, 40.53], [50.39, 40.26], [49.57, 40.18], [49.4, 39.4], [49.22, 39.05], [48.86, 38.82], [48.88, 38.32], [48.63, 38.27], [48.01, 38.79], [48.36, 39.29], [48.06, 39.58], [47.69, 39.51], [46.51, 38.77], [46.48, 39.46], [46.03, 39.63], [45.61, 39.9], [45.89, 40.22], [45.36, 40.56], [45.56, 40.81], [45.18, 40.99], [44.97, 41.25], [45.22, 41.41], [45.96, 41.12], [46.5, 41.06], [46.64, 41.18], [46.15, 41.72], [46.4, 41.86]]], [[[46.14, 38.74], [45.46, 38.87], [44.95, 39.34], [44.79, 39.71], [45, 39.74], [45.3, 39.47], [45.74, 39.47], [45.74, 39.32], [46.14, 38.74]]]], "mainOnly": true },
    { "iso": "bd", "name": "Bangladesh", "polygons": [[[[92.67, 22.04], [92.65, 21.32], [92.3, 21.48], [92.37, 20.67], [92.08, 21.19], [92.03, 21.7], [91.83, 22.18], [91.42, 22.77], [90.5, 22.81], [90.59, 22.39], [90.27, 21.84], [89.85, 22.04], [89.7, 21.86], [89.42, 21.97], [89.03, 22.06], [88.88, 22.88], [88.53, 23.63], [88.7, 24.23], [88.08, 24.5], [88.31, 24.87], [88.93, 25.24], [88.21, 25.77], [88.56, 26.45], [89.36, 26.01], [89.83, 25.97], [89.92, 25.27], [90.87, 25.13], [91.8, 25.15], [92.38, 24.98], [91.92, 24.13], [91.47, 24.07], [91.16, 23.5], [91.71, 22.99], [91.87, 23.62], [92.15, 23.63], [92.67, 22.04]]]], "mainOnly": true },
    { "iso": "by", "name": "Belarus", "polygons": [[[[28.18, 56.17], [29.23, 55.92], [29.37, 55.67], [29.9, 55.79], [30.87, 55.55], [30.97, 55.08], [30.76, 54.81], [31.38, 54.16], [31.79, 53.97], [31.73, 53.79], [32.41, 53.62], [32.69, 53.35], [32.3, 53.13], [31.5, 53.17], [31.31, 53.07], [31.54, 52.74], [31.79, 52.1], [30.93, 52.04], [30.62, 51.82], [30.56, 51.32], [30.16, 51.42], [29.25, 51.37], [28.99, 51.6], [28.62, 51.43], [28.24, 51.57], [27.45, 51.59], [26.34, 51.83], [25.33, 51.91], [24.55, 51.89], [24.01, 51.62], [23.53, 51.58], [23.51, 52.02], [23.2, 52.49], [23.8, 52.69], [23.8, 53.09], [23.53, 53.47], [23.48, 53.91], [24.45, 53.91], [25.54, 54.28], [25.77, 54.85], [26.59, 55.17], [26.49, 55.62], [27.1, 55.78], [28.18, 56.17]]]], "mainOnly": true },
    { "iso": "be", "name": "Belgium", "polygons": [[[[6.16, 50.8], [6.04, 50.13], [5.78, 50.09], [5.67, 49.53], [4.8, 49.99], [4.29, 49.91], [3.59, 50.38], [3.12, 50.78], [2.66, 50.8], [2.51, 51.15], [3.31, 51.35], [3.32, 51.35], [3.31, 51.35], [4.05, 51.27], [4.97, 51.48], [5.61, 51.04], [6.16, 50.8]]]], "mainOnly": true },
    { "iso": "bz", "name": "Belize", "polygons": [[[[-89.14, 17.81], [-89.15, 17.96], [-89.03, 18], [-88.85, 17.88], [-88.49, 18.49], [-88.3, 18.5], [-88.3, 18.35], [-88.11, 18.35], [-88.12, 18.08], [-88.29, 17.64], [-88.2, 17.49], [-88.3, 17.13], [-88.24, 17.04], [-88.36, 16.53], [-88.55, 16.27], [-88.73, 16.23], [-88.93, 15.89], [-89.23, 15.89], [-89.15, 17.02], [-89.14, 17.81]]]], "mainOnly": true },
    { "iso": "bj", "name": "Benin", "polygons": [[[[2.69, 6.26], [1.87, 6.14], [1.62, 6.83], [1.66, 9.13], [1.46, 9.33], [1.43, 9.83], [1.08, 10.18], [0.77, 10.47], [0.9, 11], [1.24, 11.11], [1.45, 11.55], [1.94, 11.64], [2.15, 11.94], [2.49, 12.23], [2.85, 12.24], [3.61, 11.66], [3.57, 11.33], [3.8, 10.73], [3.6, 10.33], [3.71, 10.06], [3.22, 9.44], [2.91, 9.14], [2.72, 8.51], [2.75, 7.87], [2.69, 6.26]]]], "mainOnly": true },
    { "iso": "bt", "name": "Bhutan", "polygons": [[[[91.7, 27.77], [92.1, 27.45], [92.03, 26.84], [91.22, 26.81], [90.37, 26.88], [89.74, 26.72], [88.84, 27.1], [88.81, 27.3], [89.48, 28.04], [90.02, 28.3], [90.73, 28.06], [91.26, 28.04], [91.7, 27.77]]]], "mainOnly": true },
    { "iso": "bo", "name": "Bolivia", "polygons": [[[[-69.53, -10.95], [-68.79, -11.04], [-68.27, -11.01], [-68.05, -10.71], [-67.17, -10.31], [-66.65, -9.93], [-65.34, -9.76], [-65.44, -10.51], [-65.32, -10.9], [-65.4, -11.57], [-64.32, -12.46], [-63.2, -12.63], [-62.8, -13], [-62.13, -13.2], [-61.71, -13.49], [-61.08, -13.48], [-60.5, -13.78], [-60.46, -14.35], [-60.26, -14.65], [-60.25, -15.08], [-60.54, -15.09], [-60.16, -16.26], [-58.24, -16.3], [-58.39, -16.88], [-58.28, -17.27], [-57.73, -17.55], [-57.5, -18.17], [-57.68, -18.96], [-57.95, -19.4], [-57.85, -19.97], [-58.17, -20.18], [-58.18, -19.87], [-59.12, -19.36], [-60.04, -19.34], [-61.79, -19.63], [-62.27, -20.51], [-62.29, -21.05], [-62.69, -22.25], [-62.85, -22.03], [-63.99, -21.99], [-64.38, -22.8], [-64.96, -22.08], [-66.27, -21.83], [-67.11, -22.74], [-67.83, -22.87], [-68.22, -21.49], [-68.76, -20.37], [-68.44, -19.41], [-68.97, -18.98], [-69.1, -18.26], [-69.59, -17.58], [-68.96, -16.5], [-69.39, -15.66], [-69.16, -15.32], [-69.34, -14.95], [-68.95, -14.45], [-68.93, -13.6], [-68.88, -12.9], [-68.67, -12.56], [-69.53, -10.95]]]], "mainOnly": true },
    { "iso": "ba", "name": "Bosnia and Herzegovina", "polygons": [[[[18.56, 42.65], [17.67, 43.03], [17.3, 43.45], [16.92, 43.67], [16.46, 44.04], [16.24, 44.35], [15.75, 44.82], [15.96, 45.23], [16.32, 45], [16.53, 45.21], [17, 45.23], [17.86, 45.07], [18.55, 45.08], [19.01, 44.86], [19.37, 44.86], [19.12, 44.42], [19.6, 44.04], [19.45, 43.57], [19.22, 43.52], [19.03, 43.43], [18.71, 43.2], [18.56, 42.65]]]], "mainOnly": true },
    { "iso": "bw", "name": "Botswana", "polygons": [[[[29.43, -22.09], [28.02, -22.83], [27.12, -23.57], [26.79, -24.24], [26.49, -24.62], [25.94, -24.7], [25.77, -25.17], [25.66, -25.49], [25.03, -25.72], [24.21, -25.67], [23.73, -25.39], [23.31, -25.27], [22.82, -25.5], [22.58, -25.98], [22.11, -26.28], [21.61, -26.73], [20.89, -26.83], [20.67, -26.48], [20.76, -25.87], [20.17, -24.92], [19.9, -24.77], [19.9, -21.85], [20.88, -21.81], [20.91, -18.25], [21.66, -18.22], [23.2, -17.87], [23.58, -18.28], [24.22, -17.89], [24.52, -17.89], [25.08, -17.66], [25.26, -17.74], [25.65, -18.54], [25.85, -18.71], [26.16, -19.29], [27.3, -20.39], [27.72, -20.5], [27.73, -20.85], [28.02, -21.49], [28.79, -21.64], [29.43, -22.09]]]], "mainOnly": true },
    { "iso": "br", "name": "Brazil", "polygons": [[[[-53.37, -33.77], [-53.65, -33.2], [-53.21, -32.73], [-53.79, -32.05], [-54.57, -31.49], [-55.6, -30.85], [-55.97, -30.88], [-56.98, -30.11], [-57.63, -30.22], [-56.29, -28.85], [-55.16, -27.88], [-54.49, -27.47], [-53.65, -26.92], [-53.63, -26.12], [-54.13, -25.55], [-54.63, -25.74], [-54.43, -25.16], [-54.29, -24.57], [-54.29, -24.02], [-54.65, -23.84], [-55.03, -24], [-55.4, -23.96], [-55.52, -23.57], [-55.61, -22.66], [-55.8, -22.36], [-56.47, -22.09], [-56.88, -22.28], [-57.94, -22.09], [-57.87, -20.73], [-58.17, -20.18], [-57.85, -19.97], [-57.95, -19.4], [-57.68, -18.96], [-57.5, -18.17], [-57.73, -17.55], [-58.28, -17.27], [-58.39, -16.88], [-58.24, -16.3], [-60.16, -16.26], [-60.54, -15.09], [-60.25, -15.08], [-60.26, -14.65], [-60.46, -14.35], [-60.5, -13.78], [-61.08, -13.48], [-61.71, -13.49], [-62.13, -13.2], [-62.8, -13], [-63.2, -12.63], [-64.32, -12.46], [-65.4, -11.57], [-65.32, -10.9], [-65.44, -10.51], [-65.34, -9.76], [-66.65, -9.93], [-67.17, -10.31], [-68.05, -10.71], [-68.27, -11.01], [-68.79, -11.04], [-69.53, -10.95], [-70.09, -11.12], [-70.55, -11.01], [-70.48, -9.49], [-71.3, -10.08], [-72.18, -10.05], [-72.56, -9.52], [-73.23, -9.46], [-73.02, -9.03], [-73.57, -8.42], [-73.99, -7.52], [-73.72, -7.34], [-73.72, -6.92], [-73.12, -6.63], [-73.22, -6.09], [-72.96, -5.74], [-72.89, -5.27], [-71.75, -4.59], [-70.93, -4.4], [-70.79, -4.25], [-69.89, -4.3], [-69.44, -1.56], [-69.42, -1.12], [-69.58, -0.55], [-70.02, -0.19], [-70.02, 0.54], [-69.45, 0.71], [-69.25, 0.6], [-69.22, 0.99], [-69.8, 1.09], [-69.82, 1.71], [-67.87, 1.69], [-67.54, 2.04], [-67.26, 1.72], [-67.07, 1.13], [-66.88, 1.25], [-66.33, 0.72], [-65.55, 0.79], [-65.35, 1.1], [-64.61, 1.33], [-64.2, 1.49], [-64.08, 1.92], [-63.37, 2.2], [-63.42, 2.41], [-64.27, 2.5], [-64.41, 3.13], [-64.37, 3.8], [-64.82, 4.06], [-64.63, 4.15], [-63.89, 4.02], [-63.09, 3.77], [-62.8, 4.01], [-62.09, 4.16], [-60.97, 4.54], [-60.6, 4.92], [-60.73, 5.2], [-60.21, 5.24], [-59.98, 5.01], [-60.11, 4.57], [-59.77, 4.42], [-59.54, 3.96], [-59.82, 3.61], [-59.97, 2.76], [-59.72, 2.25], [-59.65, 1.79], [-59.03, 1.32], [-58.54, 1.27], [-58.43, 1.46], [-58.11, 1.51], [-57.66, 1.68], [-57.34, 1.95], [-56.78, 1.86], [-56.54, 1.9], [-56, 1.82], [-55.91, 2.02], [-56.07, 2.22], [-55.97, 2.51], [-55.57, 2.42], [-55.1, 2.52], [-54.52, 2.31], [-54.09, 2.11], [-53.78, 2.38], [-53.55, 2.33], [-53.42, 2.05], [-52.94, 2.12], [-52.56, 2.5], [-52.25, 3.24], [-51.66, 4.16], [-51.32, 4.2], [-51.07, 3.65], [-50.51, 1.9], [-49.97, 1.74], [-49.95, 1.05], [-50.7, 0.22], [-50.39, -0.08], [-48.62, -0.24], [-48.58, -1.24], [-47.82, -0.58], [-46.57, -0.94], [-44.91, -1.55], [-44.42, -2.14], [-44.58, -2.69], [-43.42, -2.38], [-41.47, -2.91], [-39.98, -2.87], [-38.5, -3.7], [-37.22, -4.82], [-36.45, -5.11], [-35.6, -5.15], [-35.24, -5.46], [-34.9, -6.74], [-34.73, -7.34], [-35.13, -9], [-35.64, -9.65], [-37.05, -11.04], [-37.68, -12.17], [-38.42, -13.04], [-38.67, -13.06], [-38.95, -13.79], [-38.88, -15.67], [-39.16, -17.21], [-39.27, -17.87], [-39.58, -18.26], [-39.76, -19.6], [-40.77, -20.9], [-40.94, -21.94], [-41.75, -22.37], [-41.99, -22.97], [-43.07, -22.97], [-44.65, -23.35], [-45.35, -23.8], [-46.47, -24.09], [-47.65, -24.89], [-48.5, -25.88], [-48.64, -26.62], [-48.47, -27.18], [-48.66, -28.19], [-48.89, -28.67], [-49.59, -29.22], [-50.7, -30.98], [-51.58, -31.78], [-52.26, -32.25], [-52.71, -33.2], [-53.37, -33.77]]]], "mainOnly": true },
    { "iso": "bn", "name": "Brunei", "polygons": [[[[115.45, 5.45], [115.41, 4.96], [115.35, 4.32], [114.87, 4.35], [114.66, 4.01], [114.2, 4.53], [114.6, 4.9], [115.45, 5.45]]]], "mainOnly": true },
    { "iso": "bg", "name": "Bulgaria", "polygons": [[[[22.66, 44.23], [22.94, 43.82], [23.33, 43.9], [24.1, 43.74], [25.57, 43.69], [26.07, 43.94], [27.24, 44.18], [27.97, 43.81], [28.56, 43.71], [28.04, 43.29], [27.67, 42.58], [28, 42.01], [27.14, 42.14], [26.12, 41.83], [26.11, 41.33], [25.2, 41.23], [24.49, 41.58], [23.69, 41.31], [22.95, 41.34], [22.88, 42], [22.38, 42.32], [22.55, 42.46], [22.44, 42.58], [22.6, 42.9], [22.99, 43.21], [22.5, 43.64], [22.41, 44.01], [22.66, 44.23]]]], "mainOnly": true },
    { "iso": "bf", "name": "Burkina Faso", "polygons": [[[[-5.4, 10.37], [-5.47, 10.95], [-5.2, 11.38], [-5.22, 11.71], [-4.43, 12.54], [-4.28, 13.23], [-4.01, 13.47], [-3.52, 13.34], [-3.1, 13.54], [-2.97, 13.8], [-2.19, 14.25], [-2, 14.56], [-1.07, 14.97], [-0.52, 15.12], [-0.27, 14.92], [0.37, 14.93], [0.3, 14.44], [0.43, 13.99], [0.99, 13.34], [1.02, 12.85], [2.18, 12.63], [2.15, 11.94], [1.94, 11.64], [1.45, 11.55], [1.24, 11.11], [0.9, 11], [0.02, 11.02], [-0.44, 11.1], [-0.76, 10.94], [-1.2, 11.01], [-2.94, 10.96], [-2.96, 10.4], [-2.83, 9.64], [-3.51, 9.9], [-3.98, 9.86], [-4.33, 9.61], [-4.78, 9.82], [-4.95, 10.15], [-5.4, 10.37]]]], "mainOnly": true },
    { "iso": "bi", "name": "Burundi", "polygons": [[[[30.47, -2.41], [30.53, -2.81], [30.74, -3.03], [30.75, -3.36], [30.51, -3.57], [30.12, -4.09], [29.75, -4.45], [29.34, -4.5], [29.28, -3.29], [29.02, -2.84], [29.63, -2.92], [29.94, -2.35], [30.47, -2.41]]]], "mainOnly": true },
    { "iso": "kh", "name": "Cambodia", "polygons": [[[[102.58, 12.19], [102.35, 13.39], [102.99, 14.23], [104.28, 14.42], [105.22, 14.27], [106.04, 13.88], [106.5, 14.57], [107.38, 14.2], [107.61, 13.54], [107.49, 12.34], [105.81, 11.57], [106.25, 10.96], [105.2, 10.89], [104.33, 10.49], [103.5, 10.63], [103.09, 11.15], [102.58, 12.19]]]], "mainOnly": true },
    { "iso": "cm", "name": "Cameroon", "polygons": [[[[14.5, 12.86], [14.89, 12.22], [14.96, 11.56], [14.92, 10.89], [15.47, 9.98], [14.91, 9.99], [14.63, 9.92], [14.17, 10.02], [13.95, 9.55], [14.54, 8.97], [14.98, 8.8], [15.12, 8.38], [15.44, 7.69], [15.28, 7.42], [14.78, 6.41], [14.54, 6.23], [14.46, 5.45], [14.56, 5.03], [14.48, 4.73], [14.95, 4.21], [15.04, 3.85], [15.41, 3.34], [15.86, 3.01], [15.91, 2.56], [16.01, 2.27], [15.94, 1.73], [15.15, 1.96], [14.34, 2.23], [13.08, 2.27], [12.95, 2.32], [12.36, 2.19], [11.75, 2.33], [11.28, 2.26], [9.65, 2.28], [9.8, 3.07], [9.4, 3.73], [8.95, 3.9], [8.74, 4.35], [8.49, 4.5], [8.5, 4.77], [8.76, 5.48], [9.23, 6.44], [9.52, 6.45], [10.12, 7.04], [10.5, 7.06], [11.06, 6.64], [11.75, 6.98], [11.84, 7.4], [12.06, 7.8], [12.22, 8.31], [12.75, 8.72], [12.96, 9.42], [13.17, 9.64], [13.31, 10.16], [13.57, 10.8], [14.42, 11.57], [14.47, 11.9], [14.58, 12.09], [14.18, 12.48], [14.21, 12.8], [14.5, 12.86]]]], "mainOnly": true },
    { "iso": "ca", "name": "Canada", "polygons": [[[[-122.84, 49], [-122.97, 49], [-124.91, 49.98], [-125.62, 50.42], [-127.44, 50.83], [-127.99, 51.72], [-127.85, 52.33], [-129.13, 52.76], [-129.31, 53.56], [-130.51, 54.29], [-130.54, 54.8], [-129.98, 55.29], [-130.01, 55.92], [-131.71, 56.55], [-132.73, 57.69], [-133.36, 58.41], [-134.27, 58.86], [-134.94, 59.27], [-135.48, 59.79], [-136.48, 59.46], [-137.45, 58.91], [-138.34, 59.56], [-139.04, 60], [-140.01, 60.28], [-141, 60.31], [-140.99, 66], [-140.99, 69.71], [-139.12, 69.47], [-137.55, 68.99], [-136.5, 68.9], [-135.63, 69.32], [-134.41, 69.63], [-132.93, 69.51], [-131.43, 69.94], [-129.79, 70.19], [-129.11, 69.78], [-128.36, 70.01], [-128.14, 70.48], [-127.45, 70.38], [-125.76, 69.48], [-124.42, 70.16], [-124.29, 69.4], [-123.06, 69.56], [-122.68, 69.86], [-121.47, 69.8], [-119.94, 69.38], [-117.6, 69.01], [-116.23, 68.84], [-115.25, 68.91], [-113.9, 68.4], [-115.3, 67.9], [-113.5, 67.69], [-110.8, 67.81], [-109.95, 67.98], [-108.88, 67.38], [-107.79, 67.89], [-108.81, 68.31], [-108.17, 68.65], [-106.95, 68.7], [-106.15, 68.8], [-105.34, 68.56], [-104.34, 68.02], [-103.22, 68.1], [-101.45, 67.65], [-99.9, 67.81], [-98.44, 67.78], [-98.56, 68.4], [-97.67, 68.58], [-96.12, 68.24], [-96.13, 67.29], [-95.49, 68.09], [-94.68, 68.06], [-94.23, 69.07], [-95.3, 69.69], [-96.47, 70.09], [-96.39, 71.19], [-95.21, 71.92], [-93.89, 71.76], [-92.88, 71.32], [-91.52, 70.19], [-92.41, 69.7], [-90.55, 69.5], [-90.55, 68.47], [-89.22, 69.26], [-88.02, 68.62], [-88.32, 67.87], [-87.35, 67.2], [-86.31, 67.92], [-85.58, 68.78], [-85.52, 69.88], [-84.1, 69.81], [-82.62, 69.66], [-81.28, 69.16], [-81.22, 68.67], [-81.96, 68.13], [-81.26, 67.6], [-81.39, 67.11], [-83.34, 66.41], [-84.74, 66.26], [-85.77, 66.56], [-86.07, 66.06], [-87.03, 65.21], [-87.32, 64.78], [-88.48, 64.1], [-89.91, 64.03], [-90.7, 63.61], [-90.77, 62.96], [-91.93, 62.84], [-93.16, 62.02], [-94.24, 60.9], [-94.63, 60.11], [-94.68, 58.95], [-93.22, 58.78], [-92.76, 57.85], [-92.3, 57.09], [-90.9, 57.28], [-89.04, 56.85], [-88.04, 56.47], [-87.32, 56], [-86.07, 55.72], [-85.01, 55.3], [-83.36, 55.24], [-82.27, 55.15], [-82.44, 54.28], [-82.13, 53.28], [-81.4, 52.16], [-79.91, 51.21], [-79.14, 51.53], [-78.6, 52.56], [-79.12, 54.14], [-79.83, 54.67], [-78.23, 55.14], [-77.1, 55.84], [-76.54, 56.53], [-76.62, 57.2], [-77.3, 58.05], [-78.52, 58.8], [-77.34, 59.85], [-77.77, 60.76], [-78.11, 62.32], [-77.41, 62.55], [-75.7, 62.28], [-74.67, 62.18], [-73.84, 62.44], [-72.91, 62.11], [-71.68, 61.53], [-71.37, 61.14], [-69.59, 61.06], [-69.62, 60.22], [-69.29, 58.96], [-68.37, 58.8], [-67.65, 58.21], [-66.2, 58.77], [-65.25, 59.87], [-64.58, 60.34], [-63.8, 59.44], [-62.5, 58.17], [-61.4, 56.97], [-61.8, 56.34], [-60.47, 55.78], [-59.57, 55.2], [-57.98, 54.95], [-57.33, 54.63], [-56.94, 53.78], [-56.16, 53.65], [-55.76, 53.27], [-55.68, 52.15], [-56.41, 51.77], [-57.13, 51.42], [-58.77, 51.06], [-60.03, 50.24], [-61.72, 50.08], [-63.86, 50.29], [-65.36, 50.3], [-66.4, 50.23], [-67.24, 49.51], [-68.51, 49.07], [-69.95, 47.74], [-71.1, 46.82], [-70.26, 46.99], [-68.65, 48.3], [-66.55, 49.13], [-65.06, 49.23], [-64.17, 48.74], [-65.12, 48.07], [-64.8, 46.99], [-64.47, 46.24], [-63.17, 45.74], [-61.52, 45.88], [-60.52, 47.01], [-60.45, 46.28], [-59.8, 45.92], [-61.04, 45.27], [-63.25, 44.67], [-64.25, 44.27], [-65.36, 43.55], [-66.12, 43.62], [-66.16, 44.47], [-64.43, 45.29], [-66.03, 45.26], [-67.14, 45.14], [-67.79, 45.7], [-67.79, 47.07], [-68.23, 47.35], [-68.9, 47.19], [-69.24, 47.45], [-70, 46.69], [-70.31, 45.92], [-70.66, 45.46], [-71.08, 45.31], [-71.4, 45.26], [-71.51, 45.01], [-73.35, 45.01], [-74.87, 45], [-75.32, 44.82], [-76.37, 44.1], [-76.5, 44.02], [-76.82, 43.63], [-77.74, 43.63], [-78.72, 43.63], [-79.17, 43.47], [-79.01, 43.27], [-78.92, 42.97], [-78.94, 42.86], [-80.25, 42.37], [-81.28, 42.21], [-82.44, 41.68], [-82.69, 41.68], [-83.03, 41.83], [-83.14, 41.98], [-83.12, 42.08], [-82.9, 42.43], [-82.43, 42.98], [-82.14, 43.57], [-82.34, 44.44], [-82.55, 45.35], [-83.59, 45.82], [-83.47, 45.99], [-83.62, 46.12], [-83.89, 46.12], [-84.09, 46.28], [-84.14, 46.51], [-84.34, 46.41], [-84.6, 46.44], [-84.54, 46.54], [-84.78, 46.64], [-84.88, 46.9], [-85.65, 47.22], [-86.46, 47.55], [-87.44, 47.94], [-88.38, 48.3], [-89.27, 48.02], [-89.6, 48.01], [-90.83, 48.27], [-91.64, 48.14], [-92.61, 48.45], [-93.63, 48.61], [-94.33, 48.67], [-94.64, 48.84], [-94.82, 49.39], [-95.16, 49.38], [-95.16, 49], [-97.23, 49], [-100.65, 49], [-104.05, 49], [-107.05, 49], [-110.05, 49], [-113, 49], [-116.05, 49], [-117.03, 49], [-120, 49], [-122.84, 49]]], [[[-55.6, 51.32], [-56.13, 50.69], [-56.8, 49.81], [-56.14, 50.15], [-55.47, 49.94], [-55.82, 49.59], [-54.94, 49.31], [-54.47, 49.56], [-53.48, 49.25], [-53.79, 48.52], [-53.09, 48.69], [-52.96, 48.16], [-52.65, 47.54], [-53.07, 46.66], [-53.52, 46.62], [-54.18, 46.81], [-53.96, 47.63], [-54.24, 47.75], [-55.4, 46.88], [-56, 46.92], [-55.29, 47.39], [-56.25, 47.63], [-57.33, 47.57], [-59.27, 47.6], [-59.42, 47.9], [-58.8, 48.25], [-59.23, 48.52], [-58.39, 49.13], [-57.36, 50.72], [-56.74, 51.29], [-55.87, 51.63], [-55.41, 51.59], [-55.6, 51.32]]], [[[-123.51, 48.51], [-124.01, 48.37], [-125.66, 48.83], [-125.95, 49.18], [-126.85, 49.53], [-127.03, 49.81], [-128.06, 49.99], [-128.44, 50.54], [-128.36, 50.77], [-127.31, 50.55], [-126.7, 50.4], [-125.76, 50.3], [-125.42, 49.95], [-124.92, 49.48], [-123.92, 49.06], [-123.51, 48.51]]], [[[-64.01, 47.04], [-63.66, 46.55], [-62.94, 46.42], [-62.01, 46.44], [-62.5, 46.03], [-62.87, 45.97], [-64.14, 46.39], [-64.39, 46.73], [-64.01, 47.04]]]], "mainOnly": true },
    { "iso": "cf", "name": "Central African Republic", "polygons": [[[[27.37, 5.23], [27.04, 5.13], [26.4, 5.15], [25.65, 5.26], [25.28, 5.17], [25.13, 4.93], [24.81, 4.9], [24.41, 5.11], [23.3, 4.61], [22.84, 4.71], [22.7, 4.63], [22.41, 4.03], [21.66, 4.22], [20.93, 4.32], [20.29, 4.69], [19.47, 5.03], [18.93, 4.71], [18.54, 4.2], [18.45, 3.5], [17.81, 3.56], [17.13, 3.73], [16.54, 3.2], [16.01, 2.27], [15.91, 2.56], [15.86, 3.01], [15.41, 3.34], [15.04, 3.85], [14.95, 4.21], [14.48, 4.73], [14.56, 5.03], [14.46, 5.45], [14.54, 6.23], [14.78, 6.41], [15.28, 7.42], [16.11, 7.5], [16.29, 7.75], [16.46, 7.73], [16.71, 7.51], [17.96, 7.89], [18.39, 8.28], [18.91, 8.63], [18.81, 8.98], [19.09, 9.07], [20.06, 9.01], [21, 9.48], [21.72, 10.57], [22.23, 10.97], [22.86, 11.14], [22.98, 10.71], [23.55, 10.09], [23.56, 9.68], [23.39, 9.27], [23.46, 8.95], [23.81, 8.67], [24.57, 8.23], [25.11, 7.83], [25.12, 7.5], [25.8, 6.98], [26.21, 6.55], [26.47, 5.95], [27.21, 5.55], [27.37, 5.23]]]], "mainOnly": true },
    { "iso": "td", "name": "Chad", "polygons": [[[[23.84, 19.58], [23.89, 15.61], [23.02, 15.68], [22.57, 14.94], [22.3, 14.33], [22.51, 14.09], [22.18, 13.79], [22.3, 13.37], [22.04, 12.96], [21.94, 12.59], [22.29, 12.65], [22.5, 12.26], [22.51, 11.68], [22.88, 11.38], [22.86, 11.14], [22.23, 10.97], [21.72, 10.57], [21, 9.48], [20.06, 9.01], [19.09, 9.07], [18.81, 8.98], [18.91, 8.63], [18.39, 8.28], [17.96, 7.89], [16.71, 7.51], [16.46, 7.73], [16.29, 7.75], [16.11, 7.5], [15.28, 7.42], [15.44, 7.69], [15.12, 8.38], [14.98, 8.8], [14.54, 8.97], [13.95, 9.55], [14.17, 10.02], [14.63, 9.92], [14.91, 9.99], [15.47, 9.98], [14.92, 10.89], [14.96, 11.56], [14.89, 12.22], [14.5, 12.86], [14.6, 13.33], [13.95, 13.35], [13.96, 14], [13.54, 14.37], [13.97, 15.68], [15.25, 16.63], [15.3, 17.93], [15.69, 19.96], [15.9, 20.39], [15.49, 20.73], [15.47, 21.05], [15.1, 21.31], [14.85, 22.86], [15.86, 23.41], [19.85, 21.5], [23.84, 19.58]]]], "mainOnly": true },
    { "iso": "cl", "name": "Chile", "polygons": [[[[-68.63, -52.64], [-68.63, -54.87], [-67.56, -54.87], [-66.96, -54.9], [-67.29, -55.3], [-68.15, -55.61], [-68.64, -55.58], [-69.23, -55.5], [-69.96, -55.2], [-71.01, -55.05], [-72.26, -54.5], [-73.29, -53.96], [-74.66, -52.84], [-73.84, -53.05], [-72.43, -53.72], [-71.11, -54.07], [-70.59, -53.62], [-70.27, -52.93], [-69.35, -52.52], [-68.63, -52.64]]], [[[-69.59, -17.58], [-69.1, -18.26], [-68.97, -18.98], [-68.44, -19.41], [-68.76, -20.37], [-68.22, -21.49], [-67.83, -22.87], [-67.11, -22.74], [-66.99, -22.99], [-67.33, -24.03], [-68.42, -24.52], [-68.39, -26.19], [-68.59, -26.51], [-68.3, -26.9], [-69, -27.52], [-69.66, -28.46], [-70.01, -29.37], [-69.92, -30.34], [-70.54, -31.37], [-70.07, -33.09], [-69.81, -33.27], [-69.82, -34.19], [-70.39, -35.17], [-70.36, -36.01], [-71.12, -36.66], [-71.12, -37.58], [-70.81, -38.55], [-71.41, -38.92], [-71.68, -39.81], [-71.92, -40.83], [-71.75, -42.05], [-72.15, -42.25], [-71.92, -43.41], [-71.46, -43.79], [-71.79, -44.21], [-71.33, -44.41], [-71.22, -44.78], [-71.66, -44.97], [-71.55, -45.56], [-71.92, -46.88], [-72.45, -47.74], [-72.33, -48.24], [-72.65, -48.88], [-73.42, -49.32], [-73.33, -50.38], [-72.98, -50.74], [-72.31, -50.68], [-72.33, -51.43], [-71.91, -52.01], [-69.5, -52.14], [-68.57, -52.3], [-69.46, -52.29], [-69.94, -52.54], [-70.85, -52.9], [-71.01, -53.83], [-71.43, -53.86], [-72.56, -53.53], [-73.7, -52.84], [-74.95, -52.26], [-75.26, -51.63], [-74.98, -51.04], [-75.48, -50.38], [-75.61, -48.67], [-75.18, -47.71], [-74.13, -46.94], [-75.64, -46.65], [-74.69, -45.76], [-74.35, -44.1], [-73.24, -44.45], [-72.72, -42.38], [-73.39, -42.12], [-73.7, -43.37], [-74.33, -43.22], [-74.02, -41.79], [-73.68, -39.94], [-73.22, -39.26], [-73.51, -38.28], [-73.59, -37.16], [-73.17, -37.12], [-72.55, -35.51], [-71.86, -33.91], [-71.44, -32.42], [-71.67, -30.92], [-71.37, -30.1], [-71.49, -28.86], [-70.91, -27.64], [-70.72, -25.71], [-70.4, -23.63], [-70.09, -21.39], [-70.16, -19.76], [-70.37, -18.35], [-69.86, -18.09], [-69.59, -17.58]]]], "mainOnly": true },
    { "iso": "cn", "name": "China", "polygons": [[[[109.48, 18.2], [108.66, 18.51], [108.63, 19.37], [109.12, 19.82], [110.21, 20.1], [110.79, 20.08], [111.01, 19.7], [110.57, 19.26], [110.34, 18.68], [109.48, 18.2]]], [[[80.26, 42.35], [80.18, 42.92], [80.87, 43.18], [79.97, 44.92], [81.95, 45.32], [82.46, 45.54], [83.18, 47.33], [85.16, 47], [85.72, 47.45], [85.77, 48.46], [86.6, 48.55], [87.36, 49.21], [87.75, 49.3], [88.01, 48.6], [88.85, 48.07], [90.28, 47.69], [90.97, 46.89], [90.59, 45.72], [90.95, 45.29], [92.13, 45.12], [93.48, 44.98], [94.69, 44.35], [95.31, 44.24], [95.76, 43.32], [96.35, 42.73], [97.45, 42.75], [99.52, 42.52], [100.85, 42.66], [101.83, 42.51], [103.31, 41.91], [104.52, 41.91], [104.96, 41.6], [106.13, 42.13], [107.74, 42.48], [109.24, 42.52], [110.41, 42.87], [111.13, 43.41], [111.83, 43.74], [111.67, 44.07], [111.35, 44.46], [111.87, 45.1], [112.44, 45.01], [113.46, 44.81], [114.46, 45.34], [115.99, 45.73], [116.72, 46.39], [117.42, 46.67], [118.87, 46.81], [119.66, 46.69], [119.77, 47.05], [118.87, 47.75], [118.06, 48.07], [117.3, 47.7], [116.31, 47.85], [115.74, 47.73], [115.49, 48.14], [116.19, 49.13], [116.68, 49.89], [117.88, 49.51], [119.29, 50.14], [119.28, 50.58], [120.18, 51.64], [120.74, 51.96], [120.73, 52.52], [120.18, 52.75], [121, 53.25], [122.25, 53.43], [123.57, 53.46], [125.07, 53.16], [125.95, 52.79], [126.56, 51.78], [126.94, 51.35], [127.29, 50.74], [127.66, 49.76], [129.4, 49.44], [130.58, 48.73], [130.99, 47.79], [132.51, 47.79], [133.37, 48.18], [135.03, 48.48], [134.5, 47.58], [134.11, 47.21], [133.77, 46.12], [133.1, 45.14], [131.88, 45.32], [131.03, 44.97], [131.29, 44.11], [131.14, 42.93], [130.63, 42.9], [130.64, 42.4], [129.99, 42.99], [129.6, 42.42], [128.05, 41.99], [128.21, 41.47], [127.34, 41.5], [126.87, 41.82], [126.18, 41.11], [125.08, 40.57], [124.27, 39.93], [122.87, 39.64], [122.13, 39.17], [121.05, 38.9], [121.59, 39.36], [121.38, 39.75], [122.17, 40.42], [121.64, 40.95], [120.77, 40.59], [119.64, 39.9], [119.02, 39.25], [118.04, 39.2], [117.53, 38.74], [118.06, 38.06], [118.88, 37.9], [118.91, 37.45], [119.7, 37.16], [120.82, 37.87], [121.71, 37.48], [122.36, 37.45], [122.52, 36.93], [121.1, 36.65], [120.64, 36.11], [119.66, 35.61], [119.15, 34.91], [120.23, 34.36], [120.62, 33.38], [121.23, 32.46], [121.91, 31.69], [121.89, 30.95], [121.26, 30.68], [121.5, 30.14], [122.09, 29.83], [121.94, 29.02], [121.68, 28.23], [121.13, 28.14], [120.4, 27.05], [119.59, 25.74], [118.66, 24.55], [117.28, 23.62], [115.89, 22.78], [114.76, 22.67], [114.15, 22.22], [113.81, 22.55], [113.24, 22.05], [111.84, 21.55], [110.79, 21.4], [110.44, 20.34], [109.89, 20.28], [109.63, 21.01], [109.86, 21.4], [108.52, 21.72], [108.05, 21.55], [107.04, 21.81], [106.57, 22.22], [106.73, 22.79], [105.81, 22.98], [105.33, 23.35], [104.48, 22.82], [103.5, 22.7], [102.71, 22.71], [102.17, 22.46], [101.65, 22.32], [101.8, 21.17], [101.27, 21.2], [101.18, 21.44], [101.15, 21.85], [100.42, 21.56], [99.98, 21.74], [99.24, 22.12], [99.53, 22.95], [98.9, 23.14], [98.66, 24.06], [97.6, 23.9], [97.72, 25.08], [98.67, 25.92], [98.71, 26.74], [98.68, 27.51], [98.25, 27.75], [97.91, 28.34], [97.33, 28.26], [96.25, 28.41], [96.59, 28.83], [96.12, 29.45], [95.4, 29.03], [94.57, 29.28], [93.41, 28.64], [92.5, 27.9], [91.7, 27.77], [91.26, 28.04], [90.73, 28.06], [90.02, 28.3], [89.48, 28.04], [88.81, 27.3], [88.73, 28.09], [88.12, 27.88], [86.95, 27.97], [85.82, 28.2], [85.01, 28.64], [84.23, 28.84], [83.9, 29.32], [83.34, 29.46], [82.33, 30.12], [81.53, 30.42], [81.11, 30.18], [79.72, 30.88], [78.74, 31.52], [78.46, 32.62], [79.18, 32.48], [79.21, 32.99], [78.81, 33.51], [78.91, 34.32], [77.84, 35.49], [76.19, 35.9], [75.9, 36.67], [75.16, 37.13], [74.98, 37.42], [74.83, 37.99], [74.86, 38.38], [74.26, 38.61], [73.93, 38.51], [73.68, 39.43], [73.96, 39.66], [73.82, 39.89], [74.78, 40.37], [75.47, 40.56], [76.53, 40.43], [76.9, 41.07], [78.19, 41.19], [78.54, 41.58], [80.12, 42.12], [80.26, 42.35]]]], "mainOnly": true },
    { "iso": "co", "name": "Colombia", "polygons": [[[[-66.88, 1.25], [-67.07, 1.13], [-67.26, 1.72], [-67.54, 2.04], [-67.87, 1.69], [-69.82, 1.71], [-69.8, 1.09], [-69.22, 0.99], [-69.25, 0.6], [-69.45, 0.71], [-70.02, 0.54], [-70.02, -0.19], [-69.58, -0.55], [-69.42, -1.12], [-69.44, -1.56], [-69.89, -4.3], [-70.39, -3.77], [-70.69, -3.74], [-70.05, -2.73], [-70.81, -2.26], [-71.41, -2.34], [-71.77, -2.17], [-72.33, -2.43], [-73.07, -2.31], [-73.66, -1.26], [-74.12, -1], [-74.44, -0.53], [-75.11, -0.06], [-75.37, -0.15], [-75.8, 0.08], [-76.29, 0.42], [-76.58, 0.26], [-77.42, 0.4], [-77.67, 0.83], [-77.86, 0.81], [-78.86, 1.38], [-78.99, 1.69], [-78.62, 1.77], [-78.66, 2.27], [-78.43, 2.63], [-77.93, 2.7], [-77.51, 3.33], [-77.13, 3.85], [-77.5, 4.09], [-77.31, 4.67], [-77.53, 5.58], [-77.32, 5.85], [-77.48, 6.69], [-77.88, 7.22], [-77.75, 7.71], [-77.43, 7.64], [-77.24, 7.94], [-77.47, 8.52], [-77.35, 8.67], [-76.84, 8.64], [-76.09, 9.34], [-75.67, 9.44], [-75.66, 9.77], [-75.48, 10.62], [-74.91, 11.08], [-74.28, 11.1], [-74.2, 11.31], [-73.41, 11.23], [-72.63, 11.73], [-72.24, 11.96], [-71.75, 12.44], [-71.4, 12.38], [-71.14, 12.11], [-71.33, 11.78], [-71.97, 11.61], [-72.23, 11.11], [-72.61, 10.82], [-72.91, 10.45], [-73.03, 9.74], [-73.3, 9.15], [-72.79, 9.09], [-72.66, 8.63], [-72.44, 8.41], [-72.36, 8], [-72.48, 7.63], [-72.44, 7.42], [-72.2, 7.34], [-71.96, 6.99], [-70.67, 7.09], [-70.09, 6.96], [-69.39, 6.1], [-68.99, 6.21], [-68.27, 6.15], [-67.7, 6.27], [-67.34, 6.1], [-67.52, 5.56], [-67.74, 5.22], [-67.82, 4.5], [-67.62, 3.84], [-67.34, 3.54], [-67.3, 3.32], [-67.81, 2.82], [-67.45, 2.6], [-67.18, 2.25], [-66.88, 1.25]]]], "mainOnly": true },
    { "iso": "cr", "name": "Costa Rica", "polygons": [[[[-82.55, 9.57], [-82.93, 9.48], [-82.93, 9.07], [-82.72, 8.93], [-82.87, 8.81], [-82.83, 8.63], [-82.91, 8.42], [-82.97, 8.23], [-83.51, 8.45], [-83.71, 8.66], [-83.6, 8.83], [-83.63, 9.05], [-83.91, 9.29], [-84.3, 9.49], [-84.65, 9.62], [-84.71, 9.91], [-84.98, 10.09], [-84.91, 9.8], [-85.11, 9.56], [-85.34, 9.83], [-85.66, 9.93], [-85.8, 10.13], [-85.79, 10.44], [-85.66, 10.75], [-85.94, 10.9], [-85.71, 11.09], [-85.56, 11.22], [-84.9, 10.95], [-84.67, 11.08], [-84.36, 11], [-84.19, 10.79], [-83.9, 10.73], [-83.66, 10.94], [-83.4, 10.4], [-83.02, 9.99], [-82.55, 9.57]]]], "mainOnly": true },
    { "iso": "hr", "name": "Croatia", "polygons": [[[[16.56, 46.5], [16.88, 46.38], [17.63, 45.95], [18.46, 45.76], [18.83, 45.91], [19.07, 45.52], [19.39, 45.24], [19.01, 44.86], [18.55, 45.08], [17.86, 45.07], [17, 45.23], [16.53, 45.21], [16.32, 45], [15.96, 45.23], [15.75, 44.82], [16.24, 44.35], [16.46, 44.04], [16.92, 43.67], [17.3, 43.45], [17.67, 43.03], [18.56, 42.65], [18.45, 42.48], [17.51, 42.85], [16.93, 43.21], [16.02, 43.51], [15.17, 44.24], [15.38, 44.32], [14.92, 44.74], [14.9, 45.08], [14.26, 45.23], [13.95, 44.8], [13.66, 45.14], [13.68, 45.48], [13.72, 45.5], [14.41, 45.47], [14.6, 45.63], [14.94, 45.47], [15.33, 45.45], [15.32, 45.73], [15.67, 45.83], [15.77, 46.24], [16.56, 46.5]]]], "mainOnly": true },
    { "iso": "cu", "name": "Cuba", "polygons": [[[[-82.27, 23.19], [-81.4, 23.12], [-80.62, 23.11], [-79.68, 22.77], [-79.28, 22.4], [-78.35, 22.51], [-77.99, 22.28], [-77.15, 21.66], [-76.52, 21.21], [-76.19, 21.22], [-75.6, 21.02], [-75.67, 20.74], [-74.93, 20.69], [-74.18, 20.28], [-74.3, 20.05], [-74.96, 19.92], [-75.63, 19.87], [-76.32, 19.95], [-77.76, 19.86], [-77.09, 20.41], [-77.49, 20.67], [-78.14, 20.74], [-78.48, 21.03], [-78.72, 21.6], [-79.28, 21.56], [-80.22, 21.83], [-80.52, 22.04], [-81.82, 22.19], [-82.17, 22.39], [-81.8, 22.64], [-82.78, 22.69], [-83.49, 22.17], [-83.91, 22.15], [-84.05, 21.91], [-84.55, 21.8], [-84.97, 21.9], [-84.45, 22.2], [-84.23, 22.57], [-83.78, 22.79], [-83.27, 22.98], [-82.51, 23.08], [-82.27, 23.19]]]], "mainOnly": true },
    { "iso": "cy", "name": "Cyprus", "polygons": [[[[32.73, 35.14], [32.92, 35.09], [33.19, 35.17], [33.38, 35.16], [33.46, 35.1], [33.48, 35], [33.53, 35.04], [33.68, 35.02], [33.87, 35.09], [33.97, 35.06], [34, 34.98], [32.98, 34.57], [32.49, 34.7], [32.26, 35.1], [32.73, 35.14]]]], "mainOnly": true },
    { "iso": "cz", "name": "Czechia", "polygons": [[[[15.02, 51.11], [15.49, 50.78], [16.24, 50.7], [16.18, 50.42], [16.72, 50.22], [16.87, 50.47], [17.55, 50.36], [17.65, 50.05], [18.39, 49.99], [18.85, 49.5], [18.55, 49.5], [18.4, 49.32], [18.17, 49.27], [18.1, 49.04], [17.91, 49], [17.89, 48.9], [17.55, 48.8], [17.1, 48.82], [16.96, 48.6], [16.5, 48.79], [16.03, 48.73], [15.25, 49.04], [14.9, 48.96], [14.34, 48.56], [13.6, 48.88], [13.03, 49.31], [12.52, 49.55], [12.42, 49.97], [12.24, 50.27], [12.97, 50.48], [13.34, 50.73], [14.06, 50.93], [14.31, 51.12], [14.57, 51], [15.02, 51.11]]]], "mainOnly": true },
    { "iso": "cd", "name": "Democratic Republic of the Congo", "polygons": [[[[29.34, -4.5], [29.52, -5.42], [29.42, -5.94], [29.62, -6.52], [30.2, -7.08], [30.74, -8.34], [30.35, -8.24], [29, -8.41], [28.73, -8.53], [28.45, -9.16], [28.67, -9.61], [28.5, -10.79], [28.37, -11.79], [28.64, -11.97], [29.34, -12.36], [29.62, -12.18], [29.7, -13.26], [28.93, -13.25], [28.52, -12.7], [28.16, -12.27], [27.39, -12.13], [27.16, -11.61], [26.55, -11.92], [25.75, -11.78], [25.42, -11.33], [24.78, -11.24], [24.31, -11.26], [24.26, -10.95], [23.91, -10.93], [23.46, -10.87], [22.84, -11.02], [22.4, -10.99], [22.16, -11.08], [22.21, -9.89], [21.88, -9.52], [21.8, -8.91], [21.95, -8.31], [21.75, -7.92], [21.73, -7.29], [20.51, -7.3], [20.6, -6.94], [20.09, -6.94], [20.04, -7.12], [19.42, -7.16], [19.17, -7.74], [19.02, -7.99], [18.46, -7.85], [18.13, -7.99], [17.47, -8.07], [17.09, -7.55], [16.86, -7.22], [16.57, -6.62], [16.33, -5.88], [13.38, -5.86], [13.02, -5.98], [12.74, -5.97], [12.32, -6.1], [12.18, -5.79], [12.44, -5.68], [12.47, -5.25], [12.63, -4.99], [13, -4.78], [13.26, -4.88], [13.6, -4.5], [14.14, -4.51], [14.21, -4.79], [14.58, -4.97], [15.17, -4.34], [15.75, -3.86], [16.01, -3.54], [15.97, -2.71], [16.41, -1.74], [16.87, -1.23], [17.52, -0.74], [17.64, -0.42], [17.66, -0.06], [17.83, 0.29], [17.77, 0.86], [17.9, 1.74], [18.09, 2.37], [18.39, 2.9], [18.45, 3.5], [18.54, 4.2], [18.93, 4.71], [19.47, 5.03], [20.29, 4.69], [20.93, 4.32], [21.66, 4.22], [22.41, 4.03], [22.7, 4.63], [22.84, 4.71], [23.3, 4.61], [24.41, 5.11], [24.81, 4.9], [25.13, 4.93], [25.28, 5.17], [25.65, 5.26], [26.4, 5.15], [27.04, 5.13], [27.37, 5.23], [27.98, 4.41], [28.43, 4.29], [28.7, 4.46], [29.16, 4.39], [29.72, 4.6], [29.95, 4.17], [30.83, 3.51], [30.77, 2.34], [31.17, 2.2], [30.85, 1.85], [30.47, 1.58], [30.09, 1.06], [29.88, 0.6], [29.82, -0.21], [29.59, -0.59], [29.58, -1.34], [29.29, -1.62], [29.25, -2.22], [29.12, -2.29], [29.02, -2.84], [29.28, -3.29], [29.34, -4.5]]]], "mainOnly": true },
    { "iso": "dk", "name": "Denmark", "polygons": [[[[9.92, 54.98], [9.28, 54.83], [8.53, 54.96], [8.12, 55.52], [8.09, 56.54], [8.26, 56.81], [8.54, 57.11], [9.42, 57.17], [9.78, 57.45], [10.58, 57.73], [10.55, 57.22], [10.25, 56.89], [10.37, 56.61], [10.91, 56.46], [10.67, 56.08], [10.37, 56.19], [9.65, 55.47], [9.92, 54.98]]], [[[12.37, 56.11], [12.69, 55.61], [12.09, 54.8], [11.04, 55.36], [10.9, 55.78], [12.37, 56.11]]]], "mainOnly": true },
    { "iso": "dj", "name": "Djibouti", "polygons": [[[[42.35, 12.54], [42.78, 12.46], [43.08, 12.7], [43.32, 12.39], [43.29, 11.97], [42.72, 11.74], [43.15, 11.46], [42.78, 10.93], [42.55, 11.11], [42.31, 11.03], [41.76, 11.05], [41.74, 11.36], [41.66, 11.63], [42, 12.1], [42.35, 12.54]]]], "mainOnly": true },
    { "iso": "do", "name": "Dominican Republic", "polygons": [[[[-71.71, 18.04], [-71.69, 18.32], [-71.95, 18.62], [-71.7, 18.79], [-71.62, 19.17], [-71.71, 19.71], [-71.59, 19.88], [-70.81, 19.88], [-70.21, 19.62], [-69.95, 19.65], [-69.77, 19.29], [-69.22, 19.31], [-69.25, 19.02], [-68.81, 18.98], [-68.32, 18.61], [-68.69, 18.21], [-69.16, 18.42], [-69.62, 18.38], [-69.95, 18.43], [-70.13, 18.25], [-70.52, 18.18], [-70.67, 18.43], [-71, 18.28], [-71.4, 17.6], [-71.66, 17.76], [-71.71, 18.04]]]], "mainOnly": true },
    { "iso": "tl", "name": "East Timor", "polygons": [[[[124.97, -8.89], [125.09, -8.66], [125.95, -8.43], [126.64, -8.4], [126.96, -8.27], [127.34, -8.4], [126.97, -8.67], [125.93, -9.11], [125.09, -9.39], [125.07, -9.09], [124.97, -8.89]]]], "mainOnly": true },
    { "iso": "ec", "name": "Ecuador", "polygons": [[[[-75.37, -0.15], [-75.23, -0.91], [-75.54, -1.56], [-76.64, -2.61], [-77.84, -3], [-78.45, -3.87], [-78.64, -4.55], [-79.21, -4.96], [-79.62, -4.45], [-80.03, -4.35], [-80.44, -4.43], [-80.47, -4.06], [-80.18, -3.82], [-80.3, -3.4], [-79.77, -2.66], [-79.99, -2.22], [-80.37, -2.69], [-80.97, -2.25], [-80.76, -1.97], [-80.93, -1.06], [-80.58, -0.91], [-80.4, -0.28], [-80.02, 0.36], [-80.09, 0.77], [-79.54, 0.98], [-78.86, 1.38], [-77.86, 0.81], [-77.67, 0.83], [-77.42, 0.4], [-76.58, 0.26], [-76.29, 0.42], [-75.8, 0.08], [-75.37, -0.15]]]], "mainOnly": true },
    { "iso": "eg", "name": "Egypt", "polygons": [[[[36.87, 22], [32.9, 22], [29.02, 22], [25, 22], [25, 25.68], [25, 29.24], [24.7, 30.04], [24.96, 30.66], [24.8, 31.09], [25.16, 31.57], [26.5, 31.59], [27.46, 31.32], [28.45, 31.03], [28.91, 30.87], [29.68, 31.19], [30.1, 31.47], [30.98, 31.56], [31.69, 31.43], [31.96, 30.93], [32.19, 31.26], [32.99, 31.02], [33.77, 30.97], [34.27, 31.22], [34.82, 29.76], [34.92, 29.5], [34.64, 29.1], [34.43, 28.34], [34.15, 27.82], [33.92, 27.65], [33.59, 27.97], [33.14, 28.42], [32.42, 29.85], [32.32, 29.76], [32.73, 28.71], [33.35, 27.7], [34.1, 26.14], [34.47, 25.6], [34.8, 25.03], [35.69, 23.93], [35.49, 23.75], [35.53, 23.1], [36.69, 22.2], [36.87, 22]]]], "mainOnly": true },
    { "iso": "sv", "name": "El Salvador", "polygons": [[[[-89.35, 14.42], [-89.06, 14.34], [-88.84, 14.14], [-88.54, 13.98], [-88.5, 13.85], [-88.07, 13.96], [-87.86, 13.89], [-87.72, 13.79], [-87.79, 13.38], [-87.9, 13.15], [-88.48, 13.16], [-88.84, 13.26], [-89.26, 13.46], [-89.81, 13.52], [-90.1, 13.74], [-90.06, 13.88], [-89.72, 14.13], [-89.53, 14.24], [-89.59, 14.36], [-89.35, 14.42]]]], "mainOnly": true },
    { "iso": "gq", "name": "Equatorial Guinea", "polygons": [[[[9.65, 2.28], [11.28, 2.26], [11.29, 1.06], [9.83, 1.07], [9.49, 1.01], [9.31, 1.16], [9.65, 2.28]]]], "mainOnly": true },
    { "iso": "er", "name": "Eritrea", "polygons": [[[[36.43, 14.42], [36.32, 14.82], [36.75, 16.29], [36.85, 16.96], [37.17, 17.26], [37.9, 17.43], [38.41, 18], [38.99, 16.84], [39.27, 15.92], [39.81, 15.44], [41.18, 14.49], [41.73, 13.92], [42.28, 13.34], [42.59, 13], [43.08, 12.7], [42.78, 12.46], [42.35, 12.54], [42.01, 12.87], [41.6, 13.45], [41.16, 13.77], [40.9, 14.12], [40.03, 14.52], [39.34, 14.53], [39.1, 14.74], [38.51, 14.51], [37.91, 14.96], [37.59, 14.21], [36.43, 14.42]]]], "mainOnly": true },
    { "iso": "ee", "name": "Estonia", "polygons": [[[[27.98, 59.48], [28.13, 59.3], [27.42, 58.72], [27.72, 57.79], [27.29, 57.47], [26.46, 57.48], [25.6, 57.85], [25.16, 57.97], [24.31, 57.79], [24.43, 58.38], [24.06, 58.26], [23.43, 58.61], [23.34, 59.19], [24.6, 59.47], [25.86, 59.61], [26.95, 59.45], [27.98, 59.48]]]], "mainOnly": true },
    { "iso": "sz", "name": "eSwatini", "polygons": [[[[32.07, -26.73], [31.87, -27.18], [31.28, -27.29], [30.69, -26.74], [30.68, -26.4], [30.95, -26.02], [31.04, -25.73], [31.33, -25.66], [31.84, -25.84], [31.99, -26.29], [32.07, -26.73]]]], "mainOnly": true },
    { "iso": "et", "name": "Ethiopia", "polygons": [[[[47.79, 8], [44.96, 5], [43.66, 4.96], [42.77, 4.25], [42.13, 4.23], [41.86, 3.92], [41.17, 3.92], [40.77, 4.26], [39.85, 3.84], [39.56, 3.42], [38.89, 3.5], [38.67, 3.62], [38.44, 3.59], [38.12, 3.6], [36.86, 4.45], [36.16, 4.45], [35.82, 4.78], [35.82, 5.34], [35.3, 5.51], [34.71, 6.59], [34.25, 6.83], [34.08, 7.23], [33.57, 7.71], [32.95, 7.78], [33.29, 8.35], [33.83, 8.38], [33.97, 8.68], [33.96, 9.58], [34.26, 10.63], [34.73, 10.91], [34.83, 11.32], [35.26, 12.08], [35.86, 12.58], [36.27, 13.56], [36.43, 14.42], [37.59, 14.21], [37.91, 14.96], [38.51, 14.51], [39.1, 14.74], [39.34, 14.53], [40.03, 14.52], [40.9, 14.12], [41.16, 13.77], [41.6, 13.45], [42.01, 12.87], [42.35, 12.54], [42, 12.1], [41.66, 11.63], [41.74, 11.36], [41.76, 11.05], [42.31, 11.03], [42.55, 11.11], [42.78, 10.93], [42.56, 10.57], [42.93, 10.02], [43.3, 9.54], [43.68, 9.18], [46.95, 8], [47.79, 8]]]], "mainOnly": true },
    { "iso": "fk", "name": "Falkland Islands", "polygons": [[[[-61.2, -51.85], [-60, -51.25], [-59.15, -51.5], [-58.55, -51.1], [-57.75, -51.55], [-58.05, -51.9], [-59.4, -52.2], [-59.85, -51.85], [-60.7, -52.3], [-61.2, -51.85]]]], "mainOnly": true },
    { "iso": "fj", "name": "Fiji", "polygons": [[[[180, -16.07], [180, -16.56], [179.36, -16.8], [178.73, -17.01], [178.6, -16.64], [179.1, -16.43], [179.41, -16.38], [180, -16.07]]], [[[178.13, -17.5], [178.37, -17.34], [178.72, -17.63], [178.55, -18.15], [177.93, -18.29], [177.38, -18.16], [177.29, -17.72], [177.67, -17.38], [178.13, -17.5]]], [[[-179.79, -16.02], [-179.92, -16.5], [-180, -16.56], [-180, -16.07], [-179.79, -16.02]]]], "mainOnly": true },
    { "iso": "fi", "name": "Finland", "polygons": [[[[28.59, 69.06], [28.45, 68.36], [29.98, 67.7], [29.05, 66.94], [30.22, 65.81], [29.54, 64.95], [30.44, 64.2], [30.04, 63.55], [31.52, 62.87], [31.14, 62.36], [30.21, 61.78], [28.07, 60.5], [26.26, 60.42], [24.5, 60.06], [22.87, 59.85], [22.29, 60.39], [21.32, 60.72], [21.54, 61.71], [21.06, 62.61], [21.54, 63.19], [22.44, 63.82], [24.73, 64.9], [25.4, 65.11], [25.29, 65.53], [23.9, 66.01], [23.57, 66.4], [23.54, 67.94], [21.98, 68.62], [20.65, 69.11], [21.24, 69.37], [22.36, 68.84], [23.66, 68.89], [24.74, 68.65], [25.69, 69.09], [26.18, 69.83], [27.73, 70.16], [29.02, 69.77], [28.59, 69.06]]]], "mainOnly": true },
    { "iso": "fr", "name": "France", "polygons": [[[[-51.66, 4.16], [-52.25, 3.24], [-52.56, 2.5], [-52.94, 2.12], [-53.42, 2.05], [-53.55, 2.33], [-53.78, 2.38], [-54.09, 2.11], [-54.52, 2.31], [-54.27, 2.73], [-54.18, 3.19], [-54.01, 3.62], [-54.4, 4.21], [-54.48, 4.9], [-53.96, 5.76], [-53.62, 5.65], [-52.88, 5.41], [-51.82, 4.57], [-51.66, 4.16]]], [[[6.19, 49.46], [6.66, 49.2], [8.1, 49.02], [7.59, 48.33], [7.47, 47.62], [7.19, 47.45], [6.74, 47.54], [6.77, 47.29], [6.04, 46.73], [6.02, 46.27], [6.5, 46.43], [6.84, 45.99], [6.8, 45.71], [7.1, 45.33], [6.75, 45.03], [7.01, 44.25], [7.55, 44.13], [7.44, 43.69], [6.53, 43.13], [4.56, 43.4], [3.1, 43.08], [2.99, 42.47], [1.83, 42.34], [0.7, 42.8], [0.34, 42.58], [-1.5, 43.03], [-1.9, 43.42], [-1.38, 44.02], [-1.19, 46.01], [-2.23, 47.06], [-2.96, 47.57], [-4.49, 47.95], [-4.59, 48.68], [-3.3, 48.9], [-1.62, 48.64], [-1.93, 49.78], [-0.99, 49.35], [1.34, 50.13], [1.64, 50.95], [2.51, 51.15], [2.66, 50.8], [3.12, 50.78], [3.59, 50.38], [4.29, 49.91], [4.8, 49.99], [5.67, 49.53], [5.9, 49.44], [6.19, 49.46]]], [[[8.75, 42.63], [9.39, 43.01], [9.56, 42.15], [9.23, 41.38], [8.78, 41.58], [8.54, 42.26], [8.75, 42.63]]]], "mainOnly": true },
    { "iso": "tf", "name": "French Southern and Antarctic Lands", "polygons": [[[[68.94, -48.62], [69.58, -48.94], [70.53, -49.06], [70.56, -49.25], [70.28, -49.71], [68.75, -49.77], [68.72, -49.24], [68.87, -48.83], [68.94, -48.62]]]], "mainOnly": true },
    { "iso": "ga", "name": "Gabon", "polygons": [[[[11.28, 2.26], [11.75, 2.33], [12.36, 2.19], [12.95, 2.32], [13.08, 2.27], [13, 1.83], [13.28, 1.31], [14.03, 1.4], [14.28, 1.2], [13.84, 0.04], [14.32, -0.55], [14.43, -1.33], [14.3, -2], [13.99, -2.47], [13.11, -2.43], [12.58, -1.95], [12.5, -2.39], [11.82, -2.51], [11.48, -2.77], [11.86, -3.43], [11.09, -3.98], [10.07, -2.97], [9.41, -2.14], [8.8, -1.11], [8.83, -0.78], [9.05, -0.46], [9.29, 0.27], [9.49, 1.01], [9.83, 1.07], [11.29, 1.06], [11.28, 2.26]]]], "mainOnly": true },
    { "iso": "gm", "name": "Gambia", "polygons": [[[[-16.71, 13.59], [-15.62, 13.62], [-15.4, 13.86], [-15.08, 13.88], [-14.69, 13.63], [-14.38, 13.63], [-14.05, 13.79], [-13.84, 13.51], [-14.28, 13.28], [-14.71, 13.3], [-15.14, 13.51], [-15.51, 13.28], [-15.69, 13.27], [-15.93, 13.13], [-16.84, 13.15], [-16.71, 13.59]]]], "mainOnly": true },
    { "iso": "ge", "name": "Georgia", "polygons": [[[[39.96, 43.43], [40.08, 43.55], [40.92, 43.38], [42.39, 43.22], [43.76, 42.74], [43.93, 42.55], [44.54, 42.71], [45.47, 42.5], [45.78, 42.09], [46.4, 41.86], [46.15, 41.72], [46.64, 41.18], [46.5, 41.06], [45.96, 41.12], [45.22, 41.41], [44.97, 41.25], [43.58, 41.09], [42.62, 41.58], [41.55, 41.54], [41.7, 41.96], [41.45, 42.65], [40.88, 43.01], [40.32, 43.13], [39.96, 43.43]]]], "mainOnly": true },
    { "iso": "de", "name": "Germany", "polygons": [[[[14.12, 53.76], [14.35, 53.25], [14.07, 52.98], [14.44, 52.62], [14.69, 52.09], [14.61, 51.75], [15.02, 51.11], [14.57, 51], [14.31, 51.12], [14.06, 50.93], [13.34, 50.73], [12.97, 50.48], [12.24, 50.27], [12.42, 49.97], [12.52, 49.55], [13.03, 49.31], [13.6, 48.88], [13.24, 48.42], [12.88, 48.29], [13.03, 47.64], [12.93, 47.47], [12.62, 47.67], [12.14, 47.7], [11.43, 47.52], [10.54, 47.57], [10.4, 47.3], [9.9, 47.58], [9.59, 47.53], [8.52, 47.83], [8.32, 47.61], [7.47, 47.62], [7.59, 48.33], [8.1, 49.02], [6.66, 49.2], [6.19, 49.46], [6.24, 49.9], [6.04, 50.13], [6.16, 50.8], [5.99, 51.85], [6.59, 51.85], [6.84, 52.23], [7.09, 53.14], [6.91, 53.48], [7.1, 53.69], [7.94, 53.75], [8.12, 53.53], [8.8, 54.02], [8.57, 54.4], [8.53, 54.96], [9.28, 54.83], [9.92, 54.98], [9.94, 54.6], [10.95, 54.36], [10.94, 54.01], [11.96, 54.2], [12.52, 54.47], [13.65, 54.08], [14.12, 53.76]]]], "mainOnly": true },
    { "iso": "gh", "name": "Ghana", "polygons": [[[[0.02, 11.02], [-0.05, 10.71], [0.37, 10.19], [0.37, 9.47], [0.46, 8.68], [0.71, 8.31], [0.49, 7.41], [0.57, 6.91], [0.84, 6.28], [1.06, 5.93], [-0.51, 5.34], [-1.06, 5], [-1.96, 4.71], [-2.86, 4.99], [-2.81, 5.39], [-3.24, 6.25], [-2.98, 7.38], [-2.56, 8.22], [-2.83, 9.64], [-2.96, 10.4], [-2.94, 10.96], [-1.2, 11.01], [-0.76, 10.94], [-0.44, 11.1], [0.02, 11.02]]]], "mainOnly": true },
    { "iso": "gr", "name": "Greece", "polygons": [[[[26.29, 35.3], [26.16, 35], [24.72, 34.92], [24.74, 35.08], [23.51, 35.28], [23.7, 35.71], [24.25, 35.37], [25.03, 35.42], [25.77, 35.35], [25.75, 35.18], [26.29, 35.3]]], [[[22.95, 41.34], [23.69, 41.31], [24.49, 41.58], [25.2, 41.23], [26.11, 41.33], [26.12, 41.83], [26.6, 41.56], [26.29, 40.94], [26.06, 40.82], [25.45, 40.85], [24.93, 40.95], [23.71, 40.69], [24.41, 40.12], [23.9, 39.96], [23.34, 39.96], [22.81, 40.48], [22.63, 40.26], [22.85, 39.66], [23.35, 39.19], [22.97, 38.97], [23.53, 38.51], [24.03, 38.22], [24.04, 37.66], [23.12, 37.92], [23.41, 37.41], [22.77, 37.31], [23.15, 36.42], [22.49, 36.41], [21.67, 36.84], [21.3, 37.64], [21.12, 38.31], [20.73, 38.77], [20.22, 39.34], [20.15, 39.62], [20.62, 40.11], [20.67, 40.44], [21, 40.58], [21.02, 40.84], [21.67, 40.93], [22.06, 41.15], [22.6, 41.13], [22.76, 41.3], [22.95, 41.34]]]], "mainOnly": false },
    { "iso": "gl", "name": "Greenland", "polygons": [[[[-46.76, 82.63], [-43.41, 83.23], [-39.9, 83.18], [-38.62, 83.55], [-35.09, 83.65], [-27.1, 83.52], [-20.85, 82.73], [-22.69, 82.34], [-26.52, 82.3], [-31.9, 82.2], [-31.4, 82.02], [-27.86, 82.13], [-24.84, 81.79], [-22.9, 82.09], [-22.07, 81.73], [-23.17, 81.15], [-20.62, 81.52], [-15.77, 81.91], [-12.77, 81.72], [-12.21, 81.29], [-16.29, 80.58], [-16.85, 80.35], [-20.05, 80.18], [-17.73, 80.13], [-18.9, 79.4], [-19.7, 78.75], [-19.67, 77.64], [-18.47, 76.99], [-20.04, 76.94], [-21.68, 76.63], [-19.83, 76.1], [-19.6, 75.25], [-20.67, 75.16], [-19.37, 74.3], [-21.59, 74.22], [-20.43, 73.82], [-20.76, 73.46], [-22.17, 73.31], [-23.57, 73.31], [-22.31, 72.63], [-22.3, 72.18], [-24.28, 72.6], [-24.79, 72.33], [-23.44, 72.08], [-22.13, 71.47], [-21.75, 70.66], [-23.54, 70.47], [-24.31, 70.86], [-25.54, 71.43], [-25.2, 70.75], [-26.36, 70.23], [-23.73, 70.18], [-22.35, 70.13], [-25.03, 69.26], [-27.75, 68.47], [-30.67, 68.13], [-31.78, 68.12], [-32.81, 67.74], [-34.2, 66.68], [-36.35, 65.98], [-37.04, 65.94], [-38.38, 65.69], [-39.81, 65.46], [-40.67, 64.84], [-40.68, 64.14], [-41.19, 63.48], [-42.82, 62.68], [-42.42, 61.9], [-42.87, 61.07], [-43.38, 60.1], [-44.79, 60.04], [-46.26, 60.85], [-48.26, 60.86], [-49.23, 61.41], [-49.9, 62.38], [-51.63, 63.63], [-52.14, 64.28], [-52.28, 65.18], [-53.66, 66.1], [-53.3, 66.84], [-53.97, 67.19], [-52.98, 68.36], [-51.48, 68.73], [-51.08, 69.15], [-50.87, 69.93], [-52.01, 69.57], [-52.56, 69.43], [-53.46, 69.28], [-54.68, 69.61], [-54.75, 70.29], [-54.36, 70.82], [-53.43, 70.84], [-51.39, 70.57], [-53.11, 71.2], [-54, 71.55], [-55, 71.41], [-55.83, 71.65], [-54.72, 72.59], [-55.33, 72.96], [-56.12, 73.65], [-57.32, 74.71], [-58.6, 75.1], [-58.59, 75.52], [-61.27, 76.1], [-63.39, 76.18], [-66.06, 76.13], [-68.5, 76.06], [-69.66, 76.38], [-71.4, 77.01], [-68.78, 77.32], [-66.76, 77.38], [-71.04, 77.64], [-73.3, 78.04], [-73.16, 78.43], [-69.37, 78.91], [-65.71, 79.39], [-65.32, 79.76], [-68.02, 80.12], [-67.15, 80.52], [-63.69, 81.21], [-62.23, 81.32], [-62.65, 81.77], [-60.28, 82.03], [-57.21, 82.19], [-54.13, 82.2], [-53.04, 81.89], [-50.39, 82.44], [-48, 82.06], [-46.6, 81.99], [-44.52, 81.66], [-46.9, 82.2], [-46.76, 82.63]]]], "mainOnly": true },
    { "iso": "gt", "name": "Guatemala", "polygons": [[[[-92.23, 14.54], [-92.2, 14.83], [-92.09, 15.06], [-92.23, 15.25], [-91.75, 16.07], [-90.46, 16.07], [-90.44, 16.41], [-90.6, 16.47], [-90.71, 16.69], [-91.08, 16.92], [-91.45, 17.25], [-91, 17.25], [-91, 17.82], [-90.07, 17.82], [-89.14, 17.81], [-89.15, 17.02], [-89.23, 15.89], [-88.93, 15.89], [-88.6, 15.71], [-88.52, 15.86], [-88.23, 15.73], [-88.68, 15.35], [-89.15, 15.07], [-89.23, 14.87], [-89.15, 14.68], [-89.35, 14.42], [-89.59, 14.36], [-89.53, 14.24], [-89.72, 14.13], [-90.06, 13.88], [-90.1, 13.74], [-90.61, 13.91], [-91.23, 13.93], [-91.69, 14.13], [-92.23, 14.54]]]], "mainOnly": true },
    { "iso": "gn", "name": "Guinea", "polygons": [[[[-13.7, 12.59], [-13.22, 12.58], [-12.5, 12.33], [-12.28, 12.35], [-12.2, 12.47], [-11.66, 12.39], [-11.51, 12.44], [-11.46, 12.08], [-11.3, 12.08], [-11.04, 12.21], [-10.87, 12.18], [-10.59, 11.92], [-10.17, 11.84], [-9.89, 12.06], [-9.57, 12.19], [-9.33, 12.33], [-9.13, 12.31], [-8.91, 12.09], [-8.79, 11.81], [-8.38, 11.39], [-8.58, 11.14], [-8.62, 10.81], [-8.41, 10.91], [-8.28, 10.79], [-8.34, 10.49], [-8.03, 10.21], [-8.23, 10.13], [-8.31, 9.79], [-8.08, 9.38], [-7.83, 8.58], [-8.2, 8.46], [-8.3, 8.32], [-8.22, 8.12], [-8.28, 7.69], [-8.44, 7.69], [-8.72, 7.71], [-8.93, 7.31], [-9.21, 7.31], [-9.4, 7.53], [-9.34, 7.93], [-9.76, 8.54], [-10.02, 8.43], [-10.23, 8.41], [-10.51, 8.35], [-10.49, 8.72], [-10.65, 8.98], [-10.62, 9.27], [-10.84, 9.69], [-11.12, 10.05], [-11.92, 10.05], [-12.15, 9.86], [-12.43, 9.84], [-12.6, 9.62], [-12.71, 9.34], [-13.25, 8.9], [-13.69, 9.49], [-14.07, 9.89], [-14.33, 10.02], [-14.58, 10.21], [-14.69, 10.66], [-14.84, 10.88], [-15.13, 11.04], [-14.69, 11.53], [-14.38, 11.51], [-14.12, 11.68], [-13.9, 11.68], [-13.74, 11.81], [-13.83, 12.14], [-13.72, 12.25], [-13.7, 12.59]]]], "mainOnly": true },
    { "iso": "gw", "name": "Guinea-Bissau", "polygons": [[[[-16.68, 12.38], [-16.15, 12.55], [-15.82, 12.52], [-15.55, 12.63], [-13.7, 12.59], [-13.72, 12.25], [-13.83, 12.14], [-13.74, 11.81], [-13.9, 11.68], [-14.12, 11.68], [-14.38, 11.51], [-14.69, 11.53], [-15.13, 11.04], [-15.66, 11.46], [-16.09, 11.52], [-16.31, 11.81], [-16.31, 11.96], [-16.61, 12.17], [-16.68, 12.38]]]], "mainOnly": true },
    { "iso": "gy", "name": "Guyana", "polygons": [[[[-56.54, 1.9], [-56.78, 1.86], [-57.34, 1.95], [-57.66, 1.68], [-58.11, 1.51], [-58.43, 1.46], [-58.54, 1.27], [-59.03, 1.32], [-59.65, 1.79], [-59.72, 2.25], [-59.97, 2.76], [-59.82, 3.61], [-59.54, 3.96], [-59.77, 4.42], [-60.11, 4.57], [-59.98, 5.01], [-60.21, 5.24], [-60.73, 5.2], [-61.41, 5.96], [-61.14, 6.23], [-61.16, 6.7], [-60.54, 6.86], [-60.3, 7.04], [-60.64, 7.42], [-60.55, 7.78], [-59.76, 8.37], [-59.1, 8], [-58.48, 7.35], [-58.45, 6.83], [-58.08, 6.81], [-57.54, 6.32], [-57.15, 5.97], [-57.31, 5.07], [-57.91, 4.81], [-57.86, 4.58], [-58.04, 4.06], [-57.6, 3.33], [-57.28, 3.33], [-57.15, 2.77], [-56.54, 1.9]]]], "mainOnly": true },
    { "iso": "ht", "name": "Haiti", "polygons": [[[[-71.71, 19.71], [-71.62, 19.17], [-71.7, 18.79], [-71.95, 18.62], [-71.69, 18.32], [-71.71, 18.04], [-72.37, 18.21], [-72.84, 18.15], [-73.45, 18.22], [-73.92, 18.03], [-74.46, 18.34], [-74.37, 18.66], [-73.45, 18.53], [-72.69, 18.45], [-72.33, 18.67], [-72.79, 19.1], [-72.78, 19.48], [-73.42, 19.64], [-73.19, 19.92], [-72.58, 19.87], [-71.71, 19.71]]]], "mainOnly": true },
    { "iso": "hn", "name": "Honduras", "polygons": [[[[-83.15, 15], [-83.49, 15.02], [-83.63, 14.88], [-83.98, 14.75], [-84.23, 14.75], [-84.45, 14.62], [-84.65, 14.67], [-84.82, 14.82], [-84.92, 14.79], [-85.05, 14.55], [-85.15, 14.56], [-85.17, 14.35], [-85.51, 14.08], [-85.7, 13.96], [-85.8, 13.84], [-86.1, 14.04], [-86.31, 13.77], [-86.52, 13.78], [-86.76, 13.75], [-86.73, 13.26], [-86.88, 13.25], [-87.01, 13.03], [-87.32, 12.98], [-87.49, 13.3], [-87.79, 13.38], [-87.72, 13.79], [-87.86, 13.89], [-88.07, 13.96], [-88.5, 13.85], [-88.54, 13.98], [-88.84, 14.14], [-89.06, 14.34], [-89.35, 14.42], [-89.15, 14.68], [-89.23, 14.87], [-89.15, 15.07], [-88.68, 15.35], [-88.23, 15.73], [-88.12, 15.69], [-87.9, 15.86], [-87.62, 15.88], [-87.52, 15.8], [-87.37, 15.85], [-86.9, 15.76], [-86.44, 15.78], [-86.12, 15.89], [-86, 16.01], [-85.68, 15.95], [-85.44, 15.89], [-85.18, 15.91], [-84.98, 16], [-84.53, 15.86], [-84.37, 15.84], [-84.06, 15.65], [-83.77, 15.42], [-83.41, 15.27], [-83.15, 15]]]], "mainOnly": true },
    { "iso": "hu", "name": "Hungary", "polygons": [[[[22.09, 48.42], [22.64, 48.15], [22.71, 47.88], [22.1, 47.67], [21.63, 46.99], [21.02, 46.32], [20.22, 46.13], [19.6, 46.17], [18.83, 45.91], [18.46, 45.76], [17.63, 45.95], [16.88, 46.38], [16.56, 46.5], [16.37, 46.84], [16.2, 46.85], [16.53, 47.5], [16.34, 47.71], [16.9, 47.71], [16.98, 48.12], [17.49, 47.87], [17.86, 47.76], [18.7, 47.88], [18.78, 48.08], [19.17, 48.11], [19.66, 48.27], [19.77, 48.2], [20.24, 48.33], [20.47, 48.56], [20.8, 48.62], [21.87, 48.32], [22.09, 48.42]]]], "mainOnly": true },
    { "iso": "is", "name": "Iceland", "polygons": [[[[-14.51, 66.46], [-14.74, 65.81], [-13.61, 65.13], [-14.91, 64.36], [-17.79, 63.68], [-18.66, 63.5], [-19.97, 63.64], [-22.76, 63.96], [-21.78, 64.4], [-23.96, 64.89], [-22.18, 65.08], [-22.23, 65.38], [-24.33, 65.61], [-23.65, 66.26], [-22.13, 66.41], [-20.58, 65.73], [-19.06, 66.28], [-17.8, 65.99], [-16.17, 66.53], [-14.51, 66.46]]]], "mainOnly": true },
    { "iso": "in", "name": "India", "polygons": [[[[97.33, 28.26], [97.4, 27.88], [97.05, 27.7], [97.13, 27.08], [96.42, 27.26], [95.12, 26.57], [95.16, 26], [94.6, 25.16], [94.55, 24.68], [94.11, 23.85], [93.33, 24.08], [93.29, 23.04], [93.06, 22.7], [93.17, 22.28], [92.67, 22.04], [92.15, 23.63], [91.87, 23.62], [91.71, 22.99], [91.16, 23.5], [91.47, 24.07], [91.92, 24.13], [92.38, 24.98], [91.8, 25.15], [90.87, 25.13], [89.92, 25.27], [89.83, 25.97], [89.36, 26.01], [88.56, 26.45], [88.21, 25.77], [88.93, 25.24], [88.31, 24.87], [88.08, 24.5], [88.7, 24.23], [88.53, 23.63], [88.88, 22.88], [89.03, 22.06], [88.89, 21.69], [88.21, 21.7], [86.98, 21.5], [87.03, 20.74], [86.5, 20.15], [85.06, 19.48], [83.94, 18.3], [83.19, 17.67], [82.19, 17.02], [82.19, 16.56], [81.69, 16.31], [80.79, 15.95], [80.32, 15.9], [80.03, 15.14], [80.23, 13.84], [80.29, 13.01], [79.86, 12.06], [79.86, 10.36], [79.34, 10.31], [78.89, 9.55], [79.19, 9.22], [78.28, 8.93], [77.94, 8.25], [77.54, 7.97], [76.59, 8.9], [76.13, 10.3], [75.75, 11.31], [75.4, 11.78], [74.86, 12.74], [74.62, 13.99], [74.44, 14.62], [73.53, 15.99], [73.12, 17.93], [72.82, 19.21], [72.82, 20.42], [72.63, 21.36], [71.18, 20.76], [70.47, 20.88], [69.16, 22.09], [69.64, 22.45], [69.35, 22.84], [68.18, 23.69], [68.84, 24.36], [71.04, 24.36], [70.84, 25.22], [70.28, 25.72], [70.17, 26.49], [69.51, 26.94], [70.62, 27.99], [71.78, 27.91], [72.82, 28.96], [73.45, 29.98], [74.42, 30.98], [74.41, 31.69], [75.26, 32.27], [74.45, 32.76], [74.1, 33.44], [73.75, 34.32], [74.24, 34.75], [75.76, 34.5], [76.87, 34.65], [77.84, 35.49], [78.91, 34.32], [78.81, 33.51], [79.21, 32.99], [79.18, 32.48], [78.46, 32.62], [78.74, 31.52], [79.72, 30.88], [81.11, 30.18], [80.48, 29.73], [80.09, 28.79], [81.06, 28.42], [82, 27.93], [83.3, 27.36], [84.68, 27.23], [85.25, 26.73], [86.02, 26.63], [87.23, 26.4], [88.06, 26.41], [88.17, 26.81], [88.04, 27.45], [88.12, 27.88], [88.73, 28.09], [88.81, 27.3], [88.84, 27.1], [89.74, 26.72], [90.37, 26.88], [91.22, 26.81], [92.03, 26.84], [92.1, 27.45], [91.7, 27.77], [92.5, 27.9], [93.41, 28.64], [94.57, 29.28], [95.4, 29.03], [96.12, 29.45], [96.59, 28.83], [96.25, 28.41], [97.33, 28.26]]]], "mainOnly": true },
    { "iso": "id", "name": "Indonesia", "polygons": [[[[124.97, -8.89], [125.07, -9.09], [125.09, -9.39], [124.44, -10.14], [123.58, -10.36], [123.46, -10.24], [123.55, -9.9], [123.98, -9.29], [124.97, -8.89]]], [[[134.21, -6.9], [134.11, -6.14], [134.29, -5.78], [134.5, -5.45], [134.73, -5.74], [134.72, -6.21], [134.21, -6.9]]], [[[117.88, 4.14], [117.31, 3.23], [118.05, 2.29], [117.88, 1.83], [119, 0.9], [117.81, 0.78], [117.48, 0.1], [117.52, -0.8], [116.56, -1.49], [116.53, -2.48], [116.15, -4.01], [116, -3.66], [114.86, -4.11], [114.47, -3.5], [113.76, -3.44], [113.26, -3.12], [112.07, -3.48], [111.7, -2.99], [111.05, -3.05], [110.22, -2.93], [110.07, -1.59], [109.57, -1.31], [109.09, -0.46], [108.95, 0.42], [109.07, 1.34], [109.66, 2.01], [109.83, 1.34], [110.51, 0.77], [111.16, 0.98], [111.8, 0.9], [112.38, 1.41], [112.86, 1.5], [113.81, 1.22], [114.62, 1.43], [115.13, 2.82], [115.52, 3.17], [115.87, 4.31], [117.02, 4.31], [117.88, 4.14]]], [[[127.93, 2.17], [128, 1.63], [128.59, 1.54], [128.69, 1.13], [128.64, 0.26], [128.12, 0.36], [127.97, -0.25], [128.38, -0.78], [128.1, -0.9], [127.7, -0.27], [127.4, 1.01], [127.6, 1.81], [127.93, 2.17]]], [[[122.93, 0.88], [124.08, 0.92], [125.07, 1.64], [125.24, 1.42], [124.44, 0.43], [123.69, 0.24], [122.72, 0.43], [121.06, 0.38], [120.18, 0.24], [120.04, -0.52], [120.94, -1.41], [121.48, -0.96], [123.34, -0.62], [123.26, -1.08], [122.82, -0.93], [122.39, -1.52], [121.51, -1.9], [122.45, -3.19], [122.27, -3.53], [123.17, -4.68], [123.16, -5.34], [122.63, -5.63], [122.24, -5.28], [122.72, -4.46], [121.74, -4.85], [121.49, -4.57], [121.62, -4.19], [120.9, -3.6], [120.97, -2.63], [120.31, -2.93], [120.39, -4.1], [120.43, -5.53], [119.8, -5.67], [119.37, -5.38], [119.65, -4.46], [119.5, -3.49], [119.08, -3.49], [118.77, -2.8], [119.18, -2.15], [119.32, -1.35], [119.83, 0.15], [120.04, 0.57], [120.89, 1.31], [121.67, 1.01], [122.93, 0.88]]], [[[120.3, -10.26], [118.97, -9.56], [119.9, -9.36], [120.43, -9.67], [120.78, -9.97], [120.72, -10.24], [120.3, -10.26]]], [[[121.34, -8.54], [122.01, -8.46], [122.9, -8.09], [122.76, -8.65], [121.25, -8.93], [119.92, -8.81], [119.92, -8.44], [120.72, -8.24], [121.34, -8.54]]], [[[118.26, -8.36], [118.88, -8.28], [119.13, -8.71], [117.97, -8.91], [117.28, -9.04], [116.74, -9.03], [117.08, -8.46], [117.63, -8.45], [117.9, -8.1], [118.26, -8.36]]], [[[108.49, -6.42], [108.62, -6.78], [110.54, -6.88], [110.76, -6.47], [112.61, -6.95], [112.98, -7.59], [114.48, -7.78], [115.71, -8.37], [114.56, -8.75], [113.46, -8.35], [112.56, -8.38], [111.52, -8.3], [110.59, -8.12], [109.43, -7.74], [108.69, -7.64], [108.28, -7.77], [106.45, -7.35], [106.28, -6.92], [105.37, -6.85], [106.05, -5.9], [107.27, -5.95], [108.07, -6.35], [108.49, -6.42]]], [[[104.37, -1.08], [104.54, -1.78], [104.89, -2.34], [105.62, -2.43], [106.11, -3.06], [105.86, -4.31], [105.82, -5.85], [104.71, -5.87], [103.87, -5.04], [102.58, -4.22], [102.16, -3.61], [101.4, -2.8], [100.9, -2.05], [100.14, -0.65], [99.26, 0.18], [98.97, 1.04], [98.6, 1.82], [97.7, 2.45], [97.18, 3.31], [96.42, 3.87], [95.38, 4.97], [95.29, 5.48], [95.94, 5.44], [97.48, 5.25], [98.37, 4.27], [99.14, 3.59], [99.69, 3.17], [100.64, 2.1], [101.66, 2.08], [102.5, 1.4], [103.08, 0.56], [103.84, 0.1], [103.44, -0.71], [104.01, -1.06], [104.37, -1.08]]]], "mainOnly": false },
    { "iso": "ir", "name": "Iran", "polygons": [[[[48.57, 29.93], [48.01, 30.45], [48, 30.99], [47.69, 30.98], [47.85, 31.71], [47.33, 32.47], [46.11, 33.02], [45.42, 33.97], [45.65, 34.75], [46.15, 35.09], [46.08, 35.68], [45.42, 35.98], [44.77, 37.17], [44.23, 37.97], [44.42, 38.28], [44.11, 39.43], [44.79, 39.71], [44.95, 39.34], [45.46, 38.87], [46.14, 38.74], [46.51, 38.77], [47.69, 39.51], [48.06, 39.58], [48.36, 39.29], [48.01, 38.79], [48.63, 38.27], [48.88, 38.32], [49.2, 37.58], [50.15, 37.37], [50.84, 36.87], [52.26, 36.7], [53.83, 36.97], [53.92, 37.2], [54.8, 37.39], [55.51, 37.96], [56.18, 37.94], [56.62, 38.12], [57.33, 38.03], [58.44, 37.52], [59.23, 37.41], [60.38, 36.53], [61.12, 36.49], [61.21, 35.65], [60.8, 34.4], [60.53, 33.68], [60.96, 33.53], [60.54, 32.98], [60.86, 32.18], [60.94, 31.55], [61.7, 31.38], [61.78, 30.74], [60.87, 29.83], [61.37, 29.3], [61.77, 28.7], [62.73, 28.26], [62.76, 27.38], [63.23, 27.22], [63.32, 26.76], [61.87, 26.24], [61.5, 25.08], [59.62, 25.38], [58.53, 25.61], [57.4, 25.74], [56.97, 26.97], [56.49, 27.14], [55.72, 26.96], [54.72, 26.48], [53.49, 26.81], [52.48, 27.58], [51.52, 27.87], [50.85, 28.81], [50.12, 30.15], [49.58, 29.99], [48.94, 30.32], [48.57, 29.93]]]], "mainOnly": true },
    { "iso": "iq", "name": "Iraq", "polygons": [[[[39.2, 32.16], [38.79, 33.38], [41.01, 34.42], [41.38, 35.63], [41.29, 36.36], [41.84, 36.61], [42.35, 37.23], [42.78, 37.39], [43.94, 37.26], [44.29, 37], [44.77, 37.17], [45.42, 35.98], [46.08, 35.68], [46.15, 35.09], [45.65, 34.75], [45.42, 33.97], [46.11, 33.02], [47.33, 32.47], [47.85, 31.71], [47.69, 30.98], [48, 30.99], [48.01, 30.45], [48.57, 29.93], [47.97, 29.98], [47.3, 30.06], [46.57, 29.1], [44.71, 29.18], [41.89, 31.19], [40.4, 31.89], [39.2, 32.16]]]], "mainOnly": true },
    { "iso": "ie", "name": "Ireland", "polygons": [[[[-6.2, 53.87], [-6.03, 53.15], [-6.79, 52.26], [-8.56, 51.67], [-9.98, 51.82], [-9.17, 52.86], [-9.69, 53.88], [-8.33, 54.66], [-7.57, 55.13], [-7.37, 54.6], [-7.57, 54.06], [-6.95, 54.07], [-6.2, 53.87]]]], "mainOnly": true },
    { "iso": "il", "name": "Israel", "polygons": [[[[35.72, 32.71], [35.55, 32.39], [35.18, 32.53], [34.97, 31.87], [35.23, 31.75], [34.97, 31.62], [34.93, 31.35], [35.4, 31.49], [35.42, 31.1], [34.92, 29.5], [34.82, 29.76], [34.27, 31.22], [34.56, 31.55], [34.49, 31.61], [34.75, 32.07], [34.96, 32.83], [35.1, 33.08], [35.13, 33.09], [35.46, 33.09], [35.55, 33.26], [35.82, 33.28], [35.84, 32.87], [35.7, 32.72], [35.72, 32.71]]]], "mainOnly": true },
    { "iso": "it", "name": "Italy", "polygons": [[[[10.44, 46.89], [11.05, 46.75], [11.16, 46.94], [12.15, 47.12], [12.38, 46.77], [13.81, 46.51], [13.7, 46.02], [13.94, 45.59], [13.14, 45.74], [12.33, 45.38], [12.38, 44.89], [12.26, 44.6], [12.59, 44.09], [13.53, 43.59], [14.03, 42.76], [15.14, 41.96], [15.93, 41.96], [16.17, 41.74], [15.89, 41.54], [16.79, 41.18], [17.52, 40.88], [18.38, 40.36], [18.48, 40.17], [18.29, 39.81], [17.74, 40.28], [16.87, 40.44], [16.45, 39.8], [17.17, 39.42], [17.05, 38.9], [16.64, 38.84], [16.1, 37.99], [15.68, 37.91], [15.69, 38.21], [15.89, 38.75], [16.11, 38.96], [15.72, 39.54], [15.41, 40.05], [15, 40.17], [14.7, 40.6], [14.06, 40.79], [13.63, 41.19], [12.89, 41.25], [12.11, 41.7], [11.19, 42.36], [10.51, 42.93], [10.2, 43.92], [9.7, 44.04], [8.89, 44.37], [8.43, 44.23], [7.85, 43.77], [7.44, 43.69], [7.55, 44.13], [7.01, 44.25], [6.75, 45.03], [7.1, 45.33], [6.8, 45.71], [6.84, 45.99], [7.27, 45.78], [7.76, 45.82], [8.32, 46.16], [8.49, 46.01], [8.97, 46.04], [9.18, 46.44], [9.92, 46.31], [10.36, 46.48], [10.44, 46.89]]], [[[14.76, 38.14], [15.52, 38.23], [15.16, 37.44], [15.31, 37.13], [15.1, 36.62], [14.34, 37], [13.83, 37.1], [12.43, 37.61], [12.57, 38.13], [13.74, 38.03], [14.76, 38.14]]], [[[8.71, 40.9], [9.21, 41.21], [9.81, 40.5], [9.67, 39.18], [9.21, 39.24], [8.81, 38.91], [8.43, 39.17], [8.39, 40.38], [8.16, 40.95], [8.71, 40.9]]]], "mainOnly": true },
    { "iso": "ci", "name": "Ivory Coast", "polygons": [[[[-8.03, 10.21], [-7.9, 10.3], [-7.62, 10.15], [-6.85, 10.14], [-6.67, 10.43], [-6.49, 10.41], [-6.21, 10.52], [-6.05, 10.1], [-5.82, 10.22], [-5.4, 10.37], [-4.95, 10.15], [-4.78, 9.82], [-4.33, 9.61], [-3.98, 9.86], [-3.51, 9.9], [-2.83, 9.64], [-2.56, 8.22], [-2.98, 7.38], [-3.24, 6.25], [-2.81, 5.39], [-2.86, 4.99], [-3.31, 4.98], [-4.01, 5.18], [-4.65, 5.17], [-5.83, 4.99], [-6.53, 4.71], [-7.52, 4.34], [-7.71, 4.36], [-7.64, 5.19], [-7.54, 5.31], [-7.57, 5.71], [-7.99, 6.13], [-8.31, 6.19], [-8.6, 6.47], [-8.39, 6.91], [-8.49, 7.4], [-8.44, 7.69], [-8.28, 7.69], [-8.22, 8.12], [-8.3, 8.32], [-8.2, 8.46], [-7.83, 8.58], [-8.08, 9.38], [-8.31, 9.79], [-8.23, 10.13], [-8.03, 10.21]]]], "mainOnly": true },
    { "iso": "jm", "name": "Jamaica", "polygons": [[[[-77.57, 18.49], [-76.9, 18.4], [-76.37, 18.16], [-76.2, 17.89], [-76.9, 17.87], [-77.21, 17.7], [-77.77, 17.86], [-78.34, 18.23], [-78.22, 18.45], [-77.8, 18.52], [-77.57, 18.49]]]], "mainOnly": true },
    { "iso": "jp", "name": "Japan", "polygons": [[[[141.88, 39.18], [140.96, 38.17], [140.98, 37.14], [140.6, 36.34], [140.77, 35.84], [140.25, 35.14], [138.98, 34.67], [137.22, 34.61], [135.79, 33.46], [135.12, 33.85], [135.08, 34.6], [133.34, 34.38], [132.16, 33.9], [130.99, 33.89], [132, 33.15], [131.33, 31.45], [130.69, 31.03], [130.2, 31.42], [130.45, 32.32], [129.81, 32.61], [129.41, 33.3], [130.35, 33.6], [130.88, 34.23], [131.88, 34.75], [132.62, 35.43], [134.61, 35.73], [135.68, 35.53], [136.72, 37.3], [137.39, 36.83], [138.86, 37.83], [139.43, 38.22], [140.05, 39.44], [139.88, 40.56], [140.31, 41.2], [141.37, 41.38], [141.91, 39.99], [141.88, 39.18]]], [[[144.61, 43.96], [145.32, 44.38], [145.54, 43.26], [144.06, 42.99], [143.18, 42], [141.61, 42.68], [141.07, 41.58], [139.96, 41.57], [139.82, 42.56], [140.31, 43.33], [141.38, 43.39], [141.67, 44.77], [141.97, 45.55], [143.14, 44.51], [143.91, 44.17], [144.61, 43.96]]], [[[132.37, 33.46], [132.92, 34.06], [133.49, 33.94], [133.9, 34.36], [134.64, 34.15], [134.77, 33.81], [134.2, 33.2], [133.79, 33.52], [133.28, 33.29], [133.01, 32.7], [132.36, 32.99], [132.37, 33.46]]]], "mainOnly": true },
    { "iso": "jo", "name": "Jordan", "polygons": [[[[35.55, 32.39], [35.72, 32.71], [36.83, 32.31], [38.79, 33.38], [39.2, 32.16], [39, 32.01], [37, 31.51], [38, 30.51], [37.67, 30.34], [37.5, 30], [36.74, 29.87], [36.5, 29.51], [36.07, 29.2], [34.96, 29.36], [34.92, 29.5], [35.42, 31.1], [35.4, 31.49], [35.55, 31.78], [35.55, 32.39]]]], "mainOnly": true },
    { "iso": "kz", "name": "Kazakhstan", "polygons": [[[[87.36, 49.21], [86.6, 48.55], [85.77, 48.46], [85.72, 47.45], [85.16, 47], [83.18, 47.33], [82.46, 45.54], [81.95, 45.32], [79.97, 44.92], [80.87, 43.18], [80.18, 42.92], [80.26, 42.35], [79.64, 42.5], [79.14, 42.86], [77.66, 42.96], [76, 42.99], [75.64, 42.88], [74.21, 43.3], [73.65, 43.09], [73.49, 42.5], [71.84, 42.85], [71.19, 42.7], [70.96, 42.27], [70.39, 42.08], [69.07, 41.38], [68.63, 40.67], [68.26, 40.66], [67.99, 41.14], [66.71, 41.17], [66.51, 41.99], [66.02, 41.99], [66.1, 43], [64.9, 43.73], [63.19, 43.65], [62.01, 43.5], [61.06, 44.41], [60.24, 44.78], [58.69, 45.5], [58.5, 45.59], [55.93, 45], [55.97, 41.31], [55.46, 41.26], [54.76, 42.04], [54.08, 42.32], [52.94, 42.12], [52.5, 41.78], [52.45, 42.03], [52.69, 42.44], [52.5, 42.79], [51.34, 43.13], [50.89, 44.03], [50.34, 44.28], [50.31, 44.61], [51.28, 44.51], [51.32, 45.25], [52.17, 45.41], [53.04, 45.26], [53.22, 46.23], [53.04, 46.85], [52.04, 46.8], [51.19, 47.05], [50.03, 46.61], [49.1, 46.4], [48.59, 46.56], [48.69, 47.08], [48.06, 47.74], [47.32, 47.72], [46.47, 48.39], [47.04, 49.15], [46.75, 49.36], [47.55, 50.45], [48.58, 49.87], [48.7, 50.61], [50.77, 51.69], [52.33, 51.72], [54.53, 51.03], [55.72, 50.62], [56.78, 51.04], [58.36, 51.06], [59.64, 50.55], [59.93, 50.84], [61.34, 50.8], [61.59, 51.27], [59.97, 51.96], [60.93, 52.45], [60.74, 52.72], [61.7, 52.98], [60.98, 53.66], [61.44, 54.01], [65.18, 54.35], [65.67, 54.6], [68.17, 54.97], [69.07, 55.39], [70.87, 55.17], [71.18, 54.13], [72.22, 54.38], [73.51, 54.04], [73.43, 53.49], [74.38, 53.55], [76.89, 54.49], [76.53, 54.18], [77.8, 53.4], [80.04, 50.86], [80.57, 51.39], [81.95, 50.81], [83.38, 51.07], [83.94, 50.89], [84.42, 50.31], [85.12, 50.12], [85.54, 49.69], [86.83, 49.83], [87.36, 49.21]]]], "mainOnly": true },
    { "iso": "ke", "name": "Kenya", "polygons": [[[[39.2, -4.68], [37.77, -3.68], [37.7, -3.1], [34.07, -1.06], [33.9, -0.95], [33.89, 0.11], [34.18, 0.52], [34.67, 1.18], [35.04, 1.91], [34.6, 3.05], [34.48, 3.56], [34.01, 4.25], [34.62, 4.85], [35.3, 5.51], [35.82, 5.34], [35.82, 4.78], [36.16, 4.45], [36.86, 4.45], [38.12, 3.6], [38.44, 3.59], [38.67, 3.62], [38.89, 3.5], [39.56, 3.42], [39.85, 3.84], [40.77, 4.26], [41.17, 3.92], [41.86, 3.92], [40.98, 2.78], [40.99, -0.86], [41.59, -1.68], [40.88, -2.08], [40.64, -2.5], [40.26, -2.57], [40.12, -3.28], [39.8, -3.68], [39.6, -4.35], [39.2, -4.68]]]], "mainOnly": true },
    { "iso": "xk", "name": "Kosovo", "polygons": [[[[20.59, 41.86], [20.52, 42.22], [20.28, 42.32], [20.07, 42.59], [20.26, 42.81], [20.5, 42.88], [20.64, 43.22], [20.81, 43.27], [20.96, 43.13], [21.14, 43.07], [21.27, 42.91], [21.44, 42.86], [21.63, 42.68], [21.78, 42.68], [21.66, 42.44], [21.54, 42.32], [21.58, 42.25], [21.35, 42.21], [20.76, 42.05], [20.72, 41.85], [20.59, 41.86]]]], "mainOnly": true },
    { "iso": "kw", "name": "Kuwait", "polygons": [[[[47.97, 29.98], [48.18, 29.53], [48.09, 29.31], [48.42, 28.55], [47.71, 28.53], [47.46, 29], [46.57, 29.1], [47.3, 30.06], [47.97, 29.98]]]], "mainOnly": true },
    { "iso": "kg", "name": "Kyrgyzstan", "polygons": [[[[70.96, 42.27], [71.19, 42.7], [71.84, 42.85], [73.49, 42.5], [73.65, 43.09], [74.21, 43.3], [75.64, 42.88], [76, 42.99], [77.66, 42.96], [79.14, 42.86], [79.64, 42.5], [80.26, 42.35], [80.12, 42.12], [78.54, 41.58], [78.19, 41.19], [76.9, 41.07], [76.53, 40.43], [75.47, 40.56], [74.78, 40.37], [73.82, 39.89], [73.96, 39.66], [73.68, 39.43], [71.78, 39.28], [70.55, 39.6], [69.46, 39.53], [69.56, 40.1], [70.65, 39.94], [71.01, 40.24], [71.77, 40.15], [73.06, 40.87], [71.87, 41.39], [71.16, 41.14], [70.42, 41.52], [71.26, 42.17], [70.96, 42.27]]]], "mainOnly": true },
    { "iso": "la", "name": "Laos", "polygons": [[[[107.38, 14.2], [106.5, 14.57], [106.04, 13.88], [105.22, 14.27], [105.54, 14.72], [105.59, 15.57], [104.78, 16.44], [104.72, 17.43], [103.96, 18.24], [103.2, 18.31], [103, 17.96], [102.41, 17.93], [102.11, 18.11], [101.06, 17.51], [101.04, 18.41], [101.28, 19.46], [100.61, 19.51], [100.55, 20.11], [100.12, 20.42], [100.33, 20.79], [101.18, 21.44], [101.27, 21.2], [101.8, 21.17], [101.65, 22.32], [102.17, 22.46], [102.75, 21.68], [103.2, 20.77], [104.44, 20.76], [104.82, 19.89], [104.18, 19.62], [103.9, 19.27], [105.09, 18.67], [105.93, 17.49], [106.56, 16.6], [107.31, 15.91], [107.56, 15.2], [107.38, 14.2]]]], "mainOnly": true },
    { "iso": "lv", "name": "Latvia", "polygons": [[[[27.29, 57.47], [27.77, 57.24], [27.86, 56.76], [28.18, 56.17], [27.1, 55.78], [26.49, 55.62], [25.53, 56.1], [25, 56.16], [24.86, 56.37], [23.88, 56.27], [22.2, 56.34], [21.06, 56.03], [21.09, 56.78], [21.58, 57.41], [22.52, 57.75], [23.32, 57.01], [24.12, 57.03], [24.31, 57.79], [25.16, 57.97], [25.6, 57.85], [26.46, 57.48], [27.29, 57.47]]]], "mainOnly": true },
    { "iso": "lb", "name": "Lebanon", "polygons": [[[[35.82, 33.28], [35.55, 33.26], [35.46, 33.09], [35.13, 33.09], [35.48, 33.91], [35.98, 34.61], [36, 34.64], [36.45, 34.59], [36.61, 34.2], [36.07, 33.82], [35.82, 33.28]]]], "mainOnly": true },
    { "iso": "ls", "name": "Lesotho", "polygons": [[[[28.98, -28.96], [29.33, -29.26], [29.02, -29.74], [28.85, -30.07], [28.29, -30.23], [28.11, -30.55], [27.75, -30.65], [27, -29.88], [27.53, -29.24], [28.07, -28.85], [28.54, -28.65], [28.98, -28.96]]]], "mainOnly": true },
    { "iso": "lr", "name": "Liberia", "polygons": [[[[-8.44, 7.69], [-8.49, 7.4], [-8.39, 6.91], [-8.6, 6.47], [-8.31, 6.19], [-7.99, 6.13], [-7.57, 5.71], [-7.54, 5.31], [-7.64, 5.19], [-7.71, 4.36], [-7.97, 4.36], [-9, 4.83], [-9.91, 5.59], [-10.77, 6.14], [-11.44, 6.79], [-11.2, 7.11], [-11.15, 7.4], [-10.7, 7.94], [-10.23, 8.41], [-10.02, 8.43], [-9.76, 8.54], [-9.34, 7.93], [-9.4, 7.53], [-9.21, 7.31], [-8.93, 7.31], [-8.72, 7.71], [-8.44, 7.69]]]], "mainOnly": true },
    { "iso": "ly", "name": "Libya", "polygons": [[[[25, 22], [25, 20], [23.85, 20], [23.84, 19.58], [19.85, 21.5], [15.86, 23.41], [14.85, 22.86], [14.14, 22.49], [13.58, 23.04], [12, 23.47], [11.56, 24.1], [10.77, 24.56], [10.3, 24.38], [9.95, 24.94], [9.91, 25.37], [9.32, 26.09], [9.72, 26.51], [9.63, 27.14], [9.76, 27.69], [9.68, 28.14], [9.86, 28.96], [9.81, 29.42], [9.48, 30.31], [9.97, 30.54], [10.06, 30.96], [9.95, 31.38], [10.64, 31.76], [10.94, 32.08], [11.43, 32.37], [11.49, 33.14], [12.66, 32.79], [13.08, 32.88], [13.92, 32.71], [15.25, 32.27], [15.71, 31.38], [16.61, 31.18], [18.02, 30.76], [19.09, 30.27], [19.57, 30.53], [20.05, 30.99], [19.82, 31.75], [20.13, 32.24], [20.85, 32.71], [21.54, 32.84], [22.9, 32.64], [23.24, 32.19], [23.61, 32.19], [23.93, 32.02], [24.92, 31.9], [25.16, 31.57], [24.8, 31.09], [24.96, 30.66], [24.7, 30.04], [25, 29.24], [25, 25.68], [25, 22]]]], "mainOnly": true },
    { "iso": "lt", "name": "Lithuania", "polygons": [[[[26.49, 55.62], [26.59, 55.17], [25.77, 54.85], [25.54, 54.28], [24.45, 53.91], [23.48, 53.91], [23.24, 54.22], [22.73, 54.33], [22.65, 54.58], [22.76, 54.86], [22.32, 55.02], [21.27, 55.19], [21.06, 56.03], [22.2, 56.34], [23.88, 56.27], [24.86, 56.37], [25, 56.16], [25.53, 56.1], [26.49, 55.62]]]], "mainOnly": true },
    { "iso": "lu", "name": "Luxembourg", "polygons": [[[[6.04, 50.13], [6.24, 49.9], [6.19, 49.46], [5.9, 49.44], [5.67, 49.53], [5.78, 50.09], [6.04, 50.13]]]], "mainOnly": true },
    { "iso": "mg", "name": "Madagascar", "polygons": [[[[49.54, -12.47], [49.81, -12.9], [50.06, -13.56], [50.22, -14.76], [50.48, -15.23], [50.38, -15.71], [50.2, -16], [49.86, -15.41], [49.67, -15.71], [49.86, -16.45], [49.77, -16.88], [49.5, -17.11], [49.44, -17.95], [49.04, -19.12], [48.55, -20.5], [47.93, -22.39], [47.55, -23.78], [47.1, -24.94], [46.28, -25.18], [45.41, -25.6], [44.83, -25.35], [44.04, -24.99], [43.76, -24.46], [43.7, -23.57], [43.35, -22.78], [43.25, -22.06], [43.43, -21.34], [43.89, -21.16], [43.9, -20.83], [44.37, -20.07], [44.46, -19.44], [44.23, -18.96], [44.04, -18.33], [43.96, -17.41], [44.31, -16.85], [44.45, -16.22], [44.94, -16.18], [45.5, -15.97], [45.87, -15.79], [46.31, -15.78], [46.88, -15.21], [47.71, -14.59], [48.01, -14.09], [47.87, -13.66], [48.29, -13.78], [48.85, -13.09], [48.86, -12.49], [49.19, -12.04], [49.54, -12.47]]]], "mainOnly": true },
    { "iso": "mw", "name": "Malawi", "polygons": [[[[32.76, -9.23], [33.74, -9.42], [33.94, -9.69], [34.28, -10.16], [34.56, -11.52], [34.28, -12.28], [34.56, -13.58], [34.91, -13.57], [35.27, -13.89], [35.69, -14.61], [35.77, -15.9], [35.34, -16.11], [35.03, -16.8], [34.38, -16.18], [34.31, -15.48], [34.52, -15.01], [34.46, -14.61], [34.06, -14.36], [33.79, -14.45], [33.21, -13.97], [32.69, -13.71], [32.99, -12.78], [33.31, -12.44], [33.11, -11.61], [33.32, -10.8], [33.49, -10.53], [33.23, -9.68], [32.76, -9.23]]]], "mainOnly": true },
    { "iso": "my", "name": "Malaysia", "polygons": [[[[100.09, 6.46], [100.26, 6.64], [101.08, 6.2], [101.15, 5.69], [101.81, 5.81], [102.14, 6.22], [102.37, 6.13], [102.96, 5.52], [103.38, 4.86], [103.44, 4.18], [103.33, 3.73], [103.43, 3.38], [103.5, 2.79], [103.85, 2.52], [104.25, 1.63], [104.23, 1.29], [103.52, 1.23], [102.57, 1.97], [101.39, 2.76], [101.27, 3.27], [100.7, 3.94], [100.56, 4.77], [100.2, 5.31], [100.31, 6.04], [100.09, 6.46]]], [[[117.88, 4.14], [117.02, 4.31], [115.87, 4.31], [115.52, 3.17], [115.13, 2.82], [114.62, 1.43], [113.81, 1.22], [112.86, 1.5], [112.38, 1.41], [111.8, 0.9], [111.16, 0.98], [110.51, 0.77], [109.83, 1.34], [109.66, 2.01], [110.4, 1.66], [111.17, 1.85], [111.37, 2.7], [111.8, 2.89], [113, 3.1], [113.71, 3.89], [114.2, 4.53], [114.66, 4.01], [114.87, 4.35], [115.35, 4.32], [115.41, 4.96], [115.45, 5.45], [116.22, 6.14], [116.73, 6.92], [117.13, 6.93], [117.64, 6.42], [117.69, 5.99], [118.35, 5.71], [119.18, 5.41], [119.11, 5.02], [118.44, 4.97], [118.62, 4.48], [117.88, 4.14]]]], "mainOnly": true },
    { "iso": "ml", "name": "Mali", "polygons": [[[[-11.51, 12.44], [-11.47, 12.75], [-11.55, 13.14], [-11.93, 13.42], [-12.12, 13.99], [-12.17, 14.62], [-11.83, 14.8], [-11.67, 15.39], [-11.35, 15.41], [-10.65, 15.13], [-10.09, 15.33], [-9.7, 15.26], [-9.55, 15.49], [-5.54, 15.5], [-5.32, 16.2], [-5.49, 16.33], [-5.97, 20.64], [-6.45, 24.96], [-4.92, 24.97], [-1.55, 22.79], [1.82, 20.61], [2.06, 20.14], [2.68, 19.86], [3.15, 19.69], [3.16, 19.06], [4.27, 19.16], [4.27, 16.85], [3.72, 16.18], [3.64, 15.57], [2.75, 15.41], [1.39, 15.32], [1.02, 14.97], [0.37, 14.93], [-0.27, 14.92], [-0.52, 15.12], [-1.07, 14.97], [-2, 14.56], [-2.19, 14.25], [-2.97, 13.8], [-3.1, 13.54], [-3.52, 13.34], [-4.01, 13.47], [-4.28, 13.23], [-4.43, 12.54], [-5.22, 11.71], [-5.2, 11.38], [-5.47, 10.95], [-5.4, 10.37], [-5.82, 10.22], [-6.05, 10.1], [-6.21, 10.52], [-6.49, 10.41], [-6.67, 10.43], [-6.85, 10.14], [-7.62, 10.15], [-7.9, 10.3], [-8.03, 10.21], [-8.34, 10.49], [-8.28, 10.79], [-8.41, 10.91], [-8.62, 10.81], [-8.58, 11.14], [-8.38, 11.39], [-8.79, 11.81], [-8.91, 12.09], [-9.13, 12.31], [-9.33, 12.33], [-9.57, 12.19], [-9.89, 12.06], [-10.17, 11.84], [-10.59, 11.92], [-10.87, 12.18], [-11.04, 12.21], [-11.3, 12.08], [-11.46, 12.08], [-11.51, 12.44]]]], "mainOnly": true },
    { "iso": "mr", "name": "Mauritania", "polygons": [[[[-17.06, 21], [-16.85, 21.33], [-12.93, 21.33], [-13.12, 22.77], [-12.87, 23.28], [-11.94, 23.37], [-11.97, 25.93], [-8.69, 25.88], [-8.68, 27.4], [-4.92, 24.97], [-6.45, 24.96], [-5.97, 20.64], [-5.49, 16.33], [-5.32, 16.2], [-5.54, 15.5], [-9.55, 15.49], [-9.7, 15.26], [-10.09, 15.33], [-10.65, 15.13], [-11.35, 15.41], [-11.67, 15.39], [-11.83, 14.8], [-12.17, 14.62], [-12.83, 15.3], [-13.44, 16.04], [-14.1, 16.3], [-14.58, 16.6], [-15.14, 16.59], [-15.62, 16.37], [-16.12, 16.46], [-16.46, 16.14], [-16.55, 16.67], [-16.27, 17.17], [-16.15, 18.11], [-16.26, 19.1], [-16.38, 19.59], [-16.28, 20.09], [-16.54, 20.57], [-17.06, 21]]]], "mainOnly": true },
    { "iso": "mx", "name": "Mexico", "polygons": [[[[-117.13, 32.54], [-115.99, 32.61], [-114.72, 32.72], [-114.81, 32.53], [-113.3, 32.04], [-111.02, 31.33], [-109.03, 31.34], [-108.24, 31.34], [-108.24, 31.75], [-106.51, 31.75], [-106.14, 31.4], [-105.63, 31.08], [-105.04, 30.64], [-104.71, 30.12], [-104.46, 29.57], [-103.94, 29.27], [-103.11, 28.97], [-102.48, 29.76], [-101.66, 29.78], [-100.96, 29.38], [-100.46, 28.7], [-100.11, 28.11], [-99.52, 27.54], [-99.3, 26.84], [-99.02, 26.37], [-98.24, 26.06], [-97.53, 25.84], [-97.14, 25.87], [-97.53, 24.99], [-97.7, 24.27], [-97.78, 22.93], [-97.87, 22.44], [-97.7, 21.9], [-97.39, 21.41], [-97.19, 20.64], [-96.53, 19.89], [-96.29, 19.32], [-95.9, 18.83], [-94.84, 18.56], [-94.43, 18.14], [-93.55, 18.42], [-92.79, 18.52], [-92.04, 18.7], [-91.41, 18.88], [-90.77, 19.28], [-90.53, 19.87], [-90.45, 20.71], [-90.28, 21], [-89.6, 21.26], [-88.54, 21.49], [-87.66, 21.46], [-87.05, 21.54], [-86.81, 21.33], [-86.85, 20.85], [-87.38, 20.26], [-87.62, 19.65], [-87.44, 19.47], [-87.59, 19.04], [-87.84, 18.26], [-88.09, 18.52], [-88.3, 18.5], [-88.49, 18.49], [-88.85, 17.88], [-89.03, 18], [-89.15, 17.96], [-89.14, 17.81], [-90.07, 17.82], [-91, 17.82], [-91, 17.25], [-91.45, 17.25], [-91.08, 16.92], [-90.71, 16.69], [-90.6, 16.47], [-90.44, 16.41], [-90.46, 16.07], [-91.75, 16.07], [-92.23, 15.25], [-92.09, 15.06], [-92.2, 14.83], [-92.23, 14.54], [-93.36, 15.62], [-93.88, 15.94], [-94.69, 16.2], [-95.25, 16.13], [-96.05, 15.75], [-96.56, 15.65], [-97.26, 15.92], [-98.01, 16.11], [-98.95, 16.57], [-99.7, 16.71], [-100.83, 17.17], [-101.67, 17.65], [-101.92, 17.92], [-102.48, 17.98], [-103.5, 18.29], [-103.92, 18.75], [-104.99, 19.32], [-105.49, 19.95], [-105.73, 20.43], [-105.4, 20.53], [-105.5, 20.82], [-105.27, 21.08], [-105.27, 21.42], [-105.6, 21.87], [-105.69, 22.27], [-106.03, 22.77], [-106.91, 23.77], [-107.92, 24.55], [-108.4, 25.17], [-109.26, 25.58], [-109.44, 25.82], [-109.29, 26.44], [-109.8, 26.68], [-110.39, 27.16], [-110.64, 27.86], [-111.18, 27.94], [-111.76, 28.47], [-112.23, 28.95], [-112.27, 29.27], [-112.81, 30.02], [-113.16, 30.79], [-113.15, 31.17], [-113.87, 31.57], [-114.21, 31.52], [-114.78, 31.8], [-114.94, 31.39], [-114.77, 30.91], [-114.67, 30.16], [-114.33, 29.75], [-113.59, 29.06], [-113.42, 28.83], [-113.27, 28.75], [-113.14, 28.41], [-112.96, 28.43], [-112.76, 27.78], [-112.46, 27.53], [-112.24, 27.17], [-111.62, 26.66], [-111.28, 25.73], [-110.99, 25.29], [-110.71, 24.83], [-110.66, 24.3], [-110.17, 24.27], [-109.77, 23.81], [-109.41, 23.36], [-109.43, 23.19], [-109.85, 22.82], [-110.03, 22.82], [-110.3, 23.43], [-110.95, 24], [-111.67, 24.48], [-112.18, 24.74], [-112.15, 25.47], [-112.3, 26.01], [-112.78, 26.32], [-113.46, 26.77], [-113.6, 26.64], [-113.85, 26.9], [-114.47, 27.14], [-115.06, 27.72], [-114.98, 27.8], [-114.57, 27.74], [-114.2, 28.12], [-114.16, 28.57], [-114.93, 29.28], [-115.52, 29.56], [-115.89, 30.18], [-116.26, 30.84], [-116.72, 31.64], [-117.13, 32.54]]]], "mainOnly": true },
    { "iso": "md", "name": "Moldova", "polygons": [[[[26.62, 48.22], [26.86, 48.37], [27.52, 48.47], [28.26, 48.16], [28.67, 48.12], [29.12, 47.85], [29.05, 47.51], [29.42, 47.35], [29.56, 46.93], [29.91, 46.67], [29.84, 46.53], [30.02, 46.42], [29.76, 46.35], [29.17, 46.38], [29.07, 46.52], [28.86, 46.44], [28.93, 46.26], [28.66, 45.94], [28.49, 45.6], [28.23, 45.49], [28.05, 45.94], [28.16, 46.37], [28.13, 46.81], [27.55, 47.41], [27.23, 47.83], [26.92, 48.12], [26.62, 48.22]]]], "mainOnly": true },
    { "iso": "mn", "name": "Mongolia", "polygons": [[[[87.75, 49.3], [88.81, 49.47], [90.71, 50.33], [92.23, 50.8], [93.1, 50.5], [94.15, 50.48], [94.82, 50.01], [95.81, 49.98], [97.26, 49.73], [98.23, 50.42], [97.83, 51.01], [98.86, 52.05], [99.98, 51.63], [100.89, 51.52], [102.07, 51.26], [102.26, 50.51], [103.68, 50.09], [104.62, 50.28], [105.89, 50.41], [106.89, 50.27], [107.87, 49.79], [108.48, 49.28], [109.4, 49.29], [110.66, 49.13], [111.58, 49.38], [112.9, 49.54], [114.36, 50.25], [114.96, 50.14], [115.49, 49.81], [116.68, 49.89], [116.19, 49.13], [115.49, 48.14], [115.74, 47.73], [116.31, 47.85], [117.3, 47.7], [118.06, 48.07], [118.87, 47.75], [119.77, 47.05], [119.66, 46.69], [118.87, 46.81], [117.42, 46.67], [116.72, 46.39], [115.99, 45.73], [114.46, 45.34], [113.46, 44.81], [112.44, 45.01], [111.87, 45.1], [111.35, 44.46], [111.67, 44.07], [111.83, 43.74], [111.13, 43.41], [110.41, 42.87], [109.24, 42.52], [107.74, 42.48], [106.13, 42.13], [104.96, 41.6], [104.52, 41.91], [103.31, 41.91], [101.83, 42.51], [100.85, 42.66], [99.52, 42.52], [97.45, 42.75], [96.35, 42.73], [95.76, 43.32], [95.31, 44.24], [94.69, 44.35], [93.48, 44.98], [92.13, 45.12], [90.95, 45.29], [90.59, 45.72], [90.97, 46.89], [90.28, 47.69], [88.85, 48.07], [88.01, 48.6], [87.75, 49.3]]]], "mainOnly": true },
    { "iso": "me", "name": "Montenegro", "polygons": [[[[20.07, 42.59], [19.8, 42.5], [19.74, 42.69], [19.3, 42.2], [19.37, 41.88], [19.16, 41.96], [18.88, 42.28], [18.45, 42.48], [18.56, 42.65], [18.71, 43.2], [19.03, 43.43], [19.22, 43.52], [19.48, 43.35], [19.63, 43.21], [19.96, 43.11], [20.34, 42.9], [20.26, 42.81], [20.07, 42.59]]]], "mainOnly": true },
    { "iso": "ma", "name": "Morocco", "polygons": [[[[-2.17, 35.17], [-1.79, 34.53], [-1.73, 33.92], [-1.39, 32.86], [-1.12, 32.65], [-1.31, 32.26], [-2.62, 32.09], [-3.07, 31.72], [-3.65, 31.64], [-3.69, 30.9], [-4.86, 30.5], [-5.24, 30], [-6.06, 29.73], [-7.06, 29.58], [-8.67, 28.84], [-8.67, 27.66], [-8.82, 27.66], [-8.79, 27.12], [-9.41, 27.09], [-9.74, 26.86], [-10.19, 26.86], [-10.55, 26.99], [-11.39, 26.88], [-11.72, 26.1], [-12.03, 26.03], [-12.5, 24.77], [-13.89, 23.69], [-14.22, 22.31], [-14.63, 21.86], [-14.75, 21.5], [-17, 21.42], [-17.02, 21.42], [-16.97, 21.89], [-16.59, 22.16], [-16.26, 22.68], [-16.33, 23.02], [-15.98, 23.72], [-15.43, 24.36], [-15.09, 24.52], [-14.82, 25.1], [-14.8, 25.64], [-14.44, 26.25], [-13.77, 26.62], [-13.14, 27.64], [-13.12, 27.65], [-12.62, 28.04], [-11.69, 28.15], [-10.9, 28.83], [-10.4, 29.1], [-9.56, 29.93], [-9.81, 31.18], [-9.43, 32.04], [-9.3, 32.56], [-8.66, 33.24], [-7.65, 33.7], [-6.91, 34.11], [-6.24, 35.15], [-5.93, 35.76], [-5.19, 35.76], [-4.59, 35.33], [-3.64, 35.4], [-2.6, 35.18], [-2.17, 35.17]]]], "mainOnly": true },
    { "iso": "mz", "name": "Mozambique", "polygons": [[[[34.56, -11.52], [35.31, -11.44], [36.51, -11.72], [36.78, -11.59], [37.47, -11.57], [37.83, -11.27], [38.43, -11.29], [39.52, -10.9], [40.32, -10.32], [40.48, -10.77], [40.44, -11.76], [40.56, -12.64], [40.6, -14.2], [40.78, -14.69], [40.48, -15.41], [40.09, -16.1], [39.45, -16.72], [38.54, -17.1], [37.41, -17.59], [36.28, -18.66], [35.9, -18.84], [35.2, -19.55], [34.79, -19.78], [34.7, -20.5], [35.18, -21.25], [35.37, -21.84], [35.39, -22.14], [35.56, -22.09], [35.53, -23.07], [35.37, -23.54], [35.61, -23.71], [35.46, -24.12], [35.04, -24.48], [34.22, -24.82], [33.01, -25.36], [32.57, -25.73], [32.66, -26.15], [32.92, -26.22], [32.83, -26.74], [32.07, -26.73], [31.99, -26.29], [31.84, -25.84], [31.75, -25.48], [31.93, -24.37], [31.67, -23.66], [31.19, -22.25], [32.24, -21.12], [32.51, -20.4], [32.66, -20.3], [32.77, -19.72], [32.61, -19.42], [32.65, -18.67], [32.85, -17.98], [32.85, -16.71], [32.33, -16.39], [31.85, -16.32], [31.64, -16.07], [31.17, -15.86], [30.34, -15.88], [30.27, -15.51], [30.18, -14.8], [33.21, -13.97], [33.79, -14.45], [34.06, -14.36], [34.46, -14.61], [34.52, -15.01], [34.31, -15.48], [34.38, -16.18], [35.03, -16.8], [35.34, -16.11], [35.77, -15.9], [35.69, -14.61], [35.27, -13.89], [34.91, -13.57], [34.56, -13.58], [34.28, -12.28], [34.56, -11.52]]]], "mainOnly": true },
    { "iso": "mm", "name": "Myanmar", "polygons": [[[[100.12, 20.42], [99.54, 20.19], [98.96, 19.75], [98.25, 19.71], [97.8, 18.63], [97.38, 18.45], [97.86, 17.57], [98.49, 16.84], [98.9, 16.18], [98.54, 15.31], [98.19, 15.12], [98.43, 14.62], [99.1, 13.83], [99.21, 13.27], [99.2, 12.8], [99.59, 11.89], [99.04, 10.96], [98.55, 9.93], [98.46, 10.68], [98.76, 11.44], [98.43, 12.03], [98.51, 13.12], [98.1, 13.64], [97.78, 14.84], [97.6, 16.1], [97.16, 16.93], [96.51, 16.43], [95.37, 15.71], [94.81, 15.8], [94.19, 16.04], [94.53, 17.28], [94.32, 18.21], [93.54, 19.37], [93.66, 19.73], [93.08, 19.86], [92.37, 20.67], [92.3, 21.48], [92.65, 21.32], [92.67, 22.04], [93.17, 22.28], [93.06, 22.7], [93.29, 23.04], [93.33, 24.08], [94.11, 23.85], [94.55, 24.68], [94.6, 25.16], [95.16, 26], [95.12, 26.57], [96.42, 27.26], [97.13, 27.08], [97.05, 27.7], [97.4, 27.88], [97.33, 28.26], [97.91, 28.34], [98.25, 27.75], [98.68, 27.51], [98.71, 26.74], [98.67, 25.92], [97.72, 25.08], [97.6, 23.9], [98.66, 24.06], [98.9, 23.14], [99.53, 22.95], [99.24, 22.12], [99.98, 21.74], [100.42, 21.56], [101.15, 21.85], [101.18, 21.44], [100.33, 20.79], [100.12, 20.42]]]], "mainOnly": true },
    { "iso": "na", "name": "Namibia", "polygons": [[[[19.9, -24.77], [19.89, -28.46], [19, -28.97], [18.46, -29.05], [17.84, -28.86], [17.39, -28.78], [17.22, -28.36], [16.82, -28.08], [16.34, -28.58], [15.6, -27.82], [15.21, -27.09], [14.99, -26.12], [14.74, -25.39], [14.41, -23.85], [14.39, -22.66], [14.26, -22.11], [13.87, -21.7], [13.35, -20.87], [12.83, -19.67], [12.61, -19.05], [11.79, -18.07], [11.73, -17.3], [12.22, -17.11], [12.81, -16.94], [13.46, -16.97], [14.06, -17.42], [14.21, -17.35], [18.26, -17.31], [18.96, -17.79], [21.38, -17.93], [23.22, -17.52], [24.03, -17.3], [24.68, -17.35], [25.08, -17.58], [25.08, -17.66], [24.52, -17.89], [24.22, -17.89], [23.58, -18.28], [23.2, -17.87], [21.66, -18.22], [20.91, -18.25], [20.88, -21.81], [19.9, -21.85], [19.9, -24.77]]]], "mainOnly": true },
    { "iso": "np", "name": "Nepal", "polygons": [[[[88.12, 27.88], [88.04, 27.45], [88.17, 26.81], [88.06, 26.41], [87.23, 26.4], [86.02, 26.63], [85.25, 26.73], [84.68, 27.23], [83.3, 27.36], [82, 27.93], [81.06, 28.42], [80.09, 28.79], [80.48, 29.73], [81.11, 30.18], [81.53, 30.42], [82.33, 30.12], [83.34, 29.46], [83.9, 29.32], [84.23, 28.84], [85.01, 28.64], [85.82, 28.2], [86.95, 27.97], [88.12, 27.88]]]], "mainOnly": true },
    { "iso": "nl", "name": "Netherlands", "polygons": [[[[6.91, 53.48], [7.09, 53.14], [6.84, 52.23], [6.59, 51.85], [5.99, 51.85], [6.16, 50.8], [5.61, 51.04], [4.97, 51.48], [4.05, 51.27], [3.31, 51.35], [3.32, 51.35], [3.83, 51.62], [4.71, 53.09], [6.07, 53.51], [6.91, 53.48]]]], "mainOnly": true },
    { "iso": "nc", "name": "New Caledonia", "polygons": [[[[165.78, -21.08], [166.6, -21.7], [167.12, -22.16], [166.74, -22.4], [166.19, -22.13], [165.47, -21.68], [164.83, -21.15], [164.17, -20.44], [164.03, -20.11], [164.46, -20.12], [165.02, -20.46], [165.46, -20.8], [165.78, -21.08]]]], "mainOnly": true },
    { "iso": "nz", "name": "New Zealand", "polygons": [[[[176.89, -40.07], [176.51, -40.6], [176.01, -41.29], [175.24, -41.69], [175.07, -41.43], [174.65, -41.28], [175.23, -40.46], [174.9, -39.91], [173.82, -39.51], [173.85, -39.15], [174.57, -38.8], [174.74, -38.03], [174.7, -37.38], [174.29, -36.71], [174.32, -36.53], [173.84, -36.12], [173.05, -35.24], [172.64, -34.53], [173.01, -34.45], [173.55, -35.01], [174.33, -35.27], [174.61, -36.16], [175.34, -37.21], [175.36, -36.53], [175.81, -36.8], [175.96, -37.56], [176.76, -37.88], [177.44, -37.96], [178.01, -37.58], [178.52, -37.7], [178.27, -38.58], [177.97, -39.17], [177.21, -39.15], [176.94, -39.45], [177.03, -39.88], [176.89, -40.07]]], [[[169.67, -43.56], [170.52, -43.03], [171.13, -42.51], [171.57, -41.77], [171.95, -41.51], [172.1, -40.96], [172.8, -40.49], [173.02, -40.92], [173.25, -41.33], [173.96, -40.93], [174.25, -41.35], [174.25, -41.77], [173.88, -42.23], [173.22, -42.97], [172.71, -43.37], [173.08, -43.85], [172.31, -43.87], [171.45, -44.24], [171.19, -44.9], [170.62, -45.91], [169.83, -46.36], [169.33, -46.64], [168.41, -46.62], [167.76, -46.29], [166.68, -46.22], [166.51, -45.85], [167.05, -45.11], [168.3, -44.12], [168.95, -43.94], [169.67, -43.56]]]], "mainOnly": true },
    { "iso": "ni", "name": "Nicaragua", "polygons": [[[[-83.66, 10.94], [-83.9, 10.73], [-84.19, 10.79], [-84.36, 11], [-84.67, 11.08], [-84.9, 10.95], [-85.56, 11.22], [-85.71, 11.09], [-86.06, 11.4], [-86.53, 11.81], [-86.75, 12.14], [-87.17, 12.46], [-87.67, 12.91], [-87.56, 13.06], [-87.39, 12.91], [-87.32, 12.98], [-87.01, 13.03], [-86.88, 13.25], [-86.73, 13.26], [-86.76, 13.75], [-86.52, 13.78], [-86.31, 13.77], [-86.1, 14.04], [-85.8, 13.84], [-85.7, 13.96], [-85.51, 14.08], [-85.17, 14.35], [-85.15, 14.56], [-85.05, 14.55], [-84.92, 14.79], [-84.82, 14.82], [-84.65, 14.67], [-84.45, 14.62], [-84.23, 14.75], [-83.98, 14.75], [-83.63, 14.88], [-83.49, 15.02], [-83.15, 15], [-83.23, 14.9], [-83.28, 14.68], [-83.18, 14.31], [-83.41, 13.97], [-83.52, 13.57], [-83.55, 13.13], [-83.5, 12.87], [-83.47, 12.42], [-83.63, 12.32], [-83.72, 11.89], [-83.65, 11.63], [-83.86, 11.37], [-83.81, 11.1], [-83.66, 10.94]]]], "mainOnly": true },
    { "iso": "ne", "name": "Niger", "polygons": [[[[14.85, 22.86], [15.1, 21.31], [15.47, 21.05], [15.49, 20.73], [15.9, 20.39], [15.69, 19.96], [15.3, 17.93], [15.25, 16.63], [13.97, 15.68], [13.54, 14.37], [13.96, 14], [13.95, 13.35], [14.6, 13.33], [14.5, 12.86], [14.21, 12.8], [14.18, 12.48], [14, 12.46], [13.32, 13.56], [13.08, 13.6], [12.3, 13.04], [11.53, 13.33], [10.99, 13.39], [10.7, 13.25], [10.11, 13.28], [9.52, 12.85], [9.01, 12.83], [7.8, 13.34], [7.33, 13.1], [6.82, 13.12], [6.45, 13.49], [5.44, 13.87], [4.37, 13.75], [4.11, 13.53], [3.97, 12.96], [3.68, 12.55], [3.61, 11.66], [2.85, 12.24], [2.49, 12.23], [2.15, 11.94], [2.18, 12.63], [1.02, 12.85], [0.99, 13.34], [0.43, 13.99], [0.3, 14.44], [0.37, 14.93], [1.02, 14.97], [1.39, 15.32], [2.75, 15.41], [3.64, 15.57], [3.72, 16.18], [4.27, 16.85], [4.27, 19.16], [5.68, 19.6], [8.57, 21.57], [12, 23.47], [13.58, 23.04], [14.14, 22.49], [14.85, 22.86]]]], "mainOnly": true },
    { "iso": "ng", "name": "Nigeria", "polygons": [[[[2.69, 6.26], [2.75, 7.87], [2.72, 8.51], [2.91, 9.14], [3.22, 9.44], [3.71, 10.06], [3.6, 10.33], [3.8, 10.73], [3.57, 11.33], [3.61, 11.66], [3.68, 12.55], [3.97, 12.96], [4.11, 13.53], [4.37, 13.75], [5.44, 13.87], [6.45, 13.49], [6.82, 13.12], [7.33, 13.1], [7.8, 13.34], [9.01, 12.83], [9.52, 12.85], [10.11, 13.28], [10.7, 13.25], [10.99, 13.39], [11.53, 13.33], [12.3, 13.04], [13.08, 13.6], [13.32, 13.56], [14, 12.46], [14.18, 12.48], [14.58, 12.09], [14.47, 11.9], [14.42, 11.57], [13.57, 10.8], [13.31, 10.16], [13.17, 9.64], [12.96, 9.42], [12.75, 8.72], [12.22, 8.31], [12.06, 7.8], [11.84, 7.4], [11.75, 6.98], [11.06, 6.64], [10.5, 7.06], [10.12, 7.04], [9.52, 6.45], [9.23, 6.44], [8.76, 5.48], [8.5, 4.77], [7.46, 4.41], [7.08, 4.46], [6.7, 4.24], [5.9, 4.26], [5.36, 4.89], [5.03, 5.61], [4.33, 6.27], [3.57, 6.26], [2.69, 6.26]]]], "mainOnly": true },
    { "iso": "kp", "name": "North Korea", "polygons": [[[[130.64, 42.4], [130.78, 42.22], [130.4, 42.28], [129.97, 41.94], [129.67, 41.6], [129.71, 40.88], [129.19, 40.66], [129.01, 40.49], [128.63, 40.19], [127.97, 40.03], [127.53, 39.76], [127.5, 39.32], [127.39, 39.21], [127.78, 39.05], [128.35, 38.61], [128.21, 38.37], [127.78, 38.3], [127.07, 38.26], [126.68, 37.8], [126.24, 37.84], [126.17, 37.75], [125.69, 37.94], [125.57, 37.75], [125.28, 37.67], [125.24, 37.86], [124.98, 37.95], [124.71, 38.11], [124.99, 38.55], [125.22, 38.67], [125.13, 38.85], [125.39, 39.39], [125.32, 39.55], [124.74, 39.66], [124.27, 39.93], [125.08, 40.57], [126.18, 41.11], [126.87, 41.82], [127.34, 41.5], [128.21, 41.47], [128.05, 41.99], [129.6, 42.42], [129.99, 42.99], [130.64, 42.4]]]], "mainOnly": true },
    { "iso": "mk", "name": "North Macedonia", "polygons": [[[[22.38, 42.32], [22.88, 42], [22.95, 41.34], [22.76, 41.3], [22.6, 41.13], [22.06, 41.15], [21.67, 40.93], [21.02, 40.84], [20.61, 41.09], [20.46, 41.52], [20.59, 41.86], [20.72, 41.85], [20.76, 42.05], [21.35, 42.21], [21.58, 42.25], [21.92, 42.3], [22.38, 42.32]]]], "mainOnly": true },
    { "iso": "no", "name": "Norway", "polygons": [[[[31.1, 69.56], [29.4, 69.16], [28.59, 69.06], [29.02, 69.77], [27.73, 70.16], [26.18, 69.83], [25.69, 69.09], [24.74, 68.65], [23.66, 68.89], [22.36, 68.84], [21.24, 69.37], [20.65, 69.11], [20.03, 69.07], [19.88, 68.41], [17.99, 68.57], [17.73, 68.01], [16.77, 68.01], [16.11, 67.3], [15.11, 66.19], [13.56, 64.79], [13.92, 64.45], [13.57, 64.05], [12.58, 64.07], [11.93, 63.13], [11.99, 61.8], [12.63, 61.29], [12.3, 60.12], [11.47, 59.43], [11.03, 58.86], [10.36, 59.47], [8.38, 58.31], [7.05, 58.08], [5.67, 58.59], [5.31, 59.66], [4.99, 61.97], [5.91, 62.61], [8.55, 63.45], [10.53, 64.49], [12.36, 65.88], [14.76, 67.81], [16.44, 68.56], [19.18, 69.82], [21.38, 70.26], [23.02, 70.2], [24.55, 71.03], [26.37, 70.99], [28.17, 71.19], [31.29, 70.45], [30.01, 70.19], [31.1, 69.56]]]], "mainOnly": true },
    { "iso": "om", "name": "Oman", "polygons": [[[[55.21, 22.71], [55.23, 23.11], [55.53, 23.52], [55.53, 23.93], [55.98, 24.13], [55.8, 24.27], [55.89, 24.92], [56.4, 24.92], [56.85, 24.24], [57.4, 23.88], [58.14, 23.75], [58.73, 23.57], [59.18, 22.99], [59.45, 22.66], [59.81, 22.53], [59.81, 22.31], [59.44, 21.71], [59.28, 21.43], [58.86, 21.11], [58.49, 20.43], [58.03, 20.48], [57.83, 20.24], [57.67, 19.74], [57.79, 19.07], [57.69, 18.94], [57.23, 18.95], [56.61, 18.57], [56.51, 18.09], [56.28, 17.88], [55.66, 17.88], [55.27, 17.63], [55.27, 17.23], [54.79, 16.95], [54.24, 17.04], [53.57, 16.71], [53.11, 16.65], [52.78, 17.35], [52, 19], [55, 20], [55.67, 22], [55.21, 22.71]]], [[[56.26, 25.71], [56.07, 26.06], [56.36, 26.4], [56.49, 26.31], [56.39, 25.9], [56.26, 25.71]]]], "mainOnly": true },
    { "iso": "pk", "name": "Pakistan", "polygons": [[[[77.84, 35.49], [76.87, 34.65], [75.76, 34.5], [74.24, 34.75], [73.75, 34.32], [74.1, 33.44], [74.45, 32.76], [75.26, 32.27], [74.41, 31.69], [74.42, 30.98], [73.45, 29.98], [72.82, 28.96], [71.78, 27.91], [70.62, 27.99], [69.51, 26.94], [70.17, 26.49], [70.28, 25.72], [70.84, 25.22], [71.04, 24.36], [68.84, 24.36], [68.18, 23.69], [67.44, 23.94], [67.15, 24.66], [66.37, 25.43], [64.53, 25.24], [62.91, 25.22], [61.5, 25.08], [61.87, 26.24], [63.32, 26.76], [63.23, 27.22], [62.76, 27.38], [62.73, 28.26], [61.77, 28.7], [61.37, 29.3], [60.87, 29.83], [62.55, 29.32], [63.55, 29.47], [64.15, 29.34], [64.35, 29.56], [65.05, 29.47], [66.35, 29.89], [66.38, 30.74], [66.94, 31.3], [67.68, 31.3], [67.79, 31.58], [68.56, 31.71], [68.93, 31.62], [69.32, 31.9], [69.26, 32.5], [69.69, 33.11], [70.32, 33.36], [69.93, 34.02], [70.88, 33.99], [71.16, 34.35], [71.12, 34.73], [71.61, 35.15], [71.5, 35.65], [71.26, 36.07], [71.85, 36.51], [72.92, 36.72], [74.07, 36.84], [74.58, 37.02], [75.16, 37.13], [75.9, 36.67], [76.19, 35.9], [77.84, 35.49]]]], "mainOnly": true },
    { "iso": "ps", "name": "Palestine", "polygons": [[[[35.4, 31.49], [34.93, 31.35], [34.97, 31.62], [35.23, 31.75], [34.97, 31.87], [35.18, 32.53], [35.55, 32.39], [35.55, 31.78], [35.4, 31.49]]]], "mainOnly": true },
    { "iso": "pa", "name": "Panama", "polygons": [[[[-77.35, 8.67], [-77.47, 8.52], [-77.24, 7.94], [-77.43, 7.64], [-77.75, 7.71], [-77.88, 7.22], [-78.21, 7.51], [-78.43, 8.05], [-78.18, 8.32], [-78.44, 8.39], [-78.62, 8.72], [-79.12, 9], [-79.56, 8.93], [-79.76, 8.58], [-80.16, 8.33], [-80.38, 8.3], [-80.48, 8.09], [-80, 7.55], [-80.28, 7.42], [-80.42, 7.27], [-80.89, 7.22], [-81.06, 7.82], [-81.19, 7.65], [-81.52, 7.71], [-81.72, 8.11], [-82.13, 8.18], [-82.39, 8.29], [-82.82, 8.29], [-82.85, 8.07], [-82.97, 8.23], [-82.91, 8.42], [-82.83, 8.63], [-82.87, 8.81], [-82.72, 8.93], [-82.93, 9.07], [-82.93, 9.48], [-82.55, 9.57], [-82.19, 9.21], [-82.21, 9], [-81.81, 8.95], [-81.71, 9.03], [-81.44, 8.79], [-80.95, 8.86], [-80.52, 9.11], [-79.91, 9.31], [-79.57, 9.61], [-79.02, 9.55], [-79.06, 9.45], [-78.5, 9.42], [-78.06, 9.25], [-77.73, 8.95], [-77.35, 8.67]]]], "mainOnly": true },
    { "iso": "pg", "name": "Papua New Guinea", "polygons": [[[[141, -2.6], [142.74, -3.29], [144.58, -3.86], [145.27, -4.37], [145.83, -4.88], [145.98, -5.47], [147.65, -6.08], [147.89, -6.61], [146.97, -6.72], [147.19, -7.39], [148.08, -8.04], [148.73, -9.1], [149.31, -9.07], [149.27, -9.51], [150.04, -9.68], [149.74, -9.87], [150.8, -10.29], [150.69, -10.58], [150.03, -10.65], [149.78, -10.39], [148.92, -10.28], [147.91, -10.13], [147.14, -9.49], [146.57, -8.94], [146.05, -8.07], [144.74, -7.63], [143.9, -7.92], [143.29, -8.25], [143.41, -8.98], [142.63, -9.33], [142.07, -9.16], [141.03, -9.12], [141.02, -5.86], [141, -2.6]]], [[[152.64, -3.66], [153.02, -3.98], [153.14, -4.5], [152.83, -4.77], [152.64, -4.18], [152.41, -3.79], [151.95, -3.46], [151.38, -3.04], [150.66, -2.74], [150.94, -2.5], [151.48, -2.78], [151.82, -3], [152.24, -3.24], [152.64, -3.66]]], [[[151.3, -5.84], [150.75, -6.08], [150.24, -6.32], [149.71, -6.32], [148.89, -6.03], [148.32, -5.75], [148.4, -5.44], [149.3, -5.58], [149.85, -5.51], [150, -5.03], [150.14, -5], [150.24, -5.53], [150.81, -5.46], [151.09, -5.11], [151.65, -4.76], [151.54, -4.17], [152.14, -4.15], [152.34, -4.31], [152.32, -4.87], [151.98, -5.48], [151.46, -5.56], [151.3, -5.84]]], [[[154.76, -5.34], [155.06, -5.57], [155.55, -6.2], [156.02, -6.54], [155.88, -6.82], [155.6, -6.92], [155.17, -6.54], [154.73, -5.9], [154.51, -5.14], [154.65, -5.04], [154.76, -5.34]]]], "mainOnly": true },
    { "iso": "py", "name": "Paraguay", "polygons": [[[[-58.17, -20.18], [-57.87, -20.73], [-57.94, -22.09], [-56.88, -22.28], [-56.47, -22.09], [-55.8, -22.36], [-55.61, -22.66], [-55.52, -23.57], [-55.4, -23.96], [-55.03, -24], [-54.65, -23.84], [-54.29, -24.02], [-54.29, -24.57], [-54.43, -25.16], [-54.63, -25.74], [-54.79, -26.62], [-55.7, -27.39], [-56.49, -27.55], [-57.61, -27.4], [-58.62, -27.12], [-57.63, -25.6], [-57.78, -25.16], [-58.81, -24.77], [-60.03, -24.03], [-60.85, -23.88], [-62.69, -22.25], [-62.29, -21.05], [-62.27, -20.51], [-61.79, -19.63], [-60.04, -19.34], [-59.12, -19.36], [-58.18, -19.87], [-58.17, -20.18]]]], "mainOnly": true },
    { "iso": "pe", "name": "Peru", "polygons": [[[[-69.89, -4.3], [-70.79, -4.25], [-70.93, -4.4], [-71.75, -4.59], [-72.89, -5.27], [-72.96, -5.74], [-73.22, -6.09], [-73.12, -6.63], [-73.72, -6.92], [-73.72, -7.34], [-73.99, -7.52], [-73.57, -8.42], [-73.02, -9.03], [-73.23, -9.46], [-72.56, -9.52], [-72.18, -10.05], [-71.3, -10.08], [-70.48, -9.49], [-70.55, -11.01], [-70.09, -11.12], [-69.53, -10.95], [-68.67, -12.56], [-68.88, -12.9], [-68.93, -13.6], [-68.95, -14.45], [-69.34, -14.95], [-69.16, -15.32], [-69.39, -15.66], [-68.96, -16.5], [-69.59, -17.58], [-69.86, -18.09], [-70.37, -18.35], [-71.38, -17.77], [-71.46, -17.36], [-73.44, -16.36], [-75.24, -15.27], [-76.01, -14.65], [-76.42, -13.82], [-76.26, -13.54], [-77.11, -12.22], [-78.09, -10.38], [-79.04, -8.39], [-79.45, -7.93], [-79.76, -7.19], [-80.54, -6.54], [-81.25, -6.14], [-80.93, -5.69], [-81.41, -4.74], [-81.1, -4.04], [-80.3, -3.4], [-80.18, -3.82], [-80.47, -4.06], [-80.44, -4.43], [-80.03, -4.35], [-79.62, -4.45], [-79.21, -4.96], [-78.64, -4.55], [-78.45, -3.87], [-77.84, -3], [-76.64, -2.61], [-75.54, -1.56], [-75.23, -0.91], [-75.37, -0.15], [-75.11, -0.06], [-74.44, -0.53], [-74.12, -1], [-73.66, -1.26], [-73.07, -2.31], [-72.33, -2.43], [-71.77, -2.17], [-71.41, -2.34], [-70.81, -2.26], [-70.05, -2.73], [-70.69, -3.74], [-70.39, -3.77], [-69.89, -4.3]]]], "mainOnly": true },
    { "iso": "ph", "name": "Philippines", "polygons": [[[[120.83, 12.7], [120.32, 13.47], [121.18, 13.43], [121.53, 13.07], [121.26, 12.21], [120.83, 12.7]]], [[[122.59, 9.98], [122.84, 10.26], [122.95, 10.88], [123.5, 10.94], [123.34, 10.27], [124.08, 11.23], [123.98, 10.28], [123.62, 9.95], [123.31, 9.32], [123, 9.02], [122.38, 9.71], [122.59, 9.98]]], [[[126.38, 8.41], [126.48, 7.75], [126.54, 7.19], [126.2, 6.27], [125.83, 7.29], [125.36, 6.79], [125.68, 6.05], [125.4, 5.58], [124.22, 6.16], [123.94, 6.89], [124.24, 7.36], [123.61, 7.83], [123.3, 7.42], [122.83, 7.46], [122.09, 6.9], [121.92, 7.19], [122.31, 8.03], [122.94, 8.32], [123.49, 8.69], [123.84, 8.24], [124.6, 8.51], [124.76, 8.96], [125.47, 8.99], [125.41, 9.76], [126.22, 9.29], [126.31, 8.78], [126.38, 8.41]]], [[[118.5, 9.32], [117.17, 8.37], [117.66, 9.07], [118.39, 9.68], [118.99, 10.38], [119.51, 11.37], [119.69, 10.55], [119.03, 10], [118.5, 9.32]]], [[[122.34, 18.22], [122.17, 17.81], [122.52, 17.09], [122.25, 16.26], [121.66, 15.93], [121.51, 15.12], [121.73, 14.33], [122.26, 14.22], [122.7, 14.34], [123.95, 13.78], [123.86, 13.24], [124.18, 13], [124.08, 12.54], [123.3, 13.03], [122.93, 13.55], [122.67, 13.19], [122.03, 13.78], [121.13, 13.64], [120.63, 13.86], [120.68, 14.27], [120.99, 14.53], [120.69, 14.76], [120.56, 14.4], [120.07, 14.97], [119.92, 15.41], [119.88, 16.36], [120.29, 16.03], [120.39, 17.6], [120.72, 18.51], [121.32, 18.5], [121.94, 18.22], [122.25, 18.48], [122.34, 18.22]]], [[[122.04, 11.42], [121.88, 11.89], [122.48, 11.58], [123.12, 11.58], [123.1, 11.17], [122.64, 10.74], [122, 10.44], [121.97, 10.91], [122.04, 11.42]]], [[[125.5, 12.16], [125.78, 11.05], [125.01, 11.31], [125.03, 10.98], [125.28, 10.36], [124.8, 10.13], [124.76, 10.84], [124.46, 10.89], [124.3, 11.5], [124.89, 11.42], [124.88, 11.79], [124.27, 12.56], [125.23, 12.54], [125.5, 12.16]]]], "mainOnly": false },
    { "iso": "pl", "name": "Poland", "polygons": [[[[23.48, 53.91], [23.53, 53.47], [23.8, 53.09], [23.8, 52.69], [23.2, 52.49], [23.51, 52.02], [23.53, 51.58], [24.03, 50.71], [23.92, 50.42], [23.43, 50.31], [22.52, 49.48], [22.78, 49.03], [22.56, 49.09], [21.61, 49.47], [20.89, 49.33], [20.42, 49.43], [19.83, 49.22], [19.32, 49.57], [18.91, 49.44], [18.85, 49.5], [18.39, 49.99], [17.65, 50.05], [17.55, 50.36], [16.87, 50.47], [16.72, 50.22], [16.18, 50.42], [16.24, 50.7], [15.49, 50.78], [15.02, 51.11], [14.61, 51.75], [14.69, 52.09], [14.44, 52.62], [14.07, 52.98], [14.35, 53.25], [14.12, 53.76], [14.8, 54.05], [16.36, 54.51], [17.62, 54.85], [18.62, 54.68], [18.7, 54.44], [19.66, 54.43], [20.89, 54.31], [22.73, 54.33], [23.24, 54.22], [23.48, 53.91]]]], "mainOnly": true },
    { "iso": "pt", "name": "Portugal", "polygons": [[[[-9.03, 41.88], [-8.67, 42.13], [-8.26, 42.28], [-8.01, 41.79], [-7.42, 41.79], [-7.25, 41.92], [-6.67, 41.88], [-6.39, 41.38], [-6.85, 41.11], [-6.86, 40.33], [-7.03, 40.18], [-7.07, 39.71], [-7.5, 39.63], [-7.1, 39.03], [-7.37, 38.37], [-7.03, 38.08], [-7.17, 37.8], [-7.54, 37.43], [-7.45, 37.1], [-7.86, 36.84], [-8.38, 36.98], [-8.9, 36.87], [-8.75, 37.65], [-8.84, 38.27], [-9.29, 38.36], [-9.53, 38.74], [-9.45, 39.39], [-9.05, 39.76], [-8.98, 40.16], [-8.77, 40.76], [-8.79, 41.18], [-8.99, 41.54], [-9.03, 41.88]]]], "mainOnly": true },
    { "iso": "pr", "name": "Puerto Rico", "polygons": [[[[-66.28, 18.51], [-65.77, 18.43], [-65.59, 18.23], [-65.85, 17.98], [-66.6, 17.98], [-67.18, 17.95], [-67.24, 18.37], [-67.1, 18.52], [-66.28, 18.51]]]], "mainOnly": true },
    { "iso": "qa", "name": "Qatar", "polygons": [[[[50.81, 24.75], [50.74, 25.48], [51.01, 26.01], [51.29, 26.11], [51.59, 25.8], [51.61, 25.22], [51.39, 24.63], [51.11, 24.56], [50.81, 24.75]]]], "mainOnly": true },
    { "iso": "rs", "name": "Republic of Serbia", "polygons": [[[[18.83, 45.91], [19.6, 46.17], [20.22, 46.13], [20.76, 45.73], [20.87, 45.42], [21.48, 45.18], [21.56, 44.77], [22.15, 44.48], [22.46, 44.7], [22.71, 44.58], [22.47, 44.41], [22.66, 44.23], [22.41, 44.01], [22.5, 43.64], [22.99, 43.21], [22.6, 42.9], [22.44, 42.58], [22.55, 42.46], [22.38, 42.32], [21.92, 42.3], [21.58, 42.25], [21.54, 42.32], [21.66, 42.44], [21.78, 42.68], [21.63, 42.68], [21.44, 42.86], [21.27, 42.91], [21.14, 43.07], [20.96, 43.13], [20.81, 43.27], [20.64, 43.22], [20.5, 42.88], [20.26, 42.81], [20.34, 42.9], [19.96, 43.11], [19.63, 43.21], [19.48, 43.35], [19.22, 43.52], [19.45, 43.57], [19.6, 44.04], [19.12, 44.42], [19.37, 44.86], [19.01, 44.86], [19.39, 45.24], [19.07, 45.52], [18.83, 45.91]]]], "mainOnly": true },
    { "iso": "cg", "name": "Republic of the Congo", "polygons": [[[[18.45, 3.5], [18.39, 2.9], [18.09, 2.37], [17.9, 1.74], [17.77, 0.86], [17.83, 0.29], [17.66, -0.06], [17.64, -0.42], [17.52, -0.74], [16.87, -1.23], [16.41, -1.74], [15.97, -2.71], [16.01, -3.54], [15.75, -3.86], [15.17, -4.34], [14.58, -4.97], [14.21, -4.79], [14.14, -4.51], [13.6, -4.5], [13.26, -4.88], [13, -4.78], [12.62, -4.44], [12.32, -4.61], [11.91, -5.04], [11.09, -3.98], [11.86, -3.43], [11.48, -2.77], [11.82, -2.51], [12.5, -2.39], [12.58, -1.95], [13.11, -2.43], [13.99, -2.47], [14.3, -2], [14.43, -1.33], [14.32, -0.55], [13.84, 0.04], [14.28, 1.2], [14.03, 1.4], [13.28, 1.31], [13, 1.83], [13.08, 2.27], [14.34, 2.23], [15.15, 1.96], [15.94, 1.73], [16.01, 2.27], [16.54, 3.2], [17.13, 3.73], [17.81, 3.56], [18.45, 3.5]]]], "mainOnly": true },
    { "iso": "ro", "name": "Romania", "polygons": [[[[28.23, 45.49], [28.68, 45.3], [29.15, 45.46], [29.6, 45.29], [29.63, 45.04], [29.14, 44.82], [28.84, 44.91], [28.56, 43.71], [27.97, 43.81], [27.24, 44.18], [26.07, 43.94], [25.57, 43.69], [24.1, 43.74], [23.33, 43.9], [22.94, 43.82], [22.66, 44.23], [22.47, 44.41], [22.71, 44.58], [22.46, 44.7], [22.15, 44.48], [21.56, 44.77], [21.48, 45.18], [20.87, 45.42], [20.76, 45.73], [20.22, 46.13], [21.02, 46.32], [21.63, 46.99], [22.1, 47.67], [22.71, 47.88], [23.14, 48.1], [23.76, 47.99], [24.4, 47.98], [24.87, 47.74], [25.21, 47.89], [25.95, 47.99], [26.2, 48.22], [26.62, 48.22], [26.92, 48.12], [27.23, 47.83], [27.55, 47.41], [28.13, 46.81], [28.16, 46.37], [28.05, 45.94], [28.23, 45.49]]]], "mainOnly": true },
    { "iso": "ru", "name": "Russia", "polygons": [[[[49.1, 46.4], [48.65, 45.81], [47.68, 45.64], [46.68, 44.61], [47.59, 43.66], [47.49, 42.99], [48.58, 41.81], [47.99, 41.41], [47.82, 41.15], [47.37, 41.22], [46.69, 41.83], [46.4, 41.86], [45.78, 42.09], [45.47, 42.5], [44.54, 42.71], [43.93, 42.55], [43.76, 42.74], [42.39, 43.22], [40.92, 43.38], [40.08, 43.55], [39.96, 43.43], [38.68, 44.28], [37.54, 44.66], [36.68, 45.24], [37.4, 45.4], [38.23, 46.24], [37.67, 46.64], [39.15, 47.04], [39.12, 47.26], [38.22, 47.1], [38.26, 47.55], [38.77, 47.83], [39.74, 47.9], [39.9, 48.23], [39.67, 48.78], [40.08, 49.31], [40.07, 49.6], [38.59, 49.93], [38.01, 49.92], [37.39, 50.38], [36.63, 50.23], [35.36, 50.58], [35.38, 50.77], [35.02, 51.21], [34.22, 51.26], [34.14, 51.57], [34.39, 51.77], [33.75, 52.34], [32.72, 52.24], [32.41, 52.29], [32.16, 52.06], [31.79, 52.1], [31.54, 52.74], [31.31, 53.07], [31.5, 53.17], [32.3, 53.13], [32.69, 53.35], [32.41, 53.62], [31.73, 53.79], [31.79, 53.97], [31.38, 54.16], [30.76, 54.81], [30.97, 55.08], [30.87, 55.55], [29.9, 55.79], [29.37, 55.67], [29.23, 55.92], [28.18, 56.17], [27.86, 56.76], [27.77, 57.24], [27.29, 57.47], [27.72, 57.79], [27.42, 58.72], [28.13, 59.3], [27.98, 59.48], [29.12, 60.03], [28.07, 60.5], [30.21, 61.78], [31.14, 62.36], [31.52, 62.87], [30.04, 63.55], [30.44, 64.2], [29.54, 64.95], [30.22, 65.81], [29.05, 66.94], [29.98, 67.7], [28.45, 68.36], [28.59, 69.06], [29.4, 69.16], [31.1, 69.56], [32.13, 69.91], [33.78, 69.3], [36.51, 69.06], [40.29, 67.93], [41.06, 67.46], [41.13, 66.79], [40.02, 66.27], [38.38, 66], [33.92, 66.76], [33.18, 66.63], [34.81, 65.9], [34.88, 65.44], [34.94, 64.41], [36.23, 64.11], [37.01, 63.85], [37.14, 64.33], [36.54, 64.76], [37.18, 65.14], [39.59, 64.52], [40.44, 64.76], [39.76, 65.5], [42.09, 66.48], [43.02, 66.42], [43.95, 66.07], [44.53, 66.76], [43.7, 67.35], [44.19, 67.95], [43.45, 68.57], [46.25, 68.25], [46.82, 67.69], [45.56, 67.57], [45.56, 67.01], [46.35, 66.67], [47.89, 66.88], [48.14, 67.52], [50.23, 68], [53.72, 68.86], [54.47, 68.81], [53.49, 68.2], [54.73, 68.1], [55.44, 68.44], [57.32, 68.47], [58.8, 68.88], [59.94, 68.28], [61.08, 68.94], [60.03, 69.52], [60.55, 69.85], [63.5, 69.55], [64.89, 69.23], [68.51, 68.09], [69.18, 68.62], [68.16, 69.14], [68.14, 69.36], [66.93, 69.45], [67.26, 69.93], [66.72, 70.71], [66.69, 71.03], [68.54, 71.93], [69.2, 72.84], [69.94, 73.04], [72.59, 72.78], [72.8, 72.22], [71.85, 71.41], [72.47, 71.09], [72.79, 70.39], [72.56, 69.02], [73.67, 68.41], [73.24, 67.74], [71.28, 66.32], [72.42, 66.17], [72.82, 66.53], [73.92, 66.79], [74.19, 67.28], [75.05, 67.76], [74.47, 68.33], [74.94, 68.99], [73.84, 69.07], [73.6, 69.63], [74.4, 70.63], [73.1, 71.45], [74.89, 72.12], [74.66, 72.83], [75.16, 72.85], [75.68, 72.3], [75.29, 71.34], [76.36, 71.15], [75.9, 71.87], [77.58, 72.27], [79.65, 72.32], [81.5, 71.75], [80.61, 72.58], [80.51, 73.65], [82.25, 73.85], [84.66, 73.81], [86.82, 73.94], [86.01, 74.46], [87.17, 75.12], [88.32, 75.14], [90.26, 75.64], [92.9, 75.77], [93.23, 76.05], [95.86, 76.14], [96.68, 75.92], [98.92, 76.45], [100.76, 76.43], [101.04, 76.86], [101.99, 77.29], [104.35, 77.7], [106.07, 77.37], [104.71, 77.13], [106.97, 76.97], [107.24, 76.48], [108.15, 76.72], [111.08, 76.71], [113.33, 76.22], [114.13, 75.85], [113.89, 75.33], [112.78, 75.03], [110.15, 74.48], [109.4, 74.18], [110.64, 74.04], [112.12, 73.79], [113.02, 73.98], [113.53, 73.34], [113.97, 73.59], [115.57, 73.75], [118.78, 73.59], [119.02, 73.12], [123.2, 72.97], [123.26, 73.74], [125.38, 73.56], [126.98, 73.57], [128.59, 73.04], [129.05, 72.4], [128.46, 71.98], [129.72, 71.19], [131.29, 70.79], [132.25, 71.84], [133.86, 71.39], [135.56, 71.66], [137.5, 71.35], [138.23, 71.63], [139.87, 71.49], [139.15, 72.42], [140.47, 72.85], [149.5, 72.2], [150.35, 71.61], [152.97, 70.84], [157.01, 71.03], [159, 70.87], [159.83, 70.45], [159.71, 69.72], [160.94, 69.44], [162.28, 69.64], [164.05, 69.67], [165.94, 69.47], [167.84, 69.58], [169.58, 68.69], [170.82, 69.01], [170.01, 69.65], [170.45, 70.1], [173.64, 69.82], [175.72, 69.88], [178.6, 69.4], [180, 68.96], [180, 64.98], [179.99, 64.97], [178.71, 64.53], [177.41, 64.61], [178.31, 64.08], [178.91, 63.25], [179.37, 62.98], [179.49, 62.57], [179.23, 62.3], [177.36, 62.52], [174.57, 61.77], [173.68, 61.65], [172.15, 60.95], [170.7, 60.34], [170.33, 59.88], [168.9, 60.57], [166.29, 59.79], [165.84, 60.16], [164.88, 59.73], [163.54, 59.87], [163.22, 59.21], [162.02, 58.24], [162.05, 57.84], [163.19, 57.62], [163.06, 56.16], [162.13, 56.12], [161.7, 55.29], [162.12, 54.86], [160.37, 54.34], [160.02, 53.2], [158.53, 52.96], [158.23, 51.94], [156.79, 51.01], [156.42, 51.7], [155.99, 53.16], [155.43, 55.38], [155.91, 56.77], [156.76, 57.36], [156.81, 57.83], [158.36, 58.06], [160.15, 59.31], [161.87, 60.34], [163.67, 61.14], [164.47, 62.55], [163.26, 62.47], [162.66, 61.64], [160.12, 60.54], [159.3, 61.77], [156.72, 61.43], [154.22, 59.76], [155.04, 59.14], [152.81, 58.88], [151.27, 58.78], [151.34, 59.5], [149.78, 59.66], [148.54, 59.16], [145.49, 59.34], [142.2, 59.04], [138.96, 57.09], [135.13, 54.73], [136.7, 54.6], [137.19, 53.98], [138.16, 53.76], [138.8, 54.25], [139.9, 54.19], [141.35, 53.09], [141.38, 52.24], [140.6, 51.24], [140.51, 50.05], [140.06, 48.45], [138.55, 47], [138.22, 46.31], [136.86, 45.14], [135.52, 43.99], [134.87, 43.4], [133.54, 42.81], [132.91, 42.8], [132.28, 43.28], [130.94, 42.55], [130.78, 42.22], [130.64, 42.4], [130.63, 42.9], [131.14, 42.93], [131.29, 44.11], [131.03, 44.97], [131.88, 45.32], [133.1, 45.14], [133.77, 46.12], [134.11, 47.21], [134.5, 47.58], [135.03, 48.48], [133.37, 48.18], [132.51, 47.79], [130.99, 47.79], [130.58, 48.73], [129.4, 49.44], [127.66, 49.76], [127.29, 50.74], [126.94, 51.35], [126.56, 51.78], [125.95, 52.79], [125.07, 53.16], [123.57, 53.46], [122.25, 53.43], [121, 53.25], [120.18, 52.75], [120.73, 52.52], [120.74, 51.96], [120.18, 51.64], [119.28, 50.58], [119.29, 50.14], [117.88, 49.51], [116.68, 49.89], [115.49, 49.81], [114.96, 50.14], [114.36, 50.25], [112.9, 49.54], [111.58, 49.38], [110.66, 49.13], [109.4, 49.29], [108.48, 49.28], [107.87, 49.79], [106.89, 50.27], [105.89, 50.41], [104.62, 50.28], [103.68, 50.09], [102.26, 50.51], [102.07, 51.26], [100.89, 51.52], [99.98, 51.63], [98.86, 52.05], [97.83, 51.01], [98.23, 50.42], [97.26, 49.73], [95.81, 49.98], [94.82, 50.01], [94.15, 50.48], [93.1, 50.5], [92.23, 50.8], [90.71, 50.33], [88.81, 49.47], [87.75, 49.3], [87.36, 49.21], [86.83, 49.83], [85.54, 49.69], [85.12, 50.12], [84.42, 50.31], [83.94, 50.89], [83.38, 51.07], [81.95, 50.81], [80.57, 51.39], [80.04, 50.86], [77.8, 53.4], [76.53, 54.18], [76.89, 54.49], [74.38, 53.55], [73.43, 53.49], [73.51, 54.04], [72.22, 54.38], [71.18, 54.13], [70.87, 55.17], [69.07, 55.39], [68.17, 54.97], [65.67, 54.6], [65.18, 54.35], [61.44, 54.01], [60.98, 53.66], [61.7, 52.98], [60.74, 52.72], [60.93, 52.45], [59.97, 51.96], [61.59, 51.27], [61.34, 50.8], [59.93, 50.84], [59.64, 50.55], [58.36, 51.06], [56.78, 51.04], [55.72, 50.62], [54.53, 51.03], [52.33, 51.72], [50.77, 51.69], [48.7, 50.61], [48.58, 49.87], [47.55, 50.45], [46.75, 49.36], [47.04, 49.15], [46.47, 48.39], [47.32, 47.72], [48.06, 47.74], [48.69, 47.08], [48.59, 46.56], [49.1, 46.4]]], [[[22.73, 54.33], [20.89, 54.31], [19.66, 54.43], [19.89, 54.87], [21.27, 55.19], [22.32, 55.02], [22.76, 54.86], [22.65, 54.58], [22.73, 54.33]]], [[[142.91, 53.7], [143.26, 52.74], [143.24, 51.76], [143.65, 50.75], [144.65, 48.98], [143.17, 49.31], [142.56, 47.86], [143.53, 46.84], [143.51, 46.14], [142.75, 46.74], [142.09, 45.97], [141.91, 46.81], [142.02, 47.78], [141.9, 48.86], [142.14, 49.62], [142.18, 50.95], [141.59, 51.94], [141.68, 53.3], [142.61, 53.76], [142.21, 54.23], [142.65, 54.37], [142.91, 53.7]]], [[[-174.93, 67.21], [-175.01, 66.58], [-174.34, 66.34], [-174.57, 67.06], [-171.86, 66.91], [-169.9, 65.98], [-170.89, 65.54], [-172.53, 65.44], [-172.55, 64.46], [-172.96, 64.25], [-173.89, 64.28], [-174.65, 64.63], [-175.98, 64.92], [-176.21, 65.36], [-177.22, 65.52], [-178.36, 65.39], [-178.9, 65.74], [-178.69, 66.11], [-179.88, 65.87], [-179.43, 65.4], [-180, 64.98], [-180, 68.96], [-177.55, 68.2], [-174.93, 67.21]]], [[[33.44, 45.97], [33.7, 46.22], [34.41, 46.01], [34.73, 45.97], [34.86, 45.77], [35.01, 45.74], [35.02, 45.65], [35.51, 45.41], [36.53, 45.47], [36.33, 45.11], [35.24, 44.94], [33.88, 44.36], [33.33, 44.56], [33.55, 45.03], [32.45, 45.33], [32.63, 45.52], [33.59, 45.85], [33.44, 45.97]]]], "mainOnly": true },
    { "iso": "rw", "name": "Rwanda", "polygons": [[[[30.42, -1.13], [30.82, -1.7], [30.76, -2.29], [30.47, -2.41], [29.94, -2.35], [29.63, -2.92], [29.02, -2.84], [29.12, -2.29], [29.25, -2.22], [29.29, -1.62], [29.58, -1.34], [29.82, -1.44], [30.42, -1.13]]]], "mainOnly": true },
    { "iso": "sa", "name": "Saudi Arabia", "polygons": [[[[34.96, 29.36], [36.07, 29.2], [36.5, 29.51], [36.74, 29.87], [37.5, 30], [37.67, 30.34], [38, 30.51], [37, 31.51], [39, 32.01], [39.2, 32.16], [40.4, 31.89], [41.89, 31.19], [44.71, 29.18], [46.57, 29.1], [47.46, 29], [47.71, 28.53], [48.42, 28.55], [48.81, 27.69], [49.3, 27.46], [49.47, 27.11], [50.15, 26.69], [50.21, 26.28], [50.11, 25.94], [50.24, 25.61], [50.53, 25.33], [50.66, 25], [50.81, 24.75], [51.11, 24.56], [51.39, 24.63], [51.58, 24.25], [51.62, 24.01], [52, 23], [55.01, 22.5], [55.21, 22.71], [55.67, 22], [55, 20], [52, 19], [49.12, 18.62], [48.18, 18.17], [47.47, 17.12], [47, 16.95], [46.75, 17.28], [46.37, 17.23], [45.4, 17.33], [45.22, 17.43], [44.06, 17.41], [43.79, 17.32], [43.38, 17.58], [43.12, 17.09], [43.22, 16.67], [42.78, 16.35], [42.65, 16.77], [42.35, 17.08], [42.27, 17.47], [41.75, 17.83], [41.22, 18.67], [40.94, 19.49], [40.25, 20.17], [39.8, 20.34], [39.14, 21.29], [39.02, 21.99], [39.07, 22.58], [38.49, 23.69], [38.02, 24.08], [37.48, 24.29], [37.15, 24.86], [37.21, 25.08], [36.93, 25.6], [36.64, 25.83], [36.25, 26.57], [35.64, 27.38], [35.13, 28.06], [34.63, 28.06], [34.79, 28.61], [34.83, 28.96], [34.96, 29.36]]]], "mainOnly": true },
    { "iso": "sn", "name": "Senegal", "polygons": [[[[-16.71, 13.59], [-17.13, 14.37], [-17.63, 14.73], [-17.19, 14.92], [-16.7, 15.62], [-16.46, 16.14], [-16.12, 16.46], [-15.62, 16.37], [-15.14, 16.59], [-14.58, 16.6], [-14.1, 16.3], [-13.44, 16.04], [-12.83, 15.3], [-12.17, 14.62], [-12.12, 13.99], [-11.93, 13.42], [-11.55, 13.14], [-11.47, 12.75], [-11.51, 12.44], [-11.66, 12.39], [-12.2, 12.47], [-12.28, 12.35], [-12.5, 12.33], [-13.22, 12.58], [-13.7, 12.59], [-15.55, 12.63], [-15.82, 12.52], [-16.15, 12.55], [-16.68, 12.38], [-16.84, 13.15], [-15.93, 13.13], [-15.69, 13.27], [-15.51, 13.28], [-15.14, 13.51], [-14.71, 13.3], [-14.28, 13.28], [-13.84, 13.51], [-14.05, 13.79], [-14.38, 13.63], [-14.69, 13.63], [-15.08, 13.88], [-15.4, 13.86], [-15.62, 13.62], [-16.71, 13.59]]]], "mainOnly": true },
    { "iso": "sl", "name": "Sierra Leone", "polygons": [[[[-13.25, 8.9], [-12.71, 9.34], [-12.6, 9.62], [-12.43, 9.84], [-12.15, 9.86], [-11.92, 10.05], [-11.12, 10.05], [-10.84, 9.69], [-10.62, 9.27], [-10.65, 8.98], [-10.49, 8.72], [-10.51, 8.35], [-10.23, 8.41], [-10.7, 7.94], [-11.15, 7.4], [-11.2, 7.11], [-11.44, 6.79], [-11.71, 6.86], [-12.43, 7.26], [-12.95, 7.8], [-13.12, 8.16], [-13.25, 8.9]]]], "mainOnly": true },
    { "iso": "sk", "name": "Slovakia", "polygons": [[[[22.56, 49.09], [22.28, 48.83], [22.09, 48.42], [21.87, 48.32], [20.8, 48.62], [20.47, 48.56], [20.24, 48.33], [19.77, 48.2], [19.66, 48.27], [19.17, 48.11], [18.78, 48.08], [18.7, 47.88], [17.86, 47.76], [17.49, 47.87], [16.98, 48.12], [16.88, 48.47], [16.96, 48.6], [17.1, 48.82], [17.55, 48.8], [17.89, 48.9], [17.91, 49], [18.1, 49.04], [18.17, 49.27], [18.4, 49.32], [18.55, 49.5], [18.85, 49.5], [18.91, 49.44], [19.32, 49.57], [19.83, 49.22], [20.42, 49.43], [20.89, 49.33], [21.61, 49.47], [22.56, 49.09]]]], "mainOnly": true },
    { "iso": "si", "name": "Slovenia", "polygons": [[[[13.81, 46.51], [14.63, 46.43], [15.14, 46.66], [16.01, 46.68], [16.2, 46.85], [16.37, 46.84], [16.56, 46.5], [15.77, 46.24], [15.67, 45.83], [15.32, 45.73], [15.33, 45.45], [14.94, 45.47], [14.6, 45.63], [14.41, 45.47], [13.72, 45.5], [13.94, 45.59], [13.7, 46.02], [13.81, 46.51]]]], "mainOnly": true },
    { "iso": "sb", "name": "Solomon Islands", "polygons": [[[[162.12, -10.48], [162.4, -10.83], [161.7, -10.82], [161.32, -10.2], [161.92, -10.45], [162.12, -10.48]]], [[[161.68, -9.6], [161.53, -9.78], [160.79, -8.92], [160.58, -8.32], [160.92, -8.32], [161.28, -9.12], [161.68, -9.6]]], [[[160.85, -9.87], [160.46, -9.9], [159.85, -9.79], [159.64, -9.64], [159.7, -9.24], [160.36, -9.4], [160.69, -9.61], [160.85, -9.87]]], [[[159.64, -8.02], [159.88, -8.34], [159.92, -8.54], [159.13, -8.11], [158.59, -7.75], [158.21, -7.42], [158.36, -7.32], [158.82, -7.56], [159.64, -8.02]]], [[[157.14, -7.02], [157.54, -7.35], [157.34, -7.4], [156.9, -7.18], [156.49, -6.77], [156.54, -6.6], [157.14, -7.02]]]], "mainOnly": true },
    { "iso": "so", "name": "Somalia", "polygons": [[[[41.59, -1.68], [40.99, -0.86], [40.98, 2.78], [41.86, 3.92], [42.13, 4.23], [42.77, 4.25], [43.66, 4.96], [44.96, 5], [47.79, 8], [48.49, 8.84], [48.94, 9.45], [48.94, 9.97], [48.94, 10.98], [48.94, 11.39], [48.95, 11.41], [49.27, 11.43], [49.73, 11.58], [50.26, 11.68], [50.73, 12.02], [51.11, 12.02], [51.13, 11.75], [51.04, 11.17], [51.05, 10.64], [50.83, 10.28], [50.55, 9.2], [50.07, 8.08], [49.45, 6.8], [48.59, 5.34], [47.74, 4.22], [46.56, 2.86], [45.56, 2.05], [44.07, 1.05], [43.14, 0.29], [42.04, -0.92], [41.81, -1.45], [41.59, -1.68]]]], "mainOnly": true },
    { "iso": "za", "name": "South Africa", "polygons": [[[[16.34, -28.58], [16.82, -28.08], [17.22, -28.36], [17.39, -28.78], [17.84, -28.86], [18.46, -29.05], [19, -28.97], [19.89, -28.46], [19.9, -24.77], [20.17, -24.92], [20.76, -25.87], [20.67, -26.48], [20.89, -26.83], [21.61, -26.73], [22.11, -26.28], [22.58, -25.98], [22.82, -25.5], [23.31, -25.27], [23.73, -25.39], [24.21, -25.67], [25.03, -25.72], [25.66, -25.49], [25.77, -25.17], [25.94, -24.7], [26.49, -24.62], [26.79, -24.24], [27.12, -23.57], [28.02, -22.83], [29.43, -22.09], [29.84, -22.1], [30.32, -22.27], [30.66, -22.15], [31.19, -22.25], [31.67, -23.66], [31.93, -24.37], [31.75, -25.48], [31.84, -25.84], [31.33, -25.66], [31.04, -25.73], [30.95, -26.02], [30.68, -26.4], [30.69, -26.74], [31.28, -27.29], [31.87, -27.18], [32.07, -26.73], [32.83, -26.74], [32.58, -27.47], [32.46, -28.3], [32.2, -28.75], [31.52, -29.26], [31.33, -29.4], [30.9, -29.91], [30.62, -30.42], [30.06, -31.14], [28.93, -32.17], [28.22, -32.77], [27.46, -33.23], [26.42, -33.61], [25.91, -33.67], [25.78, -33.94], [25.17, -33.8], [24.68, -33.99], [23.59, -33.79], [22.99, -33.92], [22.57, -33.86], [21.54, -34.26], [20.69, -34.42], [20.07, -34.8], [19.62, -34.82], [19.19, -34.46], [18.86, -34.44], [18.42, -34], [18.38, -34.14], [18.24, -33.87], [18.25, -33.28], [17.93, -32.61], [18.25, -32.43], [18.22, -31.66], [17.57, -30.73], [17.06, -29.88], [16.34, -28.58]], [[28.98, -28.96], [28.54, -28.65], [28.07, -28.85], [27.53, -29.24], [27, -29.88], [27.75, -30.65], [28.11, -30.55], [28.29, -30.23], [28.85, -30.07], [29.02, -29.74], [29.33, -29.26], [28.98, -28.96]]]], "mainOnly": true },
    { "iso": "kr", "name": "South Korea", "polygons": [[[[126.17, 37.75], [126.24, 37.84], [126.68, 37.8], [127.07, 38.26], [127.78, 38.3], [128.21, 38.37], [128.35, 38.61], [129.21, 37.43], [129.46, 36.78], [129.47, 35.63], [129.09, 35.08], [128.19, 34.89], [127.39, 34.48], [126.49, 34.39], [126.37, 34.93], [126.56, 35.68], [126.12, 36.73], [126.86, 36.89], [126.17, 37.75]]]], "mainOnly": true },
    { "iso": "ss", "name": "South Sudan", "polygons": [[[[30.83, 3.51], [29.95, 4.17], [29.72, 4.6], [29.16, 4.39], [28.7, 4.46], [28.43, 4.29], [27.98, 4.41], [27.37, 5.23], [27.21, 5.55], [26.47, 5.95], [26.21, 6.55], [25.8, 6.98], [25.12, 7.5], [25.11, 7.83], [24.57, 8.23], [23.89, 8.62], [24.19, 8.73], [24.54, 8.92], [24.79, 9.81], [25.07, 10.27], [25.79, 10.41], [25.96, 10.14], [26.48, 9.55], [26.75, 9.47], [27.11, 9.64], [27.83, 9.6], [27.97, 9.4], [28.97, 9.4], [29, 9.6], [29.52, 9.79], [29.62, 10.08], [30, 10.29], [30.84, 9.71], [31.35, 9.81], [31.85, 10.53], [32.4, 11.08], [32.31, 11.68], [32.07, 11.97], [32.67, 12.02], [32.74, 12.25], [33.21, 12.18], [33.09, 11.44], [33.21, 10.72], [33.72, 10.33], [33.84, 9.98], [33.82, 9.48], [33.96, 9.46], [33.97, 8.68], [33.83, 8.38], [33.29, 8.35], [32.95, 7.78], [33.57, 7.71], [34.08, 7.23], [34.25, 6.83], [34.71, 6.59], [35.3, 5.51], [34.62, 4.85], [34.01, 4.25], [33.39, 3.79], [32.69, 3.79], [31.88, 3.56], [31.25, 3.78], [30.83, 3.51]]]], "mainOnly": true },
    { "iso": "es", "name": "Spain", "polygons": [[[[-7.45, 37.1], [-7.54, 37.43], [-7.17, 37.8], [-7.03, 38.08], [-7.37, 38.37], [-7.1, 39.03], [-7.5, 39.63], [-7.07, 39.71], [-7.03, 40.18], [-6.86, 40.33], [-6.85, 41.11], [-6.39, 41.38], [-6.67, 41.88], [-7.25, 41.92], [-7.42, 41.79], [-8.01, 41.79], [-8.26, 42.28], [-8.67, 42.13], [-9.03, 41.88], [-8.98, 42.59], [-9.39, 43.03], [-7.98, 43.75], [-6.75, 43.57], [-5.41, 43.57], [-4.35, 43.4], [-3.52, 43.46], [-1.9, 43.42], [-1.5, 43.03], [0.34, 42.58], [0.7, 42.8], [1.83, 42.34], [2.99, 42.47], [3.04, 41.89], [2.09, 41.23], [0.81, 41.01], [0.72, 40.68], [0.11, 40.12], [-0.28, 39.31], [0.11, 38.74], [-0.47, 38.29], [-0.68, 37.64], [-1.44, 37.44], [-2.15, 36.67], [-3.42, 36.66], [-4.37, 36.68], [-5, 36.32], [-5.38, 35.95], [-5.87, 36.03], [-6.24, 36.37], [-6.52, 36.94], [-7.45, 37.1]]]], "mainOnly": true },
    { "iso": "lk", "name": "Sri Lanka", "polygons": [[[[81.79, 7.52], [81.64, 6.48], [81.22, 6.2], [80.35, 5.97], [79.87, 6.76], [79.7, 8.2], [80.15, 9.82], [80.84, 9.27], [81.3, 8.56], [81.79, 7.52]]]], "mainOnly": true },
    { "iso": "sd", "name": "Sudan", "polygons": [[[[24.57, 8.23], [23.81, 8.67], [23.46, 8.95], [23.39, 9.27], [23.56, 9.68], [23.55, 10.09], [22.98, 10.71], [22.86, 11.14], [22.88, 11.38], [22.51, 11.68], [22.5, 12.26], [22.29, 12.65], [21.94, 12.59], [22.04, 12.96], [22.3, 13.37], [22.18, 13.79], [22.51, 14.09], [22.3, 14.33], [22.57, 14.94], [23.02, 15.68], [23.89, 15.61], [23.84, 19.58], [23.85, 20], [25, 20], [25, 22], [29.02, 22], [32.9, 22], [36.87, 22], [37.19, 21.02], [36.97, 20.84], [37.11, 19.81], [37.48, 18.61], [37.86, 18.37], [38.41, 18], [37.9, 17.43], [37.17, 17.26], [36.85, 16.96], [36.75, 16.29], [36.32, 14.82], [36.43, 14.42], [36.27, 13.56], [35.86, 12.58], [35.26, 12.08], [34.83, 11.32], [34.73, 10.91], [34.26, 10.63], [33.96, 9.58], [33.97, 8.68], [33.96, 9.46], [33.82, 9.48], [33.84, 9.98], [33.72, 10.33], [33.21, 10.72], [33.09, 11.44], [33.21, 12.18], [32.74, 12.25], [32.67, 12.02], [32.07, 11.97], [32.31, 11.68], [32.4, 11.08], [31.85, 10.53], [31.35, 9.81], [30.84, 9.71], [30, 10.29], [29.62, 10.08], [29.52, 9.79], [29, 9.6], [28.97, 9.4], [27.97, 9.4], [27.83, 9.6], [27.11, 9.64], [26.75, 9.47], [26.48, 9.55], [25.96, 10.14], [25.79, 10.41], [25.07, 10.27], [24.79, 9.81], [24.54, 8.92], [24.19, 8.73], [23.89, 8.62], [24.57, 8.23]]]], "mainOnly": true },
    { "iso": "sr", "name": "Suriname", "polygons": [[[[-54.52, 2.31], [-55.1, 2.52], [-55.57, 2.42], [-55.97, 2.51], [-56.07, 2.22], [-55.91, 2.02], [-56, 1.82], [-56.54, 1.9], [-57.15, 2.77], [-57.28, 3.33], [-57.6, 3.33], [-58.04, 4.06], [-57.86, 4.58], [-57.91, 4.81], [-57.31, 5.07], [-57.15, 5.97], [-55.95, 5.77], [-55.84, 5.95], [-55.03, 6.03], [-53.96, 5.76], [-54.48, 4.9], [-54.4, 4.21], [-54.01, 3.62], [-54.18, 3.19], [-54.27, 2.73], [-54.52, 2.31]]]], "mainOnly": true },
    { "iso": "se", "name": "Sweden", "polygons": [[[[11.03, 58.86], [11.47, 59.43], [12.3, 60.12], [12.63, 61.29], [11.99, 61.8], [11.93, 63.13], [12.58, 64.07], [13.57, 64.05], [13.92, 64.45], [13.56, 64.79], [15.11, 66.19], [16.11, 67.3], [16.77, 68.01], [17.73, 68.01], [17.99, 68.57], [19.88, 68.41], [20.03, 69.07], [20.65, 69.11], [21.98, 68.62], [23.54, 67.94], [23.57, 66.4], [23.9, 66.01], [22.18, 65.72], [21.21, 65.03], [21.37, 64.41], [19.78, 63.61], [17.85, 62.75], [17.12, 61.34], [17.83, 60.64], [18.79, 60.08], [17.87, 58.95], [16.83, 58.72], [16.45, 57.04], [15.88, 56.1], [14.67, 56.2], [14.1, 55.41], [12.94, 55.36], [12.63, 56.31], [11.79, 57.44], [11.03, 58.86]]]], "mainOnly": true },
    { "iso": "ch", "name": "Switzerland", "polygons": [[[[9.59, 47.53], [9.63, 47.35], [9.48, 47.1], [9.93, 46.92], [10.44, 46.89], [10.36, 46.48], [9.92, 46.31], [9.18, 46.44], [8.97, 46.04], [8.49, 46.01], [8.32, 46.16], [7.76, 45.82], [7.27, 45.78], [6.84, 45.99], [6.5, 46.43], [6.02, 46.27], [6.04, 46.73], [6.77, 47.29], [6.74, 47.54], [7.19, 47.45], [7.47, 47.62], [8.32, 47.61], [8.52, 47.83], [9.59, 47.53]]]], "mainOnly": true },
    { "iso": "sy", "name": "Syria", "polygons": [[[[35.72, 32.71], [35.7, 32.72], [35.84, 32.87], [35.82, 33.28], [36.07, 33.82], [36.61, 34.2], [36.45, 34.59], [36, 34.64], [35.91, 35.41], [36.15, 35.82], [36.42, 36.04], [36.69, 36.26], [36.74, 36.82], [37.07, 36.62], [38.17, 36.9], [38.7, 36.71], [39.52, 36.72], [40.67, 37.09], [41.21, 37.07], [42.35, 37.23], [41.84, 36.61], [41.29, 36.36], [41.38, 35.63], [41.01, 34.42], [38.79, 33.38], [36.83, 32.31], [35.72, 32.71]]]], "mainOnly": true },
    { "iso": "tw", "name": "Taiwan", "polygons": [[[[121.78, 24.39], [121.18, 22.79], [120.75, 21.97], [120.22, 22.81], [120.11, 23.56], [120.69, 24.54], [121.5, 25.3], [121.95, 25], [121.78, 24.39]]]], "mainOnly": true },
    { "iso": "tj", "name": "Tajikistan", "polygons": [[[[67.83, 37.14], [68.39, 38.16], [68.18, 38.9], [67.44, 39.14], [67.7, 39.58], [68.54, 39.53], [69.01, 40.09], [69.33, 40.73], [70.67, 40.96], [70.46, 40.5], [70.6, 40.22], [71.01, 40.24], [70.65, 39.94], [69.56, 40.1], [69.46, 39.53], [70.55, 39.6], [71.78, 39.28], [73.68, 39.43], [73.93, 38.51], [74.26, 38.61], [74.86, 38.38], [74.83, 37.99], [74.98, 37.42], [73.95, 37.42], [73.26, 37.5], [72.64, 37.05], [72.19, 36.95], [71.84, 36.74], [71.45, 37.07], [71.54, 37.91], [71.24, 37.95], [71.35, 38.26], [70.81, 38.49], [70.38, 38.14], [70.27, 37.74], [70.12, 37.59], [69.52, 37.61], [69.2, 37.15], [68.86, 37.34], [68.14, 37.02], [67.83, 37.14]]]], "mainOnly": true },
    { "iso": "th", "name": "Thailand", "polygons": [[[[105.22, 14.27], [104.28, 14.42], [102.99, 14.23], [102.35, 13.39], [102.58, 12.19], [101.69, 12.65], [100.83, 12.63], [100.98, 13.41], [100.1, 13.41], [100.02, 12.31], [99.48, 10.85], [99.15, 9.96], [99.22, 9.24], [99.87, 9.21], [100.28, 8.3], [100.46, 7.43], [101.02, 6.86], [101.62, 6.74], [102.14, 6.22], [101.81, 5.81], [101.15, 5.69], [101.08, 6.2], [100.26, 6.64], [100.09, 6.46], [99.69, 6.85], [99.52, 7.34], [98.99, 7.91], [98.5, 8.38], [98.34, 7.79], [98.15, 8.35], [98.26, 8.97], [98.55, 9.93], [99.04, 10.96], [99.59, 11.89], [99.2, 12.8], [99.21, 13.27], [99.1, 13.83], [98.43, 14.62], [98.19, 15.12], [98.54, 15.31], [98.9, 16.18], [98.49, 16.84], [97.86, 17.57], [97.38, 18.45], [97.8, 18.63], [98.25, 19.71], [98.96, 19.75], [99.54, 20.19], [100.12, 20.42], [100.55, 20.11], [100.61, 19.51], [101.28, 19.46], [101.04, 18.41], [101.06, 17.51], [102.11, 18.11], [102.41, 17.93], [103, 17.96], [103.2, 18.31], [103.96, 18.24], [104.72, 17.43], [104.78, 16.44], [105.59, 15.57], [105.54, 14.72], [105.22, 14.27]]]], "mainOnly": true },
    { "iso": "bs", "name": "The Bahamas", "polygons": [[[[-78.98, 26.79], [-78.51, 26.87], [-77.85, 26.84], [-77.82, 26.58], [-78.91, 26.42], [-78.98, 26.79]]], [[[-77.79, 27.04], [-77, 26.59], [-77.17, 25.88], [-77.36, 26.01], [-77.34, 26.53], [-77.79, 26.93], [-77.79, 27.04]]], [[[-78.19, 25.21], [-77.89, 25.17], [-77.54, 24.34], [-77.53, 23.76], [-77.78, 23.71], [-78.03, 24.29], [-78.41, 24.58], [-78.19, 25.21]]]], "mainOnly": true },
    { "iso": "tg", "name": "Togo", "polygons": [[[[0.9, 11], [0.77, 10.47], [1.08, 10.18], [1.43, 9.83], [1.46, 9.33], [1.66, 9.13], [1.62, 6.83], [1.87, 6.14], [1.06, 5.93], [0.84, 6.28], [0.57, 6.91], [0.49, 7.41], [0.71, 8.31], [0.46, 8.68], [0.37, 9.47], [0.37, 10.19], [-0.05, 10.71], [0.02, 11.02], [0.9, 11]]]], "mainOnly": true },
    { "iso": "tt", "name": "Trinidad and Tobago", "polygons": [[[[-61.68, 10.76], [-61.1, 10.89], [-60.89, 10.86], [-60.93, 10.11], [-61.77, 10], [-61.95, 10.09], [-61.66, 10.37], [-61.68, 10.76]]]], "mainOnly": true },
    { "iso": "tn", "name": "Tunisia", "polygons": [[[[9.48, 30.31], [9.06, 32.1], [8.44, 32.51], [8.43, 32.75], [7.61, 33.34], [7.52, 34.1], [8.14, 34.66], [8.38, 35.48], [8.22, 36.43], [8.42, 36.95], [9.51, 37.35], [10.21, 37.23], [10.18, 36.72], [11.03, 37.09], [11.1, 36.9], [10.6, 36.41], [10.59, 35.95], [10.94, 35.7], [10.81, 34.83], [10.15, 34.33], [10.34, 33.79], [10.86, 33.77], [11.11, 33.29], [11.49, 33.14], [11.43, 32.37], [10.94, 32.08], [10.64, 31.76], [9.95, 31.38], [10.06, 30.96], [9.97, 30.54], [9.48, 30.31]]]], "mainOnly": true },
    { "iso": "tr", "name": "Turkey", "polygons": [[[[44.77, 37.17], [44.29, 37], [43.94, 37.26], [42.78, 37.39], [42.35, 37.23], [41.21, 37.07], [40.67, 37.09], [39.52, 36.72], [38.7, 36.71], [38.17, 36.9], [37.07, 36.62], [36.74, 36.82], [36.69, 36.26], [36.42, 36.04], [36.15, 35.82], [35.78, 36.27], [36.16, 36.65], [35.55, 36.57], [34.71, 36.8], [34.03, 36.22], [32.51, 36.11], [31.7, 36.64], [30.62, 36.68], [30.39, 36.26], [29.7, 36.14], [28.73, 36.68], [27.64, 36.66], [27.05, 37.65], [26.32, 38.21], [26.8, 38.99], [26.17, 39.46], [27.28, 40.42], [28.82, 40.46], [29.24, 41.22], [31.15, 41.09], [32.35, 41.74], [33.51, 42.02], [35.17, 42.04], [36.91, 41.34], [38.35, 40.95], [39.51, 41.1], [40.37, 41.01], [41.55, 41.54], [42.62, 41.58], [43.58, 41.09], [43.75, 40.74], [43.66, 40.25], [44.4, 40.01], [44.79, 39.71], [44.11, 39.43], [44.42, 38.28], [44.23, 37.97], [44.77, 37.17]]], [[[26.12, 41.83], [27.14, 42.14], [28, 42.01], [28.12, 41.62], [28.99, 41.3], [28.81, 41.05], [27.62, 41], [27.19, 40.69], [26.36, 40.15], [26.04, 40.62], [26.06, 40.82], [26.29, 40.94], [26.6, 41.56], [26.12, 41.83]]]], "mainOnly": true },
    { "iso": "tm", "name": "Turkmenistan", "polygons": [[[[52.5, 41.78], [52.94, 42.12], [54.08, 42.32], [54.76, 42.04], [55.46, 41.26], [55.97, 41.31], [57.1, 41.32], [56.93, 41.83], [57.79, 42.17], [58.63, 42.75], [59.98, 42.22], [60.08, 41.43], [60.47, 41.22], [61.55, 41.27], [61.88, 41.08], [62.37, 40.05], [63.52, 39.36], [64.17, 38.89], [65.22, 38.4], [66.55, 37.97], [66.52, 37.36], [66.22, 37.39], [65.75, 37.66], [65.59, 37.31], [64.75, 37.11], [64.55, 36.31], [63.98, 36.01], [63.19, 35.86], [62.98, 35.4], [62.23, 35.27], [61.21, 35.65], [61.12, 36.49], [60.38, 36.53], [59.23, 37.41], [58.44, 37.52], [57.33, 38.03], [56.62, 38.12], [56.18, 37.94], [55.51, 37.96], [54.8, 37.39], [53.92, 37.2], [53.74, 37.91], [53.88, 38.95], [53.1, 39.29], [53.36, 39.98], [52.69, 40.03], [52.92, 40.88], [53.86, 40.63], [54.74, 40.95], [54.01, 41.55], [53.72, 42.12], [52.92, 41.87], [52.81, 41.14], [52.5, 41.78]]]], "mainOnly": true },
    { "iso": "ug", "name": "Uganda", "polygons": [[[[33.9, -0.95], [31.87, -1.03], [30.77, -1.01], [30.42, -1.13], [29.82, -1.44], [29.58, -1.34], [29.59, -0.59], [29.82, -0.21], [29.88, 0.6], [30.09, 1.06], [30.47, 1.58], [30.85, 1.85], [31.17, 2.2], [30.77, 2.34], [30.83, 3.51], [31.25, 3.78], [31.88, 3.56], [32.69, 3.79], [33.39, 3.79], [34.01, 4.25], [34.48, 3.56], [34.6, 3.05], [35.04, 1.91], [34.67, 1.18], [34.18, 0.52], [33.89, 0.11], [33.9, -0.95]]]], "mainOnly": true },
    { "iso": "ua", "name": "Ukraine", "polygons": [[[[31.79, 52.1], [32.16, 52.06], [32.41, 52.29], [32.72, 52.24], [33.75, 52.34], [34.39, 51.77], [34.14, 51.57], [34.22, 51.26], [35.02, 51.21], [35.38, 50.77], [35.36, 50.58], [36.63, 50.23], [37.39, 50.38], [38.01, 49.92], [38.59, 49.93], [40.07, 49.6], [40.08, 49.31], [39.67, 48.78], [39.9, 48.23], [39.74, 47.9], [38.77, 47.83], [38.26, 47.55], [38.22, 47.1], [37.43, 47.02], [36.76, 46.7], [35.82, 46.65], [34.96, 46.27], [35.01, 45.74], [34.86, 45.77], [34.73, 45.97], [34.41, 46.01], [33.7, 46.22], [33.44, 45.97], [33.3, 46.08], [31.74, 46.33], [31.68, 46.71], [30.75, 46.58], [30.38, 46.03], [29.6, 45.29], [29.15, 45.46], [28.68, 45.3], [28.23, 45.49], [28.49, 45.6], [28.66, 45.94], [28.93, 46.26], [28.86, 46.44], [29.07, 46.52], [29.17, 46.38], [29.76, 46.35], [30.02, 46.42], [29.84, 46.53], [29.91, 46.67], [29.56, 46.93], [29.42, 47.35], [29.05, 47.51], [29.12, 47.85], [28.67, 48.12], [28.26, 48.16], [27.52, 48.47], [26.86, 48.37], [26.62, 48.22], [26.2, 48.22], [25.95, 47.99], [25.21, 47.89], [24.87, 47.74], [24.4, 47.98], [23.76, 47.99], [23.14, 48.1], [22.71, 47.88], [22.64, 48.15], [22.09, 48.42], [22.28, 48.83], [22.56, 49.09], [22.78, 49.03], [22.52, 49.48], [23.43, 50.31], [23.92, 50.42], [24.03, 50.71], [23.53, 51.58], [24.01, 51.62], [24.55, 51.89], [25.33, 51.91], [26.34, 51.83], [27.45, 51.59], [28.24, 51.57], [28.62, 51.43], [28.99, 51.6], [29.25, 51.37], [30.16, 51.42], [30.56, 51.32], [30.62, 51.82], [30.93, 52.04], [31.79, 52.1]]]], "mainOnly": true },
    { "iso": "ae", "name": "United Arab Emirates", "polygons": [[[[51.58, 24.25], [51.76, 24.29], [51.79, 24.02], [52.58, 24.18], [53.4, 24.15], [54.01, 24.12], [54.69, 24.8], [55.44, 25.44], [56.07, 26.06], [56.26, 25.71], [56.4, 24.92], [55.89, 24.92], [55.8, 24.27], [55.98, 24.13], [55.53, 23.93], [55.53, 23.52], [55.23, 23.11], [55.21, 22.71], [55.01, 22.5], [52, 23], [51.62, 24.01], [51.58, 24.25]]]], "mainOnly": true },
    { "iso": "gb", "name": "United Kingdom", "polygons": [[[[-6.2, 53.87], [-6.95, 54.07], [-7.57, 54.06], [-7.37, 54.6], [-7.57, 55.13], [-6.73, 55.17], [-5.66, 54.55], [-6.2, 53.87]]], [[[-3.09, 53.4], [-2.95, 53.99], [-3.61, 54.6], [-3.63, 54.62], [-4.84, 54.79], [-5.08, 55.06], [-4.72, 55.51], [-5.05, 55.78], [-5.59, 55.31], [-5.64, 56.28], [-6.15, 56.79], [-5.79, 57.82], [-5.01, 58.63], [-4.21, 58.55], [-3.01, 58.64], [-4.07, 57.55], [-3.06, 57.69], [-1.96, 57.68], [-2.22, 56.87], [-3.12, 55.97], [-2.09, 55.91], [-2.01, 55.8], [-1.11, 54.62], [-0.43, 54.46], [0.18, 53.33], [0.47, 52.93], [1.68, 52.74], [1.56, 52.1], [1.05, 51.81], [1.45, 51.29], [0.55, 50.77], [-0.79, 50.77], [-2.49, 50.5], [-2.96, 50.7], [-3.62, 50.23], [-4.54, 50.34], [-5.25, 49.96], [-5.78, 50.16], [-4.31, 51.21], [-3.41, 51.43], [-3.42, 51.43], [-4.98, 51.59], [-5.27, 51.99], [-4.22, 52.3], [-4.77, 52.84], [-4.58, 53.5], [-3.09, 53.4]]]], "mainOnly": true },
    { "iso": "tz", "name": "United Republic of Tanzania", "polygons": [[[[33.9, -0.95], [34.07, -1.06], [37.7, -3.1], [37.77, -3.68], [39.2, -4.68], [38.74, -5.91], [38.8, -6.48], [39.44, -6.84], [39.47, -7.1], [39.19, -7.7], [39.25, -8.01], [39.19, -8.49], [39.54, -9.11], [39.95, -10.1], [40.32, -10.32], [39.52, -10.9], [38.43, -11.29], [37.83, -11.27], [37.47, -11.57], [36.78, -11.59], [36.51, -11.72], [35.31, -11.44], [34.56, -11.52], [34.28, -10.16], [33.94, -9.69], [33.74, -9.42], [32.76, -9.23], [32.19, -8.93], [31.56, -8.76], [31.16, -8.59], [30.74, -8.34], [30.2, -7.08], [29.62, -6.52], [29.42, -5.94], [29.52, -5.42], [29.34, -4.5], [29.75, -4.45], [30.12, -4.09], [30.51, -3.57], [30.75, -3.36], [30.74, -3.03], [30.53, -2.81], [30.47, -2.41], [30.76, -2.29], [30.82, -1.7], [30.42, -1.13], [30.77, -1.01], [31.87, -1.03], [33.9, -0.95]]]], "mainOnly": true },
    { "iso": "us", "name": "United States of America", "polygons": [[[[-122.84, 49], [-120, 49], [-117.03, 49], [-116.05, 49], [-113, 49], [-110.05, 49], [-107.05, 49], [-104.05, 49], [-100.65, 49], [-97.23, 49], [-95.16, 49], [-95.16, 49.38], [-94.82, 49.39], [-94.64, 48.84], [-94.33, 48.67], [-93.63, 48.61], [-92.61, 48.45], [-91.64, 48.14], [-90.83, 48.27], [-89.6, 48.01], [-89.27, 48.02], [-88.38, 48.3], [-87.44, 47.94], [-86.46, 47.55], [-85.65, 47.22], [-84.88, 46.9], [-84.78, 46.64], [-84.54, 46.54], [-84.6, 46.44], [-84.34, 46.41], [-84.14, 46.51], [-84.09, 46.28], [-83.89, 46.12], [-83.62, 46.12], [-83.47, 45.99], [-83.59, 45.82], [-82.55, 45.35], [-82.34, 44.44], [-82.14, 43.57], [-82.43, 42.98], [-82.9, 42.43], [-83.12, 42.08], [-83.14, 41.98], [-83.03, 41.83], [-82.69, 41.68], [-82.44, 41.68], [-81.28, 42.21], [-80.25, 42.37], [-78.94, 42.86], [-78.92, 42.97], [-79.01, 43.27], [-79.17, 43.47], [-78.72, 43.63], [-77.74, 43.63], [-76.82, 43.63], [-76.5, 44.02], [-76.37, 44.1], [-75.32, 44.82], [-74.87, 45], [-73.35, 45.01], [-71.51, 45.01], [-71.4, 45.26], [-71.08, 45.31], [-70.66, 45.46], [-70.31, 45.92], [-70, 46.69], [-69.24, 47.45], [-68.9, 47.19], [-68.23, 47.35], [-67.79, 47.07], [-67.79, 45.7], [-67.14, 45.14], [-66.96, 44.81], [-68.03, 44.33], [-69.06, 43.98], [-70.12, 43.68], [-70.65, 43.09], [-70.81, 42.87], [-70.82, 42.34], [-70.49, 41.81], [-70.08, 41.78], [-70.18, 42.15], [-69.88, 41.92], [-69.97, 41.64], [-70.64, 41.48], [-71.12, 41.49], [-71.86, 41.32], [-72.29, 41.27], [-72.88, 41.22], [-73.71, 40.93], [-72.24, 41.12], [-71.94, 40.93], [-73.34, 40.63], [-73.98, 40.63], [-73.95, 40.75], [-74.26, 40.47], [-73.96, 40.43], [-74.18, 39.71], [-74.91, 38.94], [-74.98, 39.2], [-75.2, 39.25], [-75.53, 39.5], [-75.32, 38.96], [-75.07, 38.78], [-75.06, 38.4], [-75.38, 38.02], [-75.94, 37.22], [-76.03, 37.26], [-75.72, 37.94], [-76.23, 38.32], [-76.35, 39.15], [-76.54, 38.72], [-76.33, 38.08], [-76.99, 38.24], [-76.3, 37.92], [-76.26, 36.97], [-75.97, 36.9], [-75.87, 36.55], [-75.73, 35.55], [-76.36, 34.81], [-77.4, 34.51], [-78.05, 33.93], [-78.55, 33.86], [-79.06, 33.49], [-79.2, 33.16], [-80.3, 32.51], [-80.86, 32.03], [-81.34, 31.44], [-81.49, 30.73], [-81.31, 30.04], [-80.98, 29.18], [-80.54, 28.47], [-80.53, 28.04], [-80.06, 26.88], [-80.09, 26.21], [-80.13, 25.82], [-80.38, 25.21], [-80.68, 25.08], [-81.17, 25.2], [-81.33, 25.64], [-81.71, 25.87], [-82.24, 26.73], [-82.71, 27.5], [-82.86, 27.89], [-82.65, 28.55], [-82.93, 29.1], [-83.71, 29.94], [-84.1, 30.09], [-85.11, 29.64], [-85.29, 29.69], [-85.77, 30.15], [-86.4, 30.4], [-87.53, 30.27], [-88.42, 30.38], [-89.18, 30.32], [-89.59, 30.16], [-89.41, 29.89], [-89.43, 29.49], [-89.22, 29.29], [-89.41, 29.16], [-89.78, 29.31], [-90.15, 29.12], [-90.88, 29.15], [-91.63, 29.68], [-92.5, 29.55], [-93.23, 29.78], [-93.85, 29.71], [-94.69, 29.48], [-95.6, 28.74], [-96.59, 28.31], [-97.14, 27.83], [-97.37, 27.38], [-97.38, 26.69], [-97.33, 26.21], [-97.14, 25.87], [-97.53, 25.84], [-98.24, 26.06], [-99.02, 26.37], [-99.3, 26.84], [-99.52, 27.54], [-100.11, 28.11], [-100.46, 28.7], [-100.96, 29.38], [-101.66, 29.78], [-102.48, 29.76], [-103.11, 28.97], [-103.94, 29.27], [-104.46, 29.57], [-104.71, 30.12], [-105.04, 30.64], [-105.63, 31.08], [-106.14, 31.4], [-106.51, 31.75], [-108.24, 31.75], [-108.24, 31.34], [-109.03, 31.34], [-111.02, 31.33], [-113.3, 32.04], [-114.81, 32.53], [-114.72, 32.72], [-115.99, 32.61], [-117.13, 32.54], [-117.3, 33.05], [-117.94, 33.62], [-118.41, 33.74], [-118.52, 34.03], [-119.08, 34.08], [-119.44, 34.35], [-120.37, 34.45], [-120.62, 34.61], [-120.74, 35.16], [-121.71, 36.16], [-122.55, 37.55], [-122.51, 37.78], [-122.95, 38.11], [-123.73, 38.95], [-123.87, 39.77], [-124.4, 40.31], [-124.18, 41.14], [-124.21, 42], [-124.53, 42.77], [-124.14, 43.71], [-124.02, 44.62], [-123.9, 45.52], [-124.08, 46.86], [-124.4, 47.72], [-124.69, 48.18], [-124.57, 48.38], [-123.12, 48.04], [-122.59, 47.1], [-122.34, 47.36], [-122.5, 48.18], [-122.84, 49]]], [[[-155.4, 20.08], [-155.22, 19.99], [-155.06, 19.86], [-154.81, 19.51], [-154.83, 19.45], [-155.22, 19.24], [-155.54, 19.08], [-155.69, 18.92], [-155.94, 19.06], [-155.91, 19.34], [-156.07, 19.7], [-156.02, 19.81], [-155.85, 19.98], [-155.92, 20.17], [-155.86, 20.27], [-155.79, 20.25], [-155.4, 20.08]]], [[[-156, 20.76], [-156.08, 20.64], [-156.41, 20.57], [-156.59, 20.78], [-156.7, 20.86], [-156.71, 20.93], [-156.61, 21.01], [-156.26, 20.92], [-156, 20.76]]], [[[-156.76, 21.18], [-156.79, 21.07], [-157.33, 21.1], [-157.25, 21.22], [-156.76, 21.18]]], [[[-158.03, 21.72], [-157.94, 21.65], [-157.65, 21.32], [-157.71, 21.26], [-157.78, 21.28], [-158.13, 21.31], [-158.25, 21.54], [-158.29, 21.58], [-158.03, 21.72]]], [[[-159.37, 22.21], [-159.35, 21.98], [-159.46, 21.88], [-159.8, 22.07], [-159.75, 22.14], [-159.6, 22.24], [-159.37, 22.21]]], [[[-153.23, 57.97], [-152.56, 57.9], [-152.14, 57.59], [-153.01, 57.12], [-154.01, 56.73], [-154.52, 56.99], [-154.67, 57.46], [-153.76, 57.82], [-153.23, 57.97]]], [[[-140.99, 69.71], [-140.99, 66], [-141, 60.31], [-140.01, 60.28], [-139.04, 60], [-138.34, 59.56], [-137.45, 58.91], [-136.48, 59.46], [-135.48, 59.79], [-134.94, 59.27], [-134.27, 58.86], [-133.36, 58.41], [-132.73, 57.69], [-131.71, 56.55], [-130.01, 55.92], [-129.98, 55.29], [-130.54, 54.8], [-131.09, 55.18], [-131.97, 55.5], [-132.25, 56.37], [-133.54, 57.18], [-134.08, 58.12], [-135.04, 58.19], [-136.63, 58.21], [-137.8, 58.5], [-139.87, 59.54], [-140.83, 59.73], [-142.57, 60.08], [-143.96, 60], [-145.93, 60.46], [-147.11, 60.88], [-148.22, 60.67], [-148.02, 59.98], [-148.57, 59.91], [-149.73, 59.71], [-150.61, 59.37], [-151.72, 59.16], [-151.86, 59.74], [-151.41, 60.73], [-150.35, 61.03], [-150.62, 61.28], [-151.9, 60.73], [-152.58, 60.06], [-154.02, 59.35], [-153.29, 58.86], [-154.23, 58.15], [-155.31, 57.73], [-156.31, 57.42], [-156.56, 56.98], [-158.12, 56.46], [-158.43, 55.99], [-159.6, 55.57], [-160.29, 55.64], [-161.22, 55.36], [-162.24, 55.02], [-163.07, 54.69], [-164.79, 54.4], [-164.94, 54.57], [-163.85, 55.04], [-162.87, 55.35], [-161.8, 55.89], [-160.56, 56.01], [-160.07, 56.42], [-158.68, 57.02], [-158.46, 57.22], [-157.72, 57.57], [-157.55, 58.33], [-157.04, 58.92], [-158.19, 58.62], [-158.52, 58.79], [-159.06, 58.42], [-159.71, 58.93], [-159.98, 58.57], [-160.36, 59.07], [-161.36, 58.67], [-161.97, 58.67], [-162.05, 59.27], [-161.87, 59.63], [-162.52, 59.99], [-163.82, 59.8], [-164.66, 60.27], [-165.35, 60.51], [-165.35, 61.07], [-166.12, 61.5], [-165.73, 62.07], [-164.92, 62.63], [-164.56, 63.15], [-163.75, 63.22], [-163.07, 63.06], [-162.26, 63.54], [-161.53, 63.46], [-160.77, 63.77], [-160.96, 64.22], [-161.52, 64.4], [-160.78, 64.79], [-161.39, 64.78], [-162.45, 64.56], [-162.76, 64.34], [-163.55, 64.56], [-164.96, 64.45], [-166.43, 64.69], [-166.85, 65.09], [-168.11, 65.67], [-166.71, 66.09], [-164.47, 66.58], [-163.65, 66.58], [-163.79, 66.08], [-161.68, 66.12], [-162.49, 66.74], [-163.72, 67.12], [-164.43, 67.62], [-165.39, 68.04], [-166.76, 68.36], [-166.2, 68.88], [-164.43, 68.92], [-163.17, 69.37], [-162.93, 69.86], [-161.91, 70.33], [-160.93, 70.45], [-159.04, 70.89], [-158.12, 70.82], [-156.58, 71.36], [-155.07, 71.15], [-154.34, 70.7], [-153.9, 70.89], [-152.21, 70.83], [-152.27, 70.6], [-150.74, 70.43], [-149.72, 70.53], [-147.61, 70.21], [-145.69, 70.12], [-144.92, 69.99], [-143.59, 70.15], [-142.07, 69.85], [-140.99, 69.71]]]], "mainOnly": true },
    { "iso": "uy", "name": "Uruguay", "polygons": [[[[-57.63, -30.22], [-56.98, -30.11], [-55.97, -30.88], [-55.6, -30.85], [-54.57, -31.49], [-53.79, -32.05], [-53.21, -32.73], [-53.65, -33.2], [-53.37, -33.77], [-53.81, -34.4], [-54.94, -34.95], [-55.67, -34.75], [-56.22, -34.86], [-57.14, -34.43], [-57.82, -34.46], [-58.43, -33.91], [-58.35, -33.26], [-58.13, -33.04], [-58.14, -32.04], [-57.87, -31.02], [-57.63, -30.22]]]], "mainOnly": true },
    { "iso": "uz", "name": "Uzbekistan", "polygons": [[[[55.97, 41.31], [55.93, 45], [58.5, 45.59], [58.69, 45.5], [60.24, 44.78], [61.06, 44.41], [62.01, 43.5], [63.19, 43.65], [64.9, 43.73], [66.1, 43], [66.02, 41.99], [66.51, 41.99], [66.71, 41.17], [67.99, 41.14], [68.26, 40.66], [68.63, 40.67], [69.07, 41.38], [70.39, 42.08], [70.96, 42.27], [71.26, 42.17], [70.42, 41.52], [71.16, 41.14], [71.87, 41.39], [73.06, 40.87], [71.77, 40.15], [71.01, 40.24], [70.6, 40.22], [70.46, 40.5], [70.67, 40.96], [69.33, 40.73], [69.01, 40.09], [68.54, 39.53], [67.7, 39.58], [67.44, 39.14], [68.18, 38.9], [68.39, 38.16], [67.83, 37.14], [67.08, 37.36], [66.52, 37.36], [66.55, 37.97], [65.22, 38.4], [64.17, 38.89], [63.52, 39.36], [62.37, 40.05], [61.88, 41.08], [61.55, 41.27], [60.47, 41.22], [60.08, 41.43], [59.98, 42.22], [58.63, 42.75], [57.79, 42.17], [56.93, 41.83], [57.1, 41.32], [55.97, 41.31]]]], "mainOnly": true },
    { "iso": "vu", "name": "Vanuatu", "polygons": [[[[167.22, -15.89], [167.84, -16.47], [167.52, -16.6], [167.18, -16.16], [167.22, -15.89]]], [[[166.79, -15.67], [166.65, -15.39], [166.63, -14.63], [167.11, -14.93], [167.27, -15.74], [167, -15.61], [166.79, -15.67]]]], "mainOnly": true },
    { "iso": "ve", "name": "Venezuela", "polygons": [[[[-60.73, 5.2], [-60.6, 4.92], [-60.97, 4.54], [-62.09, 4.16], [-62.8, 4.01], [-63.09, 3.77], [-63.89, 4.02], [-64.63, 4.15], [-64.82, 4.06], [-64.37, 3.8], [-64.41, 3.13], [-64.27, 2.5], [-63.42, 2.41], [-63.37, 2.2], [-64.08, 1.92], [-64.2, 1.49], [-64.61, 1.33], [-65.35, 1.1], [-65.55, 0.79], [-66.33, 0.72], [-66.88, 1.25], [-67.18, 2.25], [-67.45, 2.6], [-67.81, 2.82], [-67.3, 3.32], [-67.34, 3.54], [-67.62, 3.84], [-67.82, 4.5], [-67.74, 5.22], [-67.52, 5.56], [-67.34, 6.1], [-67.7, 6.27], [-68.27, 6.15], [-68.99, 6.21], [-69.39, 6.1], [-70.09, 6.96], [-70.67, 7.09], [-71.96, 6.99], [-72.2, 7.34], [-72.44, 7.42], [-72.48, 7.63], [-72.36, 8], [-72.44, 8.41], [-72.66, 8.63], [-72.79, 9.09], [-73.3, 9.15], [-73.03, 9.74], [-72.91, 10.45], [-72.61, 10.82], [-72.23, 11.11], [-71.97, 11.61], [-71.33, 11.78], [-71.36, 11.54], [-71.95, 11.42], [-71.62, 10.97], [-71.63, 10.45], [-72.07, 9.87], [-71.7, 9.07], [-71.26, 9.14], [-71.04, 9.86], [-71.35, 10.21], [-71.4, 10.97], [-70.16, 11.38], [-70.29, 11.85], [-69.94, 12.16], [-69.58, 11.46], [-68.88, 11.44], [-68.23, 10.89], [-68.19, 10.55], [-67.3, 10.55], [-66.23, 10.65], [-65.66, 10.2], [-64.89, 10.08], [-64.33, 10.39], [-64.32, 10.64], [-63.08, 10.7], [-61.88, 10.72], [-62.73, 10.42], [-62.39, 9.95], [-61.59, 9.87], [-60.83, 9.38], [-60.67, 8.58], [-60.15, 8.6], [-59.76, 8.37], [-60.55, 7.78], [-60.64, 7.42], [-60.3, 7.04], [-60.54, 6.86], [-61.16, 6.7], [-61.14, 6.23], [-61.41, 5.96], [-60.73, 5.2]]]], "mainOnly": true },
    { "iso": "vn", "name": "Vietnam", "polygons": [[[[104.33, 10.49], [105.2, 10.89], [106.25, 10.96], [105.81, 11.57], [107.49, 12.34], [107.61, 13.54], [107.38, 14.2], [107.56, 15.2], [107.31, 15.91], [106.56, 16.6], [105.93, 17.49], [105.09, 18.67], [103.9, 19.27], [104.18, 19.62], [104.82, 19.89], [104.44, 20.76], [103.2, 20.77], [102.75, 21.68], [102.17, 22.46], [102.71, 22.71], [103.5, 22.7], [104.48, 22.82], [105.33, 23.35], [105.81, 22.98], [106.73, 22.79], [106.57, 22.22], [107.04, 21.81], [108.05, 21.55], [106.72, 20.7], [105.88, 19.75], [105.66, 19.06], [106.43, 18], [107.36, 16.7], [108.27, 16.08], [108.88, 15.28], [109.34, 13.43], [109.2, 11.67], [108.37, 11.01], [107.22, 10.36], [106.41, 9.53], [105.16, 8.6], [104.8, 9.24], [105.08, 9.92], [104.33, 10.49]]]], "mainOnly": true },
    { "iso": "eh", "name": "Western Sahara", "polygons": [[[[-8.67, 27.66], [-8.67, 27.59], [-8.68, 27.4], [-8.69, 25.88], [-11.97, 25.93], [-11.94, 23.37], [-12.87, 23.28], [-13.12, 22.77], [-12.93, 21.33], [-16.85, 21.33], [-17.06, 21], [-17.02, 21.42], [-17, 21.42], [-14.75, 21.5], [-14.63, 21.86], [-14.22, 22.31], [-13.89, 23.69], [-12.5, 24.77], [-12.03, 26.03], [-11.72, 26.1], [-11.39, 26.88], [-10.55, 26.99], [-10.19, 26.86], [-9.74, 26.86], [-9.41, 27.09], [-8.79, 27.12], [-8.82, 27.66], [-8.67, 27.66]]]], "mainOnly": true },
    { "iso": "ye", "name": "Yemen", "polygons": [[[[52, 19], [52.78, 17.35], [53.11, 16.65], [52.39, 16.38], [52.19, 15.94], [52.17, 15.6], [51.17, 15.18], [49.57, 14.71], [48.68, 14], [48.24, 13.95], [47.94, 14.01], [47.35, 13.59], [46.72, 13.4], [45.88, 13.35], [45.63, 13.29], [45.41, 13.03], [45.14, 12.95], [44.99, 12.7], [44.49, 12.72], [44.18, 12.59], [43.48, 12.64], [43.22, 13.22], [43.25, 13.77], [43.09, 14.06], [42.89, 14.8], [42.6, 15.21], [42.81, 15.26], [42.7, 15.72], [42.82, 15.91], [42.78, 16.35], [43.22, 16.67], [43.12, 17.09], [43.38, 17.58], [43.79, 17.32], [44.06, 17.41], [45.22, 17.43], [45.4, 17.33], [46.37, 17.23], [46.75, 17.28], [47, 16.95], [47.47, 17.12], [48.18, 18.17], [49.12, 18.62], [52, 19]]]], "mainOnly": true },
    { "iso": "zm", "name": "Zambia", "polygons": [[[[30.74, -8.34], [31.16, -8.59], [31.56, -8.76], [32.19, -8.93], [32.76, -9.23], [33.23, -9.68], [33.49, -10.53], [33.32, -10.8], [33.11, -11.61], [33.31, -12.44], [32.99, -12.78], [32.69, -13.71], [33.21, -13.97], [30.18, -14.8], [30.27, -15.51], [29.52, -15.64], [28.95, -16.04], [28.83, -16.39], [28.47, -16.47], [27.6, -17.29], [27.04, -17.94], [26.71, -17.96], [26.38, -17.85], [25.26, -17.74], [25.08, -17.66], [25.08, -17.58], [24.68, -17.35], [24.03, -17.3], [23.22, -17.52], [22.56, -16.9], [21.89, -16.08], [21.93, -12.9], [24.02, -12.91], [23.93, -12.57], [24.08, -12.19], [23.9, -11.72], [24.02, -11.24], [23.91, -10.93], [24.26, -10.95], [24.31, -11.26], [24.78, -11.24], [25.42, -11.33], [25.75, -11.78], [26.55, -11.92], [27.16, -11.61], [27.39, -12.13], [28.16, -12.27], [28.52, -12.7], [28.93, -13.25], [29.7, -13.26], [29.62, -12.18], [29.34, -12.36], [28.64, -11.97], [28.37, -11.79], [28.5, -10.79], [28.67, -9.61], [28.45, -9.16], [28.73, -8.53], [29, -8.41], [30.35, -8.24], [30.74, -8.34]]]], "mainOnly": true },
    { "iso": "zw", "name": "Zimbabwe", "polygons": [[[[31.19, -22.25], [30.66, -22.15], [30.32, -22.27], [29.84, -22.1], [29.43, -22.09], [28.79, -21.64], [28.02, -21.49], [27.73, -20.85], [27.72, -20.5], [27.3, -20.39], [26.16, -19.29], [25.85, -18.71], [25.65, -18.54], [25.26, -17.74], [26.38, -17.85], [26.71, -17.96], [27.04, -17.94], [27.6, -17.29], [28.47, -16.47], [28.83, -16.39], [28.95, -16.04], [29.52, -15.64], [30.27, -15.51], [30.34, -15.88], [31.17, -15.86], [31.64, -16.07], [31.85, -16.32], [32.33, -16.39], [32.85, -16.71], [32.85, -17.98], [32.65, -18.67], [32.61, -19.42], [32.77, -19.72], [32.66, -20.3], [32.51, -20.4], [32.24, -21.12], [31.19, -22.25]]]], "mainOnly": true }
  ];

  // src/core/countries.ts
  var countries_exports = {};
  __export(countries_exports, {
    buildCountryIndex: () => buildCountryIndex,
    countryCenter: () => countryCenter,
    countryMeta: () => countryMeta,
    findCountryAt: () => findCountryAt,
    mainPolygon: () => mainPolygon,
    polygonCenter: () => polygonCenter
  });

  // src/core/geo.ts
  var geo_exports = {};
  __export(geo_exports, {
    bearingDeg: () => bearingDeg,
    clamp: () => clamp2,
    compassDirection: () => compassDirection,
    haversineKm: () => haversineKm,
    nearestLngInInterval: () => nearestLngInInterval,
    normalizeLng: () => normalizeLng,
    polygonContains: () => polygonContains,
    polygonIntervalsAtLat: () => polygonIntervalsAtLat,
    polygonMeta: () => polygonMeta,
    ringArea: () => ringArea,
    ringContains: () => ringContains,
    ringIntervalsAtLat: () => ringIntervalsAtLat,
    subtractIntervals: () => subtractIntervals,
    unwrapLng: () => unwrapLng
  });
  function clamp2(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function normalizeLng(lng) {
    let value = lng;
    while (value > 180) value -= 360;
    while (value < -180) value += 360;
    return value;
  }
  function unwrapLng(lng, reference) {
    let value = lng;
    while (value - reference > 180) value -= 360;
    while (value - reference < -180) value += 360;
    return value;
  }
  function ringArea(ring) {
    if (!ring.length) return 0;
    const reference = ring[0][0];
    let area3 = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = unwrapLng(ring[i][0], reference);
      const xj = unwrapLng(ring[j][0], reference);
      area3 += xj * ring[i][1] - xi * ring[j][1];
    }
    return Math.abs(area3 / 2);
  }
  function ringContains(lat, lng, ring) {
    if (!ring.length) return false;
    const reference = ring[0][0];
    const x = unwrapLng(lng, reference);
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = unwrapLng(ring[i][0], reference);
      const yi = ring[i][1];
      const xj = unwrapLng(ring[j][0], reference);
      const yj = ring[j][1];
      const intersects = yi > lat !== yj > lat && x < (xj - xi) * (lat - yi) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }
  function polygonContains(lat, lng, rings) {
    if (!rings.length || !ringContains(lat, lng, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (ringContains(lat, lng, rings[i])) return false;
    }
    return true;
  }
  function polygonMeta(rings) {
    const outer = rings[0];
    const reference = outer[0][0];
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of outer) {
      const x = unwrapLng(lng, reference);
      if (x < minLng) minLng = x;
      if (x > maxLng) maxLng = x;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    let area3 = ringArea(outer);
    for (let i = 1; i < rings.length; i++) area3 -= ringArea(rings[i]);
    area3 = Math.max(0, area3);
    const midLat = (minLat + maxLat) / 2;
    const weight = area3 * Math.max(0.05, Math.cos(midLat * DEG));
    return { rings, minLng, maxLng, minLat, maxLat, area: area3, weight };
  }
  function ringIntervalsAtLat(ring, lat, reference) {
    const crossings = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = unwrapLng(ring[i][0], reference);
      const yi = ring[i][1];
      const xj = unwrapLng(ring[j][0], reference);
      const yj = ring[j][1];
      if (yi > lat === yj > lat) continue;
      crossings.push(xi + (lat - yi) * (xj - xi) / (yj - yi));
    }
    crossings.sort((a, b) => a - b);
    const intervals = [];
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      intervals.push([crossings[i], crossings[i + 1]]);
    }
    return intervals;
  }
  function subtractIntervals(intervals, holes) {
    let result = intervals;
    for (const [holeMin, holeMax] of holes) {
      const next = [];
      for (const [min, max] of result) {
        if (max <= holeMin || min >= holeMax) {
          next.push([min, max]);
          continue;
        }
        if (min < holeMin) next.push([min, holeMin]);
        if (holeMax < max) next.push([holeMax, max]);
      }
      result = next;
    }
    return result.filter(([min, max]) => max > min);
  }
  function polygonIntervalsAtLat(polygon, lat) {
    if (!polygon?.rings.length) return [];
    const reference = polygon.rings[0][0][0];
    const outer = ringIntervalsAtLat(polygon.rings[0], lat, reference);
    const holes = [];
    for (let i = 1; i < polygon.rings.length; i++)
      holes.push(...ringIntervalsAtLat(polygon.rings[i], lat, reference));
    return subtractIntervals(outer, holes);
  }
  function nearestLngInInterval(interval, centerLng) {
    const [min, max] = interval;
    const width = max - min;
    if (width <= 1e-9) return null;
    const pad = Math.min(width * 5e-3, 2e-3);
    const low = min + pad;
    const high = max - pad;
    if (low > high) return (min + max) / 2;
    return clamp2(centerLng, low, high);
  }
  function haversineKm(lat1, lng1, lat2, lng2) {
    const values = [lat1, lng1, lat2, lng2].map(Number);
    if (values.some((value) => !Number.isFinite(value))) return Infinity;
    const [aLat, aLng, bLat, bLng] = values;
    const toRadians = Math.PI / 180;
    const dLat = (bLat - aLat) * toRadians;
    const dLng = (bLng - aLng) * toRadians;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRadians) * Math.cos(bLat * toRadians) * Math.sin(dLng / 2) ** 2;
    return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearingDeg(lat1, lng1, lat2, lng2) {
    const values = [lat1, lng1, lat2, lng2].map(Number);
    if (values.some((value) => !Number.isFinite(value))) return NaN;
    const [aLat, aLng, bLat, bLng] = values;
    const toRadians = Math.PI / 180;
    const phi1 = aLat * toRadians;
    const phi2 = bLat * toRadians;
    const delta = (bLng - aLng) * toRadians;
    const y = Math.sin(delta) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(delta);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function compassDirection(bearing) {
    const value = Number(bearing);
    if (!Number.isFinite(value)) return "";
    const directions = [
      "north",
      "northeast",
      "east",
      "southeast",
      "south",
      "southwest",
      "west",
      "northwest"
    ];
    return directions[Math.round((value % 360 + 360) % 360 / 45) % 8];
  }

  // src/core/countries.ts
  function countryMeta(feature) {
    const polygons = feature.polygons.map(polygonMeta).filter((polygon) => polygon.area > 0);
    let totalWeight = 0;
    for (const polygon of polygons) totalWeight += polygon.weight;
    return {
      iso: feature.iso.toLowerCase(),
      name: feature.name,
      polygons,
      mainOnly: feature.mainOnly !== false,
      totalWeight
    };
  }
  function buildCountryIndex(data, config = CONFIG) {
    const enabled = config.enabledCountries;
    const excluded = new Set(
      (config.excludeCountries || []).map((code) => String(code).toLowerCase())
    );
    const all = data.map(countryMeta);
    const byIso = new Map(all.map((country) => [country.iso, country]));
    let selected;
    if (enabled === "all" || enabled == null) {
      selected = all;
    } else {
      const codes = new Set(
        (Array.isArray(enabled) ? enabled : [enabled]).map((code) => String(code).toLowerCase())
      );
      selected = all.filter((country) => codes.has(country.iso));
    }
    selected = selected.filter((country) => !excluded.has(country.iso));
    const unknown = [];
    if (enabled !== "all" && enabled != null) {
      const codes = new Set(
        (Array.isArray(enabled) ? enabled : [enabled]).map((code) => String(code).toLowerCase())
      );
      for (const code of codes) {
        if (!byIso.has(code)) unknown.push(code);
      }
    }
    for (const code of excluded) {
      if (!byIso.has(code)) unknown.push(code);
    }
    return { all, selected, byIso, unknown };
  }
  function findCountryAt(lat, lng, index) {
    let best = null;
    for (const country of index.selected) {
      for (const polygon of country.polygons) {
        if (lat < polygon.minLat || lat > polygon.maxLat) continue;
        let inBox = false;
        for (const x of [lng, lng + 360, lng - 360]) {
          if (x >= polygon.minLng && x <= polygon.maxLng) {
            inBox = true;
            break;
          }
        }
        if (!inBox) continue;
        if (!polygonContains(lat, lng, polygon.rings)) continue;
        if (!best || polygon.area < best.polygon.area) best = { country, polygon };
      }
    }
    return best;
  }
  function polygonCenter(polygon) {
    if (!polygon?.rings.length) return null;
    if (polygon.center) return polygon.center;
    const centerLat = (polygon.minLat + polygon.maxLat) / 2;
    const centerLng = (polygon.minLng + polygon.maxLng) / 2;
    if (polygonContains(centerLat, normalizeLng(centerLng), polygon.rings)) {
      const center2 = { lat: centerLat, lng: normalizeLng(centerLng) };
      polygon.center = center2;
      return center2;
    }
    const halfHeight = (polygon.maxLat - polygon.minLat) / 2 || 1;
    const halfWidth = (polygon.maxLng - polygon.minLng) / 2 || 1;
    let best = null;
    const steps = 129;
    for (let index = 0; index <= steps; index++) {
      const lat = polygon.minLat + (polygon.maxLat - polygon.minLat) * (index / steps);
      const distanceY = Math.abs(lat - centerLat) / halfHeight;
      if (best && distanceY > best.distance) continue;
      for (const interval of polygonIntervalsAtLat(polygon, lat)) {
        const lng = nearestLngInInterval(interval, centerLng);
        if (lng === null) continue;
        const distanceX = Math.abs(lng - centerLng) / halfWidth;
        const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
        if (!best || distance < best.distance) best = { lat, lng, distance };
      }
    }
    if (best) {
      const center2 = { lat: best.lat, lng: normalizeLng(best.lng) };
      polygon.center = center2;
      return center2;
    }
    const vertex = polygon.rings[0][Math.floor(polygon.rings[0].length / 2)] || polygon.rings[0][0];
    const center = { lat: vertex[1], lng: normalizeLng(vertex[0]) };
    polygon.center = center;
    return center;
  }
  function mainPolygon(country) {
    if (!country?.polygons.length) return null;
    return country.polygons.reduce((a, b) => a.area >= b.area ? a : b, country.polygons[0]);
  }
  function countryCenter(country) {
    if (!country?.polygons.length) return null;
    if (country.center && country.span) return country.center;
    const main = mainPolygon(country);
    const reference = main ? main.rings[0][0][0] : country.polygons[0].rings[0][0][0];
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const polygon of country.polygons) {
      for (const [lng, lat] of polygon.rings[0]) {
        const x = unwrapLng(lng, reference);
        if (x < minLng) minLng = x;
        if (x > maxLng) maxLng = x;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    const center = { lat: (minLat + maxLat) / 2, lng: normalizeLng((minLng + maxLng) / 2) };
    country.center = center;
    country.span = { minLat, maxLat, minLng, maxLng };
    return center;
  }

  // src/core/config.ts
  var ACTIVATION_KEYS = ["none", "shift", "alt", "ctrl", "meta"];
  function filterCountryOptions(data, query2, { limit = 8, exclude = [] } = {}) {
    if (!Array.isArray(data) || !data.length) return [];
    const text = String(query2 ?? "").trim().toLowerCase();
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
    const seen = /* @__PURE__ */ new Set();
    const options = [];
    for (const { country, exact } of results) {
      if (seen.has(country.iso)) continue;
      seen.add(country.iso);
      options.push({ iso: country.iso, name: country.name, exact });
    }
    options.sort((a, b) => Number(b.exact) - Number(a.exact) || a.name.localeCompare(b.name));
    return options.slice(0, Math.max(1, limit));
  }
  function resolveConfig(config = CONFIG, data = COUNTRY_DATA) {
    const animationMs = clamp2(Number(config.animationMs) || 2800, 200, 1e4);
    const centerBias = clamp2(Number(config.centerBias) || 0, 0, 1);
    const startIntervalMs = clamp2(Number(config.startIntervalMs) || 45, 10, 1e3);
    const endIntervalMs = clamp2(Number(config.endIntervalMs) || 320, startIntervalMs, 3e3);
    const finalHoldMs = clamp2(Number(config.finalHoldMs) || 0, 0, 3e3);
    const volume = clamp2(Number(config.volume) || 0, 0, 1);
    const activationKey = ACTIVATION_KEYS.includes(config.activationKey) ? config.activationKey : "none";
    const settings = {
      enabledCountries: config.enabledCountries ?? "all",
      excludeCountries: Array.isArray(config.excludeCountries) ? config.excludeCountries : [],
      animationMs,
      startIntervalMs,
      endIntervalMs,
      finalHoldMs,
      sound: config.sound !== false,
      volume,
      autoSubmit: config.autoSubmit === true,
      submitDelayMs: clamp2(
        Number.isFinite(Number(config.submitDelayMs)) ? Number(config.submitDelayMs) : 250,
        0,
        5e3
      ),
      duelSubmitPin: config.duelSubmitPin !== false && config.duelSubmitPin !== 0,
      duelSubmitHop: config.duelSubmitHop === true,
      activationKey,
      allowOtherModes: config.allowOtherModes !== false,
      perfTweaks: config.perfTweaks !== false,
      centerBias,
      heatmapOverlay: config.heatmapOverlay === true,
      debug: config.debug === true
    };
    const index = buildCountryIndex(data, settings);
    return { settings, index };
  }

  // src/config.ts
  var countryList = (value) => {
    if (value === "all") return "all";
    if (!Array.isArray(value)) return void 0;
    return [
      ...new Set(
        value.map((item) => String(item).toLowerCase()).filter((item) => /^[a-z]{2}$/.test(item))
      )
    ];
  };
  var excludedList = (value) => {
    if (!Array.isArray(value)) return void 0;
    return [
      ...new Set(
        value.map((item) => String(item).toLowerCase()).filter((item) => /^[a-z]{2}$/.test(item))
      )
    ];
  };
  var geogambleConfig = defineConfig({
    key: "gg.geogamble.config",
    version: 1,
    write: "diff",
    fields: {
      enabledCountries: {
        type: "custom",
        control: "country-list",
        default: CONFIG_DEFAULTS.enabledCountries,
        parse: countryList,
        label: "Enabled countries",
        section: "countries",
        order: 10
      },
      excludeCountries: {
        type: "custom",
        control: "country-list",
        default: CONFIG_DEFAULTS.excludeCountries,
        parse: excludedList,
        label: "Excluded countries",
        section: "countries",
        order: 11
      },
      animationMs: {
        type: "number",
        default: CONFIG_DEFAULTS.animationMs,
        min: 200,
        max: 1e4,
        step: 100,
        label: "Animation length",
        hint: "Milliseconds the pin shuffles around.",
        section: "gamble",
        order: 20
      },
      startIntervalMs: {
        type: "number",
        default: CONFIG_DEFAULTS.startIntervalMs,
        hidden: true,
        min: 10,
        max: 1e3
      },
      endIntervalMs: {
        type: "number",
        default: CONFIG_DEFAULTS.endIntervalMs,
        hidden: true,
        min: 10,
        max: 3e3
      },
      finalHoldMs: {
        type: "number",
        default: CONFIG_DEFAULTS.finalHoldMs,
        hidden: true,
        min: 0,
        max: 3e3
      },
      sound: {
        type: "boolean",
        default: CONFIG_DEFAULTS.sound,
        label: "Sound",
        hint: "Ticks and the final chime.",
        section: "audio",
        order: 40
      },
      volume: {
        type: "range",
        default: CONFIG_DEFAULTS.volume,
        min: 0,
        max: 1,
        step: 0.05,
        label: "Volume",
        section: "audio",
        order: 41
      },
      autoSubmit: {
        type: "boolean",
        default: CONFIG_DEFAULTS.autoSubmit,
        label: "Auto submit",
        hint: "Click the guess button after the final pin.",
        section: "submit",
        order: 30
      },
      submitDelayMs: {
        type: "number",
        default: CONFIG_DEFAULTS.submitDelayMs,
        min: 0,
        max: 5e3,
        step: 50,
        label: "Submit delay",
        hint: "Milliseconds before auto submit starts.",
        section: "submit",
        order: 31
      },
      duelSubmitPin: {
        type: "boolean",
        default: CONFIG_DEFAULTS.duelSubmitPin,
        label: "Submit duel plonk",
        hint: "Record the final pin on the duel WebSocket at click time.",
        section: "submit",
        order: 32
      },
      duelSubmitHop: {
        type: "boolean",
        default: CONFIG_DEFAULTS.duelSubmitHop,
        label: "Submit per hop",
        hint: "Also record every animation hop during duels.",
        section: "submit",
        order: 33
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
          label: key === "none" ? "No key required" : key[0].toUpperCase() + key.slice(1)
        }))
      },
      allowOtherModes: {
        type: "boolean",
        default: CONFIG_DEFAULTS.allowOtherModes,
        label: "Other modes",
        hint: "Attempt map discovery outside standard games.",
        section: "misc",
        order: 50
      },
      perfTweaks: {
        type: "boolean",
        default: CONFIG_DEFAULTS.perfTweaks,
        label: "Performance tweaks",
        section: "misc",
        order: 51
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
        order: 22
      },
      heatmapOverlay: {
        type: "boolean",
        default: CONFIG_DEFAULTS.heatmapOverlay,
        label: "Center heatmap",
        hint: "Debug overlay showing the active center-bias probability field.",
        section: "misc",
        order: 52
      },
      debug: {
        type: "boolean",
        default: CONFIG_DEFAULTS.debug,
        label: "Debug logs",
        section: "misc",
        order: 53
      }
    }
  });

  // src/core/cases.ts
  var cases_exports = {};
  __export(cases_exports, {
    buildCaseHint: () => buildCaseHint,
    caseAreaFilterPlan: () => caseAreaFilterPlan,
    caseBandRects: () => caseBandRects,
    caseBorderBand: () => caseBorderBand,
    caseCompositeGeometry: () => caseCompositeGeometry,
    caseHintBounds: () => caseHintBounds,
    caseHintCountryMatches: () => caseHintCountryMatches,
    caseHintEligible: () => caseHintEligible,
    caseHintHasOverlay: () => caseHintHasOverlay,
    caseHintIsAreaHint: () => caseHintIsAreaHint,
    caseLatitudeBand: () => caseLatitudeBand,
    caseModeAllowed: () => caseModeAllowed,
    caseRarity: () => caseRarity,
    caseRoundKey: () => caseRoundKey,
    coordinateHintBounds: () => coordinateHintBounds,
    countryFlagEmoji: () => countryFlagEmoji,
    distanceToBorderKm: () => distanceToBorderKm,
    formatCoordinate: () => formatCoordinate,
    formatCoordinates: () => formatCoordinates,
    normalizeCaseSnapshot: () => normalizeCaseSnapshot,
    offsetRadiusCenter: () => offsetRadiusCenter,
    pickCaseCrateOutcome: () => pickCaseCrateOutcome,
    pickCaseHint: () => pickCaseHint,
    roundCoordinate: () => roundCoordinate,
    segmentDistanceKm: () => segmentDistanceKm
  });

  // src/core/environment.ts
  var environment_exports = {};
  __export(environment_exports, {
    CLIMATE_CATEGORIES: () => CLIMATE_CATEGORIES,
    climateAt: () => climateAt,
    climateRegionsFor: () => climateRegionsFor,
    countryTraits: () => countryTraits,
    densityBand: () => densityBand,
    elevationBand: () => elevationBand,
    nearestMajorCity: () => nearestMajorCity
  });

  // src/core/cities.generated.js
  var MAJOR_CITIES = [["Clermont-Ferrand", 45.779982, 3.080008, "fr", 233050], ["Jinja", 0.440424, 33.199927, "ug", 301619], ["Arua", 3.02037, 30.900015, "ug", 25e4], ["Mbale", 1.09041, 34.169997, "ug", 402368], ["Bologna", 44.500422, 11.340021, "it", 488172], ["Cagliari", 39.222398, 9.103981, "it", 291511], ["Bari", 41.11422, 16.872758, "it", 500577], ["Trieste", 45.650378, 13.800026, "it", 216035], ["Gifu", 35.423095, 136.762753, "jp", 412895], ["Nantes", 47.210386, -1.590017, "fr", 438537], ["Montpellier", 43.610399, 3.869986, "fr", 327254], ["Orleans", 47.900421, 1.900028, "fr", 217301], ["Rouen", 49.430405, 1.079975, "fr", 532559], ["Nancy", 48.683681, 6.200024, "fr", 268976], ["Novi Sad", 45.250376, 19.849941, "rs", 225457], ["Banja Luka", 44.780405, 17.179974, "ba", 221738], ["Edinburgh", 55.948328, -3.219091, "gb", 504966], ["Cardiff", 51.482619, -3.167598, "gb", 861400], ["Luxembourg", 49.61166, 6.130003, "lu", 107260], ["Turin", 45.072333, 7.668015, "it", 1652e3], ["Matsuyama", 33.845543, 132.765839, "jp", 533541], ["Rennes", 48.100021, -1.670012, "fr", 209375], ["Toulouse", 43.621905, 1.447981, "fr", 847e3], ["Lille", 50.651915, 3.078062, "fr", 1044e3], ["Strasbourg", 48.579966, 7.750007, "fr", 439972], ["Funchal", 32.649983, -16.88004, "pt", 204767], ["El Fasher", 13.629981, 25.350018, "sd", 252609], ["Genoa", 44.409988, 8.930039, "it", 647497], ["San Bernardino", 34.12233, -117.30198, "us", 1745e3], ["Bridgeport", 41.181925, -73.201907, "us", 1018e3], ["Rochester", 43.172371, -77.621896, "us", 755e3], ["Manchester", 53.47532, -2.248685, "gb", 223e4], ["Gujranwala", 32.162372, 74.183076, "pk", 1513e3], ["Incheon", 37.478094, 126.640288, "kr", 255e4], ["Benin City", 6.342423, 5.618062, "ng", 119e4], ["Xiamen", 24.451938, 118.078071, "cn", 2519e3], ["Nanchong", 30.782378, 106.128051, "cn", 2174e3], ["Neijiang", 29.582323, 105.048066, "cn", 1466e3], ["Nanyang", 33.002346, 112.528074, "cn", 1944e3], ["Jinxi", 40.752287, 120.828033, "cn", 2426e3], ["Yantai", 37.532354, 121.398075, "cn", 2116e3], ["Zaozhuang", 34.881947, 117.568077, "cn", 2145e3], ["Suzhou", 31.302424, 120.618071, "cn", 165e4], ["Xuzhou", 34.281958, 117.178074, "cn", 2091e3], ["Wuxi", 31.581942, 120.298039, "cn", 1749e3], ["Jilin", 43.851917, 126.548097, "cn", 2396e3], ["Chandigarh", 30.721943, 76.77806, "in", 979e3], ["Jammu", 32.713733, 74.844793, "in", 791e3], ["Sholapur", 17.672352, 75.898062, "in", 1057e3], ["Aurangabad", 19.861686, 75.328948, "in", 1113e3], ["Nasik", 20.002365, 73.778036, "in", 1473e3], ["Jullundur", 31.336866, 75.567074, "in", 855e3], ["Allahabad", 25.456941, 81.838061, "in", 1201e3], ["Moradabad", 28.843737, 78.754838, "in", 787e3], ["Ghaziabad", 28.662327, 77.406445, "in", 1341e3], ["Agra", 27.172366, 78.013075, "in", 1592e3], ["Aligarh", 27.894157, 78.059842, "in", 805e3], ["Meerut", 29.002358, 77.698055, "in", 1398e3], ["Dhanbad", 23.802339, 86.41804, "in", 1246e3], ["Gwalior", 26.200035, 78.169197, "in", 978e3], ["Vadodara", 22.311965, 73.178073, "in", 1756e3], ["Rajkot", 22.311965, 70.798063, "in", 126e4], ["St. Paul", 44.943987, -93.084975, "us", 734854], ["Spokane", 47.669996, -117.419949, "us", 347705], ["Vancouver", 45.630301, -122.639993, "us", 525802], ["Tucson", 32.206943, -110.891932, "us", 823e3], ["Fresno", 36.747717, -119.772984, "us", 616353], ["Colorado Springs", 38.862963, -104.791986, "us", 493654], ["Reno", 39.529976, -119.82001, "us", 328585], ["Albuquerque", 35.104975, -106.641331, "us", 898642], ["Salem", 44.92807, -123.023897, "us", 229010], ["Kansas City", 39.109034, -94.60604, "us", 1469e3], ["Tulsa", 36.120003, -95.930021, "us", 946962], ["Shreveport", 32.500017, -93.770023, "us", 248053], ["Baton Rouge", 30.457946, -91.140158, "us", 422072], ["Ft. Worth", 32.739977, -97.340038, "us", 1440454], ["Corpus Christi", 27.742814, -97.401895, "us", 277454], ["Austin", 30.268895, -97.744724, "us", 1161e3], ["El Paso", 31.78193, -106.511941, "us", 753e3], ["Laredo", 27.506136, -99.507218, "us", 434768], ["Merida", 8.56952, -71.182522, "ve", 345489], ["Tallahassee", 30.449988, -84.280034, "us", 221222], ["Orlando", 28.511923, -81.381976, "us", 135e4], ["Jacksonville", 30.331967, -81.671933, "us", 988e3], ["Columbia", 33.996861, -81.031262, "us", 398093], ["Indianapolis", 39.751934, -86.171994, "us", 1436e3], ["Knoxville", 35.970012, -83.92003, "us", 655400], ["Richmond", 37.551965, -77.451932, "us", 912e3], ["Baltimore", 39.281516, -76.614582, "us", 2255e3], ["Syracuse", 43.049994, -76.150014, "us", 662577], ["Port-of-Spain", 10.651997, -61.517031, "tt", 294934], ["Sousse", 35.829995, 10.625026, "tn", 327004], ["Taizz", 13.606398, 44.037474, "ye", 751e3], ["Lvov", 49.83498, 24.029995, "ua", 803880], ["Odessa", 46.491962, 30.708055, "ua", 991e3], ["Zhytomyr", 50.245575, 28.662167, "ua", 282192], ["Dnipro", 48.481918, 34.998078, "ua", 105e4], ["Donetsk", 48.001947, 37.828034, "ua", 988e3], ["Kharkiv", 50.001929, 36.248079, "ua", 1461e3], ["Bukhara", 39.780012, 64.43001, "uz", 319476], ["Nukus", 42.470003, 59.615007, "uz", 230006], ["Turkmenabat", 39.110002, 63.580036, "tm", 234817], ["Andijon", 40.790002, 72.339967, "uz", 65e4], ["Haiphong", 20.831952, 106.678147, "vn", 1969e3], ["Da Nang", 16.060039, 108.249971, "vn", 1e6], ["Kitwe", -12.810033, 28.220024, "zm", 404901], ["Chitungwiza", -18.000001, 31.100003, "zw", 340360], ["Douala", 4.062356, 9.708045, "cm", 1906e3], ["Birmingham", 52.47692, -1.921943, "gb", 2285e3], ["Belfast", 54.594245, -5.928178, "gb", 450406], ["Izmir", 38.438096, 27.149848, "tr", 2587e3], ["Bursa", 40.201933, 29.068052, "tr", 1492e3], ["Samsun", 41.279998, 36.343663, "tr", 609339], ["Konya", 37.876958, 32.473064, "tr", 919e3], ["Adana", 36.996935, 35.318058, "tr", 1293e3], ["Kigali", -1.951644, 30.058586, "rw", 86e4], ["Cordoba", 37.879999, -4.770004, "es", 321376], ["Maradi", 13.491643, 7.096404, "ne", 232555], ["Constanta", 44.202662, 28.609974, "ro", 303399], ["Iasi", 47.168347, 27.574947, "ro", 325914], ["Chiang Mai", 18.799975, 98.980046, "th", 397211], ["Nakhon Ratchasima", 15.000026, 102.10001, "th", 334984], ["Mbabane", -26.316651, 31.133335, "sz", 90138], ["Piura", -5.210032, -80.629973, "pe", 396932], ["Arequipa", -16.418048, -71.531957, "pe", 815e3], ["Chimbote", -9.070003, -78.569995, "pe", 349846], ["Pucallpa", -8.368909, -74.534996, "pe", 310750], ["Iquitos", -3.750018, -73.25001, "pe", 458729], ["Huancayo", -12.08, -75.20002, "pe", 412733], ["Ciudad del Este", -25.5167, -54.616057, "py", 320872], ["Vigo", 42.220019, -8.729995, "es", 378952], ["Bilbao", 43.249981, -2.929987, "es", 875552], ["Kaolack", 14.149975, -16.10001, "sn", 277812], ["Medina", 24.501935, 39.578057, "sa", 101e4], ["Tabuk", 28.383835, 36.554967, "sa", 547957], ["Omdurman", 15.616681, 32.480022, "sd", 2395159], ["El Obeid", 13.18329, 30.216698, "sd", 393311], ["The Hague", 52.080037, 4.269961, "nl", 1406e3], ["Ljubljana", 46.055288, 14.514969, "si", 314807], ["Bratislava", 48.150018, 17.116981, "sk", 423737], ["Doha", 25.286556, 51.532968, "qa", 145e4], ["Quetta", 30.221947, 67.023048, "pk", 768e3], ["Larkana", 27.561766, 68.206782, "pk", 364033], ["Nampula", -15.136041, 39.293043, "mz", 388526], ["Welkom", -27.969987, 26.729986, "za", 431944], ["Oujda", 34.690013, -1.909972, "ma", 409391], ["Safi", 32.319977, -9.239989, "ma", 353476], ["Podgorica", 42.465972, 19.266307, "me", 145850], ["East London", -32.970043, 27.87002, "za", 338627], ["Naltchik", 43.498106, 43.617947, "ru", 307866], ["Stavropol", 45.050001, 41.980011, "ru", 363064], ["Kaliningrad", 54.700006, 20.497343, "ru", 434954], ["Pskov", 57.829996, 28.32994, "ru", 201990], ["Bryansk", 53.259991, 34.429981, "ru", 427236], ["Smolensk", 54.782688, 32.047336, "ru", 320991], ["Petrozavodsk", 61.781318, 34.361223, "ru", 265025], ["Tver", 56.859978, 35.889995, "ru", 400212], ["Vologda", 59.209989, 39.919982, "ru", 294889], ["Yaroslavl", 57.619983, 39.87001, "ru", 606730], ["Rostov", 47.236594, 39.71071, "ru", 1052e3], ["Sochi", 43.590012, 39.729967, "ru", 327608], ["Krasnodar", 45.019977, 39.000038, "ru", 649851], ["Penza", 53.180021, 44.999982, "ru", 512602], ["Ryazan", 54.619959, 39.719994, "ru", 520173], ["Voronezh", 51.66539, 39.186843, "ru", 844e3], ["Magnitogorsk", 53.422694, 58.980007, "ru", 413351], ["Chelyabinsk", 55.156937, 61.436722, "ru", 1091e3], ["Kirov", 58.590053, 49.669981, "ru", 457437], ["Nizhny Tagil", 57.920016, 59.974985, "ru", 381116], ["Astrakhan", 46.348655, 48.054989, "ru", 502533], ["Orenburg", 51.779978, 55.110011, "ru", 550204], ["Saratov", 51.581936, 46.02805, "ru", 843e3], ["Ulyanovsk", 54.329977, 48.410006, "ru", 640680], ["Omsk", 54.991934, 73.398008, "ru", 1135e3], ["Tyumen", 57.140012, 65.529995, "ru", 519119], ["Novokuznetsk", 53.750012, 87.114982, "ru", 539616], ["Kemerovo", 55.339967, 86.08998, "ru", 477090], ["Groznyy", 43.318685, 45.698699, "ru", 226100], ["Daejeon", 36.337491, 127.423082, "kr", 1468e3], ["Gwangju", 35.172911, 126.908488, "kr", 144e4], ["Busan", 35.096999, 129.008102, "kr", 348e4], ["Zamboanga", 6.921923, 122.078085, "ph", 773e3], ["Laoag", 18.198849, 120.59361, "ph", 207048], ["Baguio City", 16.429991, 120.569943, "ph", 447824], ["General Santos", 6.110827, 125.174726, "ph", 950530], ["Angarsk", 52.560007, 103.920003, "ru", 243158], ["Ulan Ude", 51.824988, 107.624996, "ru", 360278], ["Blagoveshchensk", 50.266607, 127.533342, "ru", 221296], ["Khabarovsk", 48.454987, 135.120011, "ru", 579e3], ["Mexicali", 32.651928, -115.481962, "mx", 885e3], ["Torreon", 25.571999, -103.421949, "mx", 1144e3], ["Culiacan", 24.831941, -107.381914, "mx", 809e3], ["Hermosillo", 29.098881, -110.954065, "mx", 595811], ["San Luis Potosi", 22.171922, -101.001941, "mx", 992e3], ["Matamoros", 25.879982, -97.500002, "mx", 538785], ["Nuevo Laredo", 27.499987, -99.550007, "mx", 349550], ["Colima", 19.229975, -103.72001, "mx", 223287], ["Campeche", 19.82999, -90.49999, "mx", 205212], ["Oaxaca", 17.08269, -96.66995, "mx", 530728], ["Leon", 21.151933, -101.701976, "mx", 1488e3], ["Maiduguri", 11.851906, 13.158067, "ng", 896e3], ["Port Harcourt", 4.811948, 7.008055, "ng", 102e4], ["Makurdi", 7.729979, 8.530011, "ng", 292645], ["Ibadan", 7.381972, 3.928036, "ng", 2628e3], ["Ogbomosho", 8.131952, 4.238043, "ng", 951e3], ["Warri", 5.519959, 5.76, "ng", 830106], ["Kaduna", 10.521961, 7.438054, "ng", 1442e3], ["Gdansk", 54.359975, 18.64004, "pl", 74e4], ["Krakow", 50.061925, 19.958066, "pl", 756e3], ["Wonsan", 39.160489, 127.430816, "kp", 329207], ["Sinuiju", 40.085859, 124.421284, "kp", 288112], ["Mwanza", -2.520015, 32.930021, "tz", 493944], ["Morogoro", -6.820011, 37.660016, "tz", 250902], ["Dodoma", -6.183306, 35.750004, "tz", 218269], ["Arusha", -3.360016, 36.669999, "tz", 341136], ["Bern", 46.916683, 7.466976, "ch", 275329], ["Malmo", 55.599424, 13.02306, "se", 269349], ["Ambon", -3.716687, 128.200019, "id", 355596], ["Florence", 43.780001, 11.25, "it", 15e5], ["Catania", 37.499971, 15.079999, "it", 674542], ["Eldoret", 0.520006, 35.269981, "ke", 353381], ["Banda Aceh", 5.549983, 95.320011, "id", 513698], ["George Town", 5.413613, 100.329368, "my", 25e5], ["Zhangye", 38.929987, 100.450034, "cn", 230728], ["Wuwei", 37.928007, 102.641011, "cn", 493092], ["Tianshui", 34.601964, 105.918038, "cn", 1225e3], ["Yulin", 22.63192, 110.148064, "cn", 1127e3], ["Wuzhou", 23.480025, 111.320016, "cn", 442315], ["Liupanshui", 26.596381, 104.831386, "cn", 1221e3], ["Quanzhou", 24.901962, 118.578041, "cn", 1463e3], ["Hefei", 31.851977, 117.278068, "cn", 2035e3], ["Suzhou", 33.638057, 116.976943, "cn", 1964e3], ["Zhanjiang", 21.20193, 110.378076, "cn", 159e4], ["Shaoguan", 24.799971, 113.579982, "cn", 720266], ["Balikpapan", -1.250015, 116.830016, "id", 445905], ["Kuching", 1.52997, 110.329999, "my", 570407], ["Surakarta", -7.564979, 110.825008, "id", 555308], ["Bandar Lampung", -5.428073, 105.268052, "id", 865e3], ["Malang", -7.978046, 112.608069, "id", 805e3], ["Kupang", -10.178669, 123.582989, "id", 282396], ["Cuenca", -2.899992, -78.999995, "ec", 286878], ["Santiago de Cuba", 20.025017, -75.821326, "cu", 555865], ["Santiago", 19.50001, -70.670012, "do", 1550753], ["Manizales", 5.059987, -75.52, "co", 375848], ["Pasto", 1.213607, -77.281107, "co", 382236], ["Barranquilla", 10.961934, -74.801913, "co", 1798e3], ["Mbandaka", 0.040035, 18.260012, "cd", 274996], ["Suez", 30.004976, 32.549941, "eg", 508335], ["Bur Said", 31.25999, 32.290008, "eg", 623864], ["El Faiyum", 29.310031, 30.839967, "eg", 316772], ["Aswan", 24.087508, 32.898911, "eg", 313442], ["Asyut", 27.18998, 31.179947, "eg", 420585], ["Kisangani", 0.520006, 25.22, "cd", 578470], ["Djibouti", 11.595014, 43.148002, "dj", 923e3], ["Dresden", 51.049971, 13.750003, "de", 617515], ["Shache", 38.426142, 77.250003, "cn", 851374], ["Yining", 43.900019, 81.350011, "cn", 542507], ["Ankang", 32.679981, 109.020002, "cn", 11e5], ["Yueyang", 29.381999, 113.098065, "cn", 826e3], ["Hengyang", 26.881971, 112.58807, "cn", 1016e3], ["Mianyang", 31.464828, 104.689993, "cn", 1396e3], ["Xichang", 27.880015, 102.299998, "cn", 379993], ["Baoshan", 25.119977, 99.15001, "cn", 1e6], ["Shijiazhuang", 38.05196, 114.478032, "cn", 2417e3], ["Handan", 36.581921, 114.478032, "cn", 1631e3], ["Anshan", 41.116967, 122.938085, "cn", 1639e3], ["Dalian", 38.924784, 121.627885, "cn", 3167e3], ["Qingdao", 36.091925, 120.328063, "cn", 2866e3], ["Linyi", 35.081935, 118.32803, "cn", 2082e3], ["Huaiyin", 33.585165, 119.065967, "cn", 1264e3], ["Wenzhou", 28.021927, 120.648147, "cn", 235e4], ["Ningbo", 29.881917, 121.548092, "cn", 1923e3], ["Fukuoka", 33.596961, 130.408068, "jp", 2792e3], ["Miyazaki", 31.918244, 131.418376, "jp", 324384], ["Naha", 26.207172, 127.672972, "jp", 905238], ["Kochi", 33.562433, 133.537523, "jp", 335570], ["Gorontalo", 0.549978, 123.070048, "id", 365497], ["Tongliao", 43.621905, 122.268048, "cn", 884e3], ["Hohhot", 40.821921, 111.65805, "cn", 1726e3], ["Chifeng", 42.271961, 118.948044, "cn", 1277e3], ["Ulanhot", 46.080016, 122.080031, "cn", 241894], ["Hailar", 49.19998, 119.700022, "cn", 231171], ["Jiamusi", 46.831967, 130.348072, "cn", 102e4], ["Daqing", 46.581905, 124.998062, "cn", 1693e3], ["Jixi", 45.301906, 130.968085, "cn", 965e3], ["Nagoya", 35.156943, 136.913046, "jp", 323e4], ["Nagano", 36.649997, 138.170005, "jp", 594311], ["Hakodate", 41.79498, 140.739978, "jp", 302984], ["Kyoto", 35.031938, 135.748052, "jp", 1805e3], ["Sendai", 38.268441, 140.869667, "jp", 225e4], ["Kananga", -5.888096, 22.398072, "cd", 765e3], ["Mbuji-Mayi", -6.148081, 23.59805, "cd", 1295e3], ["Kalemie", -5.933295, 29.200016, "cd", 206257], ["Butembo", 0.130004, 29.280011, "cd", 286403], ["Blantyre", -15.790007, 34.989947, "mw", 584877], ["Quetzaltenango", 14.829959, -91.520006, "gt", 575263], ["Banjul", 13.453876, -16.591701, "gm", 43094], ["Faridabad", 28.435279, 77.314721, "in", 1394e3], ["Srinagar", 34.069474, 74.828309, "in", 114e4], ["Vijayawada", 16.521905, 80.628057, "in", 1137e3], ["Thiruvananthapuram", 8.515521, 76.925191, "in", 954e3], ["Kochi", 10.016953, 76.22197, "in", 1519e3], ["Cuttack", 20.470002, 85.889941, "in", 58e4], ["Hubballi", 15.361924, 75.12307, "in", 89e4], ["Mangaluru", 12.900025, 74.849994, "in", 776632], ["Mysuru", 12.31193, 76.658067, "in", 887e3], ["Kalaburagi", 17.34996, 76.820003, "in", 483615], ["Kolhapur", 16.7, 74.220007, "in", 75e4], ["Nanded", 19.197259, 77.308337, "in", 623708], ["Akola", 20.709988, 77.010018, "in", 503502], ["Guwahati", 26.161963, 91.768049, "in", 983e3], ["Bordeaux", 44.851959, -0.596959, "fr", 803e3], ["Marseille", 43.291925, 5.373064, "fr", 14e5], ["Le Havre", 49.504974, 0.10497, "fr", 242124], ["Skopje", 42.000006, 21.433461, "mk", 494087], ["Misratah", 32.379973, 15.099998, "ly", 386120], ["Kirkuk", 35.472239, 44.392267, "iq", 601433], ["Mosul", 36.346948, 43.143059, "iq", 1316e3], ["An Najaf", 32.000332, 44.335371, "iq", 665552], ["Bahir Dar", 11.600053, 37.383289, "et", 206748], ["Dire Dawa", 9.589995, 41.860018, "et", 252279], ["Tampere", 61.500005, 23.750013, "fi", 259279], ["Aqtobe", 50.280017, 57.169988, "kz", 262457], ["Qyzylorda", 44.800016, 65.464986, "kz", 3e5], ["Pavlodar", 52.299998, 76.950021, "kz", 329002], ["Semey", 50.434995, 80.275038, "kz", 311353], ["Oskemen", 49.990035, 82.614947, "kz", 319067], ["Yazd", 31.920053, 54.370004, "ir", 477905], ["Ahvaz", 31.281934, 48.718067, "ir", 996e3], ["Basra", 30.51547, 47.811611, "iq", 87e4], ["Bandar-e-Abbas", 27.20406, 56.272135, "ir", 461499], ["Hamadan", 34.796027, 48.515013, "ir", 528256], ["Tabriz", 38.088237, 46.2993, "ir", 1413e3], ["Ludhiana", 30.929708, 75.870312, "in", 1649e3], ["Kota", 25.181945, 75.833053, "in", 827e3], ["Jodhpur", 26.293712, 73.014827, "in", 995e3], ["Shymkent", 42.320012, 69.595018, "kz", 465392], ["Taraz", 42.899977, 71.364987, "kz", 358153], ["Lucknow", 26.856985, 80.913053, "in", 2695e3], ["Saharanpur", 29.970017, 77.550036, "in", 484873], ["Ranchi", 23.371952, 85.32808, "in", 1044e3], ["Bhagalpur", 25.229996, 86.980003, "in", 361548], ["Raipur", 21.23694, 81.633061, "in", 875e3], ["Jabalpur", 23.177003, 79.953112, "in", 1285e3], ["Indore", 22.717005, 75.863077, "in", 2026e3], ["Puducherry", 11.934994, 79.83, "in", 227411], ["Salem", 11.671943, 78.178129, "in", 873e3], ["Tiruchirappalli", 10.800541, 78.687512, "in", 951e3], ["Pointe-Noire", -4.770007, 11.880039, "cg", 659084], ["Bouake", 7.689982, -5.030014, "ci", 567481], ["Rio Branco", -9.966589, -67.800007, "br", 257642], ["Sao Luis", -2.514039, -44.267937, "br", 1038e3], ["Porto Velho", -8.750023, -63.900012, "br", 306180], ["Belo Horizonte", -19.91308, -43.91695, "br", 5575e3], ["Montes Claros", -16.720027, -43.860021, "br", 332379], ["Uberlandia", -18.899998, -48.279984, "br", 563536], ["Cuiaba", -15.567661, -56.086931, "br", 806e3], ["Pelotas", -31.750014, -52.330021, "br", 320674], ["Caxias do Sul", -29.17999, -51.17004, "br", 381270], ["Ponta Grossa", -25.090007, -50.16005, "br", 292177], ["Teresina", -5.093055, -42.781955, "br", 907e3], ["Maceio", -9.61805, -35.73192, "br", 1186e3], ["Vitoria da Conquista", -14.850012, -40.839998, "br", 308204], ["Vila Velha", -20.338046, -40.290233, "br", 1209091], ["Natal", -5.778077, -35.24195, "br", 1088e3], ["Venice", 45.438659, 12.334999, "it", 270816], ["San Juan", -31.550026, -68.519988, "ar", 447048], ["Neuquen", -38.95004, -68.059991, "ar", 242092], ["Salta", -24.783359, -65.416638, "ar", 512686], ["Tucuman", -26.814054, -65.21857, "ar", 83e4], ["Formosa", -26.172835, -58.182816, "ar", 221383], ["Santa Fe", -31.623872, -60.690001, "ar", 489505], ["Rosario", -32.949184, -60.668253, "ar", 1203e3], ["Campinas", -22.907898, -47.055885, "br", 2791e3], ["Sorocaba", -23.490002, -47.469981, "br", 563281], ["Ribeirao Preto", -21.17004, -47.829985, "br", 551267], ["Petrolina", -9.38001, -40.509967, "br", 260985], ["Bamenda", 5.959984, 10.150016, "cm", 445299], ["Garoua", 9.300012, 13.390025, "cm", 436899], ["Herat", 34.330009, 62.169993, "af", 481009], ["Mazar-e Sharif", 36.699994, 67.100028, "af", 458151], ["Annaba", 36.920006, 7.759981, "dz", 503524], ["Porto-Novo", 6.483311, 2.616626, "bj", 3e5], ["Constantine", 36.359989, 6.599948, "dz", 605179], ["Brest", 52.099984, 23.69999, "by", 300715], ["Khulna", 22.841933, 89.558055, "bd", 1553e3], ["Gold Coast", -28.081504, 153.448246, "au", 527660], ["Bobo Dioulasso", 11.179975, -4.289981, "bf", 360106], ["Rajshahi", 24.37693, 88.603074, "bd", 81e4], ["Mandalay", 21.971934, 96.083083, "mm", 13e5], ["Bujumbura", -3.376087, 29.360006, "bi", 331700], ["Las Palmas", 28.099976, -15.429999, "es", 378495], ["Gaza", 31.529999, 34.445019, "ps", 505700], ["Taichung", 24.152078, 120.681667, "tw", 2629323], ["Manukau", -36.99997, 174.884971, "nz", 375600], ["Amaravati", 16.533658, 80.52432, "in", 58e5], ["Kozhikode", 11.252382, 75.768044, "in", 953e3], ["Bhubaneshwar", 20.272374, 85.825414, "in", 844e3], ["Jamshedpur", 22.789481, 86.195573, "in", 13e5], ["Montevideo", -34.905376, -56.186823, "uy", 1513e3], ["Boise", 43.60859, -116.22749, "us", 338071], ["San Jose", 37.330943, -121.888179, "us", 1668e3], ["Sacramento", 38.576967, -121.471984, "us", 1604e3], ["Las Vegas", 36.164763, -115.151362, "us", 1823e3], ["Portland", 45.52197, -122.681936, "us", 1875e3], ["Salt Lake City", 40.776962, -111.931998, "us", 966e3], ["Des Moines", 41.57998, -93.619981, "us", 380655], ["Omaha", 41.240001, -96.00999, "us", 877110], ["Oklahoma City", 35.471989, -97.520629, "us", 788e3], ["San Antonio", 29.419848, -98.492693, "us", 1473e3], ["San Cristobal", 7.770003, -72.249967, "ve", 438798], ["Valencia", 10.231927, -67.981967, "ve", 177e4], ["Jackson", 32.298815, -90.184997, "us", 250902], ["Raleigh", 35.772696, -78.647035, "us", 1163515], ["Cleveland", 41.471933, -81.696944, "us", 189e4], ["Cincinnati", 39.163831, -84.458868, "us", 1636e3], ["Nashville", 36.17192, -86.781931, "us", 877e3], ["Memphis", 35.144701, -90.028777, "us", 1081e3], ["Norfolk", 36.849959, -76.280006, "us", 1047869], ["Milwaukee", 43.029608, -87.916673, "us", 1388e3], ["Buffalo", 42.881924, -78.881948, "us", 1016e3], ["Pittsburgh", 40.431945, -80.001931, "us", 1838e3], ["Ciudad Guayana", 8.370017, -62.619987, "ve", 746535], ["Lome", 6.133883, 1.220811, "tg", 1452e3], ["Tunis", 36.802778, 10.179678, "tn", 2412500], ["Sevastapol", 44.603925, 33.524395, "ru", 379200], ["Abu Dhabi", 24.466684, 54.366593, "ae", 603492], ["Ashgabat", 37.949995, 58.383299, "tm", 727700], ["Samarqand", 39.670019, 66.944999, "uz", 708e3], ["Lusaka", -15.414698, 28.281382, "zm", 1328e3], ["Harare", -17.815844, 31.042764, "zw", 1572e3], ["Bulawayo", -20.169998, 28.580002, "zw", 699385], ["Dili", -8.559388, 125.579456, "tl", 234331], ["Port Vila", -17.73335, 168.316641, "vu", 44040], ["Tegucigalpa", 14.103991, -87.219475, "hn", 946e3], ["Georgetown", 6.801974, -58.167029, "gy", 264350], ["Reykjavik", 64.143459, -21.936546, "is", 166212], ["Port-au-Prince", 18.54297, -72.33798, "ht", 1998e3], ["Glasgow", 55.86227, -4.239101, "gb", 116e4], ["Kampala", 0.318605, 32.581378, "ug", 142e4], ["Aden", 12.779723, 45.00949, "ye", 1e6], ["Paramaribo", 5.83503, -55.167031, "sr", 254169], ["Seville", 37.405015, -5.980007, "es", 1212045], ["Zinder", 13.799996, 8.983317, "ne", 230358], ["Niamey", 13.518652, 2.11471, "ne", 915e3], ["Port Sudan", 19.615791, 37.216426, "sd", 489725], ["Dushanbe", 38.560035, 68.773879, "tj", 1086244], ["Cusco", -13.525028, -71.972155, "pe", 361182], ["Tacna", -18.000001, -70.250012, "pe", 280098], ["Trujillo", -8.120035, -79.019968, "pe", 765171], ["Ica", -14.067993, -75.725492, "pe", 279420], ["Asuncion", -25.290671, -57.625834, "py", 187e4], ["Managua", 12.154962, -86.270437, "ni", 92e4], ["Freetown", 8.471957, -13.236162, "sl", 827e3], ["Niyala", 12.059973, 24.889995, "sd", 392373], ["Kassala", 15.459972, 36.390016, "sd", 401477], ["Bergen", 60.391002, 5.324522, "no", 213585], ["Islamabad", 33.689368, 73.08063, "pk", 78e4], ["Multan", 30.201923, 71.453062, "pk", 1522e3], ["Hyderabad", 25.381933, 68.373043, "pk", 1459e3], ["Peshawar", 34.006962, 71.533057, "pk", 1303e3], ["Kathmandu", 27.718638, 85.314696, "np", 895e3], ["Nacala", -14.518611, 40.715024, "mz", 224795], ["Bloemfontein", -29.119994, 26.229913, "za", 463064], ["Pretoria", -25.704975, 28.227483, "za", 1338e3], ["Port Moresby", -9.464708, 147.192504, "pg", 283733], ["Honiara", -9.437994, 159.949766, "sb", 76328], ["Panama City", 8.969963, -79.534983, "pa", 1281e3], ["Fez", 34.056545, -5.002323, "ma", 1002e3], ["Rabat", 34.025307, -6.836408, "ma", 1705e3], ["Marrakesh", 31.631939, -8.001933, "ma", 872e3], ["Chisinau", 47.005024, 28.857711, "md", 688134], ["Beira", -19.820045, 34.870006, "mz", 530604], ["Port Elizabeth", -33.968088, 25.598083, "za", 1021e3], ["Maputo", -25.953332, 32.587217, "mz", 1446e3], ["Tomsk", 56.494987, 84.975009, "ru", 535479], ["Murmansk", 68.969988, 33.100036, "ru", 319263], ["Archangel", 64.574959, 40.545008, "ru", 356051], ["Nizhny Novgorod", 56.334953, 43.998148, "ru", 1278e3], ["Volgograd", 48.711956, 44.498015, "ru", 984e3], ["Ufa", 54.791921, 56.038085, "ru", 1018e3], ["Yekaterinburg", 56.851976, 60.598014, "ru", 1313e3], ["Samara", 53.196953, 50.149349, "ru", 1137e3], ["Kazan", 55.751888, 49.124399, "ru", 1115e3], ["Surgut", 61.259942, 73.425017, "ru", 4e5], ["Barnaul", 53.354998, 83.745007, "ru", 599579], ["Novosibirsk", 55.031906, 82.958096, "ru", 1389e3], ["Mogadishu", 2.068627, 45.364732, "so", 11e5], ["Muscat", 23.585179, 58.378311, "om", 734697], ["Colombo", 6.931966, 79.857751, "lk", 217e3], ["Cebu", 10.321922, 123.898129, "ph", 815e3], ["Iloilo", 10.705043, 122.545016, "ph", 387681], ["Davao", 7.111963, 125.62805, "ph", 1402e3], ["Bratsk", 56.156997, 101.615027, "ru", 246348], ["Irkutsk", 52.284604, 104.283869, "ru", 586695], ["Krasnoyarsk", 56.015929, 92.864055, "ru", 925e3], ["Chita", 52.055025, 113.465002, "ru", 308500], ["Vladivostok", 43.130015, 131.910026, "ru", 587022], ["Yakutsk", 62.034959, 129.735016, "ru", 235600], ["Tijuana", 32.501963, -117.081942, "mx", 1553e3], ["Chihuahua", 28.646927, -106.086928, "mx", 793e3], ["Mazatlan", 23.221101, -106.420001, "mx", 368204], ["Tampico", 22.30002, -97.870006, "mx", 859419], ["Acapulco", 16.849991, -99.915979, "mx", 715584], ["Veracruz", 19.177342, -96.159981, "mx", 578963], ["Tuxtla Gutierrez", 16.749997, -93.15001, "mx", 481128], ["Cancun", 21.16996, -86.830008, "mx", 542043], ["Merida", 20.968585, -89.618579, "mx", 965e3], ["Enugu", 6.450031, 7.499997, "ng", 688862], ["Sokoto", 13.060016, 5.240031, "ng", 732178], ["Perm", 58.001906, 56.248047, "ru", 997e3], ["Ulaanbaatar", 47.918619, 106.91467, "mn", 885e3], ["Mbeya", -8.890014, 33.430042, "tz", 291649], ["Windhoek", -22.570006, 17.083546, "na", 268132], ["Zanzibar", -6.16, 39.200026, "tz", 403658], ["Valencia", 39.486963, -0.401958, "es", 808e3], ["Abuja", 9.05462, 7.489505, "ng", 1576e3], ["Padang", -0.958061, 100.358068, "id", 855e3], ["Bissau", 11.865024, -15.598361, "gw", 403339], ["Palermo", 38.126969, 13.348081, "it", 863e3], ["Amman", 31.951971, 35.931354, "jo", 106e4], ["Vilnius", 54.683366, 25.316635, "lt", 542366], ["Riga", 56.950024, 24.099965, "lv", 742572], ["Bishkek", 42.875025, 74.583258, "kg", 837e3], ["Xining", 36.621944, 101.768059, "cn", 1048e3], ["Guilin", 25.281939, 110.278082, "cn", 987e3], ["Huainan", 32.63193, 116.978035, "cn", 1451e3], ["Shantou", 23.371952, 116.66808, "cn", 1601e3], ["Mombasa", -4.03808, 39.687972, "ke", 882e3], ["Maseru", -29.316674, 27.483273, "ls", 361324], ["Antananarivo", -18.914691, 47.514678, "mg", 1697e3], ["Semarang", -6.964672, 110.418074, "id", 1396e3], ["Palembang", -2.978093, 104.748084, "id", 1749e3], ["Bandjarmasin", -3.329992, 114.580076, "id", 603576], ["Makassar", -5.138013, 119.430082, "id", 1262e3], ["Lyon", 45.771954, 4.828085, "fr", 1423e3], ["Quito", -0.213042, -78.501997, "ec", 1701e3], ["San Jose", 9.930371, -84.078814, "cr", 1284e3], ["San Salvador", 13.70328, -89.215576, "sv", 1433e3], ["Kingston", 17.977077, -76.767434, "jm", 937700], ["Cartagena", 10.401684, -75.516339, "co", 887e3], ["Ndjamena", 12.115042, 15.047202, "td", 989e3], ["Malabo", 3.750015, 8.783278, "gq", 155963], ["Luxor", 25.700019, 32.650038, "eg", 609248], ["Asmara", 15.333339, 38.933324, "er", 620802], ["Zagreb", 45.800007, 15.999995, "hr", 722526], ["Tallinn", 59.433877, 24.728041, "ee", 394024], ["Lhasa", 29.645024, 91.10001, "cn", 219599], ["Hami", 42.826984, 93.515005, "cn", 58e4], ["Hotan", 37.099711, 79.926945, "cn", 408894], ["Kashgar", 39.476336, 75.969926, "cn", 506640], ["Yinchuan", 38.46992, 106.271092, "cn", 991e3], ["Pingxiang", 27.621951, 113.848097, "cn", 961e3], ["Nagasaki", 32.764988, 129.885033, "jp", 435455], ["Qiqihar", 47.346923, 123.988046, "cn", 1641e3], ["Kikwit", -5.030043, 18.850002, "cd", 637736], ["Matadi", -5.81661, 13.450021, "cd", 245862], ["Kolwezi", -10.716724, 25.47244, "cd", 418e3], ["Lubumbashi", -11.678079, 27.478072, "cd", 1352e3], ["Lilongwe", -13.983295, 33.783302, "mw", 646750], ["Guatemala", 14.623081, -90.528911, "gt", 1024e3], ["Libreville", 0.385389, 9.457965, "ga", 578156], ["Vishakhapatnam", 17.682903, 83.219848, "in", 1529e3], ["Suva", -18.133016, 178.441707, "fj", 175399], ["Iquique", -20.249993, -70.129968, "cl", 227499], ["Antofagasta", -23.649992, -70.400003, "cl", 309832], ["Valparaiso", -33.047739, -71.617026, "cl", 854e3], ["Concepcion", -36.830014, -73.050022, "cl", 889725], ["Nouakchott", 18.086427, -15.97534, "mr", 742144], ["Bamako", 12.65196, -8.001985, "ml", 1494e3], ["Banghazi", 32.118679, 20.064777, "ly", 118e4], ["Thessaloniki", 40.698052, 22.883055, "gr", 828e3], ["Beirut", 33.873921, 35.507762, "lb", 1846e3], ["Tbilisi", 41.726956, 44.78885, "ge", 11e5], ["Astana", 51.181125, 71.427774, "kz", 345604], ["Qaraghandy", 49.884977, 73.11501, "kz", 451800], ["Almaty", 43.326936, 76.91309, "kz", 1209e3], ["Isfahan", 32.701951, 51.698092, "ir", 1628e3], ["Shiraz", 29.631906, 52.568065, "ir", 124e4], ["Amritsar", 31.641938, 74.868047, "in", 1212e3], ["Varanasi", 25.331936, 82.998094, "in", 1352e3], ["Asansol", 23.685279, 86.981387, "in", 1328e3], ["Bhilai", 21.211262, 81.372213, "in", 1097e3], ["Bhopal", 23.251934, 77.408047, "in", 1727e3], ["Madurai", 9.921972, 78.118081, "in", 1294e3], ["Coimbatore", 11.001906, 76.948075, "in", 1696e3], ["Vientiane", 17.966693, 102.59998, "la", 754e3], ["Brazzaville", -4.25724, 15.282744, "cg", 1355e3], ["Conakry", 9.533469, -13.682181, "gn", 1494e3], ["Yamoussoukro", 6.818381, -5.275503, "ci", 206499], ["Manaus", -3.098086, -60.001963, "br", 1753e3], ["Santarem", -2.433251, -54.699979, "br", 230428], ["Campo Grande", -20.448086, -54.618571, "br", 778e3], ["Florianopolis", -27.578039, -48.521966, "br", 1023e3], ["Feira de Santana", -12.250016, -38.970009, "br", 481911], ["Winnipeg", 49.882987, -97.165992, "ca", 632063], ["Calgary", 51.084938, -114.081944, "ca", 111e4], ["Victoria", 48.433283, -123.350001, "ca", 289625], ["Boa Vista", 2.816093, -60.665998, "br", 235150], ["Macapa", 0.033007, -51.050021, "br", 499166], ["Ottawa", 45.418643, -75.701961, "ca", 1145e3], ["Quebec", 46.839969, -71.24561, "ca", 624177], ["Halifax", 44.650025, -63.600004, "ca", 359111], ["Belgrade", 44.820591, 20.466045, "rs", 1099e3], ["Bandar Seri Begawan", 4.883331, 114.933284, "bn", 296500], ["Mendoza", -32.881384, -68.818557, "ar", 893e3], ["Sucre", -19.040971, -65.259516, "bo", 224838], ["Bahia Blanca", -38.740027, -62.265021, "ar", 281536], ["Mar del Plata", -38.00002, -57.579984, "ar", 555897], ["Cordoba", -31.398012, -64.18424, "ar", 1452e3], ["Posadas", -27.357832, -55.885107, "ar", 357119], ["Belmopan", 17.252033, -88.767073, "bz", 15220], ["Bangui", 4.366644, 18.558288, "cf", 831925], ["Maroua", 10.595566, 14.324696, "cm", 319941], ["Yaounde", 3.868647, 11.514705, "cm", 1611e3], ["Tirana", 41.327541, 19.818883, "al", 895350], ["Yerevan", 40.183097, 44.511606, "am", 1102e3], ["Baku", 40.397218, 49.860271, "az", 2122300], ["Kandahar", 31.61002, 65.694946, "af", 715542], ["Phnom Penh", 11.551976, 104.914689, "kh", 1466e3], ["Huambo", -12.74804, 15.758064, "ao", 11e5], ["La Paz", -16.496028, -68.151931, "bo", 159e4], ["Santa Cruz", -17.751972, -63.227942, "bo", 2102998], ["Oran", 35.711948, -0.621919, "dz", 798e3], ["Cotonou", 6.36298, 2.404355, "bj", 762e3], ["Sofia", 42.685295, 23.314708, "bg", 1185e3], ["Minsk", 53.901923, 27.564681, "by", 1805e3], ["Thimphu", 27.472986, 89.639014, "bt", 98676], ["Gaborone", -24.646314, 25.911948, "bw", 208411], ["Canberra", -35.283029, 149.129026, "au", 327700], ["Newcastle", -32.929508, 151.770249, "au", 540796], ["Adelaide", -34.933042, 138.598059, "au", 1145e3], ["Brisbane", -27.453085, 153.033147, "au", 186e4], ["Ouagadougou", 12.372262, -1.52667, "bf", 1149e3], ["Sarajevo", 43.850022, 18.383002, "ba", 696731], ["Naypyidaw", 19.768503, 96.116673, "mm", 93e4], ["San Juan", 18.440023, -66.129979, "pr", 2478905], ["Jerusalem", 31.778408, 35.206626, "il", 1029300], ["Nassau", 25.08339, -77.350044, "bs", 227940], ["Nicosia", 35.166677, 33.366635, "cy", 224300], ["Kaohsiung", 22.633307, 120.266602, "tw", 2769072], ["Wellington", -41.292068, 174.777201, "nz", 393400], ["Christchurch", -43.535022, 172.630023, "nz", 363200], ["Shenzhen", 22.548097, 114.061154, "cn", 7581e3], ["Zibo", 36.821365, 117.99646, "cn", 3061e3], ["Minneapolis", 44.981925, -93.253732, "us", 2616e3], ["Honolulu", 21.303429, -157.858301, "us", 786e3], ["Seattle", 47.600423, -122.315322, "us", 3074e3], ["Phoenix", 33.448322, -112.067365, "us", 3551e3], ["San Diego", 32.718914, -117.150881, "us", 2916e3], ["St. Louis", 38.636964, -90.241926, "us", 2199e3], ["New Orleans", 29.968908, -90.088368, "us", 785e3], ["Dallas", 32.771958, -96.794687, "us", 4798e3], ["Maracaibo", 10.731923, -71.661924, "ve", 2072e3], ["Boston", 42.331906, -71.07196, "us", 4467e3], ["Tampa", 27.948934, -82.460567, "us", 2314e3], ["Philadelphia", 39.945942, -75.179841, "us", 5492e3], ["Detroit", 42.333558, -83.051334, "us", 4101e3], ["Anchorage", 61.214004, -149.887446, "us", 260283], ["Hanoi", 21.035273, 105.848068, "vn", 4378e3], ["Ho Chi Minh City", 10.762125, 106.702985, "vn", 5314e3], ["Ankara", 39.929184, 32.862446, "tr", 3716e3], ["Budapest", 47.501952, 19.081375, "hu", 1679e3], ["Sanaa", 15.356679, 44.204648, "ye", 2008e3], ["Barcelona", 41.385245, 2.181424, "es", 492e4], ["Bucharest", 44.435318, 26.098001, "ro", 1942e3], ["Aleppo", 36.231917, 37.168074, "sy", 2738e3], ["Damascus", 33.50198, 36.29805, "sy", 2466e3], ["Zurich", 47.381934, 8.548064, "ch", 1108e3], ["Lisbon", 38.724669, -9.146812, "pt", 2812e3], ["Khartoum", 15.590024, 32.532233, "sd", 4754e3], ["Jeddah", 21.518835, 39.217252, "sa", 3012e3], ["Makkah", 21.431967, 39.818094, "sa", 1385e3], ["Oslo", 59.918636, 10.748033, "no", 835e3], ["Lahore", 31.561917, 74.348079, "pk", 6577e3], ["Karachi", 24.871938, 66.988063, "pk", 1213e4], ["Durban", -29.860662, 31.010944, "za", 2729e3], ["St. Petersburg", 59.94096, 30.314074, "ru", 4553e3], ["Guadalajara", 20.671962, -103.33198, "mx", 4198e3], ["Puebla", 19.032594, -98.203737, "mx", 2195e3], ["Kano", 12.001923, 8.518092, "ng", 314e4], ["Warsaw", 52.230872, 21.005347, "pl", 1707e3], ["Pyongyang", 39.021385, 125.752745, "kp", 33e5], ["Dar es Salaam", -6.798067, 39.266396, "tz", 293e4], ["Medan", 3.58192, 98.648094, "id", 2115e3], ["Dublin", 53.346731, -6.25698, "ie", 1059e3], ["Monrovia", 6.314582, -10.79966, "lr", 1041e3], ["Naples", 40.841971, 14.243066, "it", 225e4], ["Milan", 45.471921, 9.203063, "it", 2945e3], ["Kuala Lumpur", 3.139797, 101.688699, "my", 1448e3], ["Lanzhou", 36.057974, 103.790054, "cn", 2561e3], ["Nanning", 22.821934, 108.318099, "cn", 2167e3], ["Guiyang", 26.581989, 106.718093, "cn", 3662e3], ["Chongqing", 29.566923, 106.593036, "cn", 6461e3], ["Fuzhou", 26.081942, 119.2981, "cn", 2606e3], ["Guangzhou", 23.124723, 113.261785, "cn", 8829e3], ["Dongguan", 23.021537, 113.750474, "cn", 4528e3], ["Bandung", -6.948083, 107.568067, "id", 2394e3], ["Surabaya", -7.24729, 112.748887, "id", 2845e3], ["Guayaquil", -2.218088, -79.921988, "ec", 2514e3], ["Medellin", 6.276949, -75.576956, "co", 3297e3], ["Cali", 3.401905, -76.501912, "co", 2254e3], ["Havana", 23.133905, -82.366128, "cu", 2174e3], ["Alexandria", 31.201965, 29.94805, "eg", 4165e3], ["Frankfurt", 50.099977, 8.675015, "de", 2895e3], ["Hamburg", 53.551971, 9.998053, "de", 1757e3], ["Munich", 48.131888, 11.573048, "de", 1275e3], ["Prague", 50.086967, 14.422939, "cz", 1162e3], ["Kuwait City", 29.371664, 47.976355, "kw", 2063e3], ["Xian", 34.276971, 108.89305, "cn", 4009e3], ["Taiyuan", 37.876958, 112.543112, "cn", 2913e3], ["Wuhan", 30.581977, 114.268071, "cn", 7243e3], ["Changsha", 28.201916, 112.968047, "cn", 2604e3], ["Kunming", 25.042859, 102.69744, "cn", 2931e3], ["Zhengzhou", 34.756942, 113.663147, "cn", 2636e3], ["Shenyeng", 41.806925, 123.448028, "cn", 4787e3], ["Jinan", 36.676928, 116.993073, "cn", 2798e3], ["Tianjin", 39.082772, 117.196607, "cn", 718e4], ["Nanchang", 28.681938, 115.87805, "cn", 235e4], ["Nanjing", 32.051965, 118.778029, "cn", 3679e3], ["Hangzhou", 30.25192, 120.168073, "cn", 3007e3], ["Hiroshima", 34.389781, 132.440967, "jp", 2045e3], ["Changchun", 43.866954, 125.338042, "cn", 3183e3], ["Baotou", 40.654153, 109.820074, "cn", 2036e3], ["Harbin", 45.75193, 126.648039, "cn", 3621e3], ["Sapporo", 43.076925, 141.338099, "jp", 2544e3], ["Santo Domingo", 18.470745, -69.929742, "do", 2154e3], ["Accra", 5.55198, -0.218662, "gh", 2121e3], ["Delhi", 28.671939, 77.228058, "in", 15926e3], ["Hyderabad", 17.401929, 78.478008, "in", 6376e3], ["Pune", 18.516394, 73.851892, "in", 4672e3], ["Nagpur", 21.171906, 79.088048, "in", 2454e3], ["Tripoli", 32.8925, 13.180012, "ly", 2189e3], ["Tel Aviv-Yafo", 32.081937, 34.768066, "il", 3112e3], ["Helsinki", 60.163804, 24.932457, "fi", 1115e3], ["Mashhad", 36.271966, 59.568051, "ir", 2469e3], ["Jaipur", 26.923079, 75.808042, "in", 2917e3], ["Kanpur", 26.461945, 80.31805, "in", 3162e3], ["Patna", 25.626905, 85.128093, "in", 2158e3], ["Chennai", 13.091934, 80.278053, "in", 7163e3], ["Ahmedabad", 23.031999, 72.578058, "in", 5375e3], ["Surat", 21.20193, 72.838094, "in", 3842e3], ["Kobenhavn", 55.68051, 12.56154, "dk", 1085e3], ["Abidjan", 5.323126, -4.020207, "ci", 3802e3], ["Belem", -1.448057, -48.481969, "br", 2167e3], ["Brasilia", -15.781394, -47.917998, "br", 3716996], ["Porto Alegre", -30.048069, -51.201958, "br", 3917e3], ["Curitiba", -25.418067, -49.321944, "br", 3084e3], ["Fortaleza", -3.748072, -38.581927, "br", 3602319], ["Salvador", -12.968026, -38.481933, "br", 3484e3], ["Edmonton", 53.551971, -113.501928, "ca", 1058e3], ["Montreal", 45.501945, -73.585243, "ca", 3678e3], ["Goiania", -16.718081, -49.301971, "br", 2022e3], ["Recife", -8.060532, -34.908766, "br", 3651e3], ["Brussels", 50.835263, 4.331371, "be", 1743e3], ["Dhaka", 23.725006, 90.406634, "bd", 12797394], ["Luanda", -8.83634, 13.232481, "ao", 5172900], ["Algiers", 36.765011, 3.048607, "dz", 3354e3], ["Chattogram", 22.331938, 91.798022, "bd", 4529e3], ["Perth", -31.953069, 115.838053, "au", 1532e3], ["Rangoon", 16.7853, 96.164732, "mm", 4088e3], ["San Francisco", 37.784263, -122.3996, "us", 345e4], ["Denver", 39.741134, -104.985962, "us", 2313e3], ["Houston", 29.741273, -95.348436, "us", 4459e3], ["Miami", 25.789557, -80.226052, "us", 5585e3], ["Atlanta", 33.739457, -84.367642, "us", 4506e3], ["Chicago", 41.847961, -87.635237, "us", 899e4], ["Caracas", 10.502944, -66.918983, "ve", 2985e3], ["Kiev", 50.435313, 30.514682, "ua", 2709e3], ["Dubai", 25.214912, 55.286946, "ae", 1379e3], ["Tashkent", 41.303828, 69.268823, "uz", 2184e3], ["Madrid", 40.401972, -3.685297, "es", 5567e3], ["Geneva", 46.210008, 6.140028, "ch", 124e4], ["Stockholm", 59.324127, 18.0663, "se", 1264e3], ["Bangkok", 13.751945, 100.514699, "th", 6704e3], ["Lima", -12.046067, -77.052008, "pe", 8012e3], ["Dakar", 14.717778, -17.475076, "sn", 2604e3], ["Johannesburg", -26.168099, 28.028064, "za", 3435e3], ["Amsterdam", 52.351914, 4.914694, "nl", 1031e3], ["Casablanca", 33.601922, -7.618313, "ma", 3181e3], ["Seoul", 37.568295, 126.997785, "kr", 9796e3], ["Manila", 14.606105, 120.980271, "ph", 111e5], ["Monterrey", 25.671941, -100.331931, "mx", 3712e3], ["Berlin", 52.523764, 13.399603, "de", 3406e3], ["Urumqi", 43.806958, 87.57306, "cn", 3575e3], ["Chengdu", 30.671946, 104.068074, "cn", 4123e3], ["Osaka", 34.691095, 135.503754, "jp", 11294e3], ["Kinshasa", -4.327778, 15.313026, "cd", 7843e3], ["New Delhi", 28.600023, 77.19998, "in", 317797], ["Bengaluru", 12.971941, 77.558064, "in", 6787e3], ["Athens", 37.985272, 23.731375, "gr", 3242e3], ["Baghdad", 33.340594, 44.391923, "iq", 5054e3], ["Addis Ababa", 9.035256, 38.698059, "et", 31e5], ["Tehran", 35.673889, 51.422398, "ir", 7873e3], ["Vancouver", 49.275362, -123.12359, "ca", 2313328], ["Toronto", 43.664645, -79.389459, "ca", 5213e3], ["Buenos Aires", -34.610715, -58.432513, "ar", 12795e3], ["Kabul", 34.518636, 69.181314, "af", 3277e3], ["Vienna", 48.201961, 16.364693, "at", 24e5], ["Melbourne", -37.818086, 144.97307, "au", 417e4], ["Taipei", 25.035833, 121.568333, "tw", 6900273], ["Auckland", -36.848055, 174.763027, "nz", 1377200], ["Los Angeles", 34.049219, -118.231986, "us", 125e5], ["Washington, D.C.", 38.901495, -77.011364, "us", 4338e3], ["New York", 40.721562, -73.995718, "us", 1904e4], ["London", 51.501941, -0.118668, "gb", 8567e3], ["Istanbul", 41.017602, 28.974277, "tr", 10061e3], ["Riyadh", 24.634497, 46.720487, "sa", 4465e3], ["Cape Town", -33.918065, 18.433042, "za", 3215e3], ["Moscow", 55.75411, 37.613577, "ru", 10452e3], ["Mexico City", 19.444388, -99.132934, "mx", 19028e3], ["Lagos", 6.445208, 3.389585, "ng", 9466e3], ["Rome", 41.897902, 12.481313, "it", 3339e3], ["Beijing", 39.90172, 116.394201, "cn", 11106e3], ["Nairobi", -1.281401, 36.814711, "ke", 301e4], ["Jakarta", -6.172472, 106.827492, "id", 9125e3], ["Bogota", 4.598369, -74.08529, "co", 7772e3], ["Cairo", 30.051906, 31.248022, "eg", 11893e3], ["Shanghai", 31.218398, 121.434559, "cn", 14987e3], ["Tokyo", 35.686963, 139.749462, "jp", 35676e3], ["Mumbai", 19.068408, 72.875839, "in", 18978e3], ["Paris", 48.858092, 2.352992, "fr", 9904e3], ["Santiago", -33.440205, -70.650504, "cl", 572e4], ["Kolkata", 22.569579, 88.369126, "in", 14787e3], ["Rio de Janeiro", -22.907308, -43.212117, "br", 11748e3], ["Sao Paulo", -23.556734, -46.626966, "br", 18845e3], ["Sydney", -33.871373, 151.212548, "au", 463e4]];

  // src/core/climate-grid.generated.js
  var CLIMATE_GRID_WIDTH = 180;
  var CLIMATE_GRID_HEIGHT = 90;
  var CLIMATE_GRID_BASE64 = "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAAAAAAAAAAAAAAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgIAAAICAgICAgICAgICAgAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgAAAAICAgICAgICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAgICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgIAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgAAAgICAgICAgICAAAAAAAAAAAAAAICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgICAgICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgAAAAAAAAAAAAAAAgICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAUFAAUFBQgAAAAAAAAAAAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgIAgICAAUFBQUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQgIAgICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAUIAgICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgAAAAAAAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFBQUAAAAAAAUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUFBQICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUAAAAAAAAAAAUFBQUFAAAAAAUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFBQICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUFAAAAAAAAAAAFBQgFBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFAwICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFBQUFAAAAAAAAAAAAAAUFBQUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUDAwICAgQFBQUAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMFBQUFBQAAAAAAAAAAAAAFBQUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMDAwICAgQEBQUFAAAAAAAAAAAAAAAAAAAAAAAAAAAFBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMDAwMFBQUFBQAAAAAAAAAAAAAFBQUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAADAwICBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAwIEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMDAgMAAAAAAAMDAwICAgIFBQAAAAAAAAAAAAUFBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAADAwICBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAwICAgQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMCAgICAgICAgMCAgICAgIEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgUFBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMCAgICAgICAgICAgICAgIEBAQEAAAAAAAAAAAAAAAABAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgICAgIEBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAwICAgICAgICAgICAgICAgICBAQEAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAggCBAIEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgICAgIEBAEAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgICAgQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAggIAgIEBAQEBAQFAQQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICBAEBAQAAAgEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgICAgQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAEBAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIIBAQCAQEEAQQEBAUBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgIBAQAAAgIEAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgICBAQAAAAAAAEEAQAAAAAAAAABAAAAAAAAAQEAAAAAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAQEBAQEBAQQBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgIBAAAAAgEEAQAABQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgIEBAAAAAAAAQEBAQEAAAAAAQABAQEBAAAAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAggCAgIBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICBAQBAQAAAQEEAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgICAgICAgICAgICAgEBAAAAAAAAAAEAAQAAAAEBAQAAAQAAAAAAAAAAAAEBAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAggIBQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgQCBAICAQEBAQEBBAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEBAgICAgICAQEBAQEAAAAAAAAAAAABAQAAAAEBAQABAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIICAgBAQEBAQEBAQEBAQECAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgQEBAQBBAQEAgEBAQEBAAEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQAAAAAAAAAAAAABAQAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAggEBQEBAQEBAQEBAQEBAQECAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgQEBAEBBAQEBAQBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAAEBAQAAAAAAAAABAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgUBAQEBAQEBAQEBAQEBAQECAgIBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgQEAQEBAQQEBAEBAQEBAQEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAAEBAQEBAAEBAAEBAQEBAAEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACCAEBAQEBAQEBAQEBAQEBAQECAgIBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEBAQEBAQEBAQQEAQEBAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAAABAQEBAQEBAQEAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAgEBAQEBAQEBAQECAQEBAAAAAAAAAAAAAAAAAAABAQAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIFAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQECAgEBAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIFAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEEAQEBAQIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgAAAAIBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBBQICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAEBAQAAAAAAAAABAAABAQEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAEBBQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEFBQICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEAAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAAAAAAAAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAABAQEBAQEBAQEBAQEBAQECAgICAgICAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAAABAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQUFAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQECAQEBAgICAgAAAAAAAAAAAAAAAQEAAQEAAAAAAAABAQEBAQABAQABAQEBAQEBAQAAAAAAAAAAAAAAAAEBAAAAAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgIBBQUFAgICAgIAAAAAAAAAAAAAAAABAQEBAAAAAAEBAQEBAQAAAAAAAQEBAQEBAQAAAQEAAAAAAAAAAQEAAQEAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQECAQEBAgIBAQQBAgICAgIAAAAAAAAAAAAAAAEBAQEAAAAAAAAAAQEBAQEBAAAAAAEBAQEBAQAAAAEBAQAAAAAAAAAAAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQAAAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICBAQCAgICAgICAgAAAAAAAAAAAAEBAQEAAAAAAQEAAQEBAQEBAQAAAAABAQEBAQAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEAAAACAgECAAEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAQECAQICAgICAgICAgICAgICAgICAgICAgICAQICAgICAgICAgAAAAAAAAAAAAECAQEAAAAAAAEAAQEBAQEBAQAAAAABAQEBAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAECAgEEAQEBAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAACAgAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAAAAQECAgEBAAAAAAEBAQEBAQEBAQAAAAABAQEBAAAAAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgEEAQEBAQEBAAABAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAACAgAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAAAAAAAAQICAgEBAQAAAAEBAQEBAQEBAQAAAAABAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQQFAQEBAQEAAAEBAQEBBQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAQIBAQEBAQEAAAEBAQEBBAEBAQEAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQECBAQBAAABAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAAICAQIBAQEBAQEBAQEBBAQEBAQEBAQEBAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAQMCAgQBAAAAAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAgICAgEBAQMEBAEBAQQBAQQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAwICAgIEAAAAAAAAAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDBAQBBAQEBAQEBAQEBAQEBAQEBAQEBAAEAAAAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAwICAgIEAAAAAAAABAQBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQEBAQEBAQEBAQEBAQEBAQEBAQEBAAABAQEAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAwICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAgICAgICAgICAgICBAQICAgCAggECAQEBAQEBAQEBAQEBAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgICAgICAgQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIDAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMCAgICAgICAgICAgIEBwgIAggICAgICAcICAQEBAQEBAQEBAQAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAwICAgICAgICAgQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAwMAAwMDAwICAgICAgICAgIAAgICAgIAAgMDAgICAgIDAwMCAgICAgIGBgICBAQIBwIICAgICAgICAgIBwIEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMDAgICAgICAgICBAQEBAQEBAQEBQQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAwICAgICAgICAgMAAAMDAwMDAwMCAwICAgIGAwICAgICAgIGBgcGBQgICAgICAgICAgICAgHBwYGBAIEBAQEBAAEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMDAwICAgICBgYCAgQEBAQEBAQEBAUEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMDAAAAAAAAAAMDAwMCAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwYCBgMDAgICAgICAgIGCAgCAgICAggICAICAggHBwICAgIGAgIEBAQEBAYEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMDAgICAgYCBwYCAgQEBAQEBAQEBAQFBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAUFBQMDAAAAAAAAAwMDAwICAgMDAwMDAwMDAwMDAwMDAwMDBgYGBgICAwICAgICAgICAwcGCAgCAgICAgICAgICCAgCAgICAgICBgIGBgYGBgQAAAAEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMDAgICAgYGBgYCBAYGBgYGBgYGBAYGBgYEBAQAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAMDAwMFAwMDAwMDAwMDAwMEAwMDBAUFAwMEBgQCAgICAgICAgICAgMHBgIIAgICAgICAgICAgICAgICAgICBgYGBgYGBgcGAAAABAYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMDAgIGAgYCAgICBgYGBgYGBgYGBgYGBgYGBgYGBgYFBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMDBQUFBAMDAwMDBQQDBQUFBAQEBAMDAwQGCAQCAgICAgICAgICAgMCAgYEBgcCCAgCAgICAgICAgICAgICAgICAgYGBgYGBgYGBgYGBgcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMDAwYGAgcCBgICBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFBQUFBQUFBwQEBAUEBAQHBQQEBAQEBAQEBAQCAgICAgICAgICAgICAgICBgcCAgICAgICAgICAgICAgICAgICBgIGBgYGBgYGBgYGBwcHBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQMDAgMGBgIGAgIGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBwYGBgYAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUFBQUFBQUHBwcFBQUFBgUEBQYEBgQGBgYCAgICAgICAgICAgICAgICAgYGBgICCAICBwgHAgICAgICAgIGBwYGBgYGBgYHBgYHBgAHCAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFBQUHBwcGBgIGBgYGBgYGBgYGBgYGBgYGBgYGBwYGBgYGBgYGBgYAAAAAAAAAAAAAAAAAAAAAAAAAAAAFBQUFBQUFBQUFBQUFBgYGBgQGBgYGBgYGBgYCAgICAgYGAgICBgIGBgICAgYGBggIAgIHAgcCBwcHBwcHAgIGBgcGBgYGBgYGBwYHBwAAAAgHBwAAAAAAAAAAAAAABwUIBQAAAAAAAAAAAAAAAAAAAAAAAAAFBQUFCAgGBwgIBgYCBgYGBgYGBgYGBwcGBgYGBwcHBwcHBwcHBwcHBgAAAAAAAAAAAAAAAAAAAAAAAAAABQUFBQUFBQUFBQUFBQUFBQUFBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgIGBgYGBwcHAgcCBwcHBwcCBwcHBwcHBwcHBgYGBgcGBgYGBwAAAAcHBwcAAAAAAAAHBwYGBwUIBQUFBQUAAAAAAAAAAAAAAAAAAAUFBQUHBwcHCAcHBgYGBgYGBgYGBgYHBwcHBwcHBwcHBwcHBwcHBwcHAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUFBQUFBQUFBQUFBQUFBQUFBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYCAgYGBgYGBgYHBgYHBwcHBgcHBwcHBwcHBwcHBwcGBwcHBgcGBgAAAAAHBwgHAAAAAAcHBwcHAAAAAAAFCAUFBwcHBQUAAAAAAAAAAAUFBQcHBwcHBwYHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUFBQUFBQAABQUFBQUFBQUGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYHBgcHBwcHBwcHBwgHBwcHBwcHBwcHBwcGBgcGBgAAAAcHBwcIBwcHBwAAAAAAAAAACAgIAAAHBwcHBwUHAAAAAAAHBQUHCAgIBwcHBwcHBwcHBwcHBwcHBwcHBwcHAAcHBwcHBwcHBwgIBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFBQUFBQAFBQUFBQUFBQUFBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHAAAAAAAHBwcHBwcAAAAAAAAAAAAAAAAHBwcHBwcHBwcHBwcHBwcHCAcHCAcHBwcHBwcHBwcHBwcHBwcHBwcHAAAAAAcHBwgICAcHCAgIAAAAAAAACAgICAAAAAAAAAAAAAAAAAAAAAUFBQUFBQUFBwcFBgYFBQUGBgYGBgYGBgYGBgYGBgYGBgYHBgYGBgcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcAAAAABwAAAAAIBwcHBwcHBwgHBwgIBwgIBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHAAAHBwgICAgICAgICAgAAAAAAAgICAgICAgACAgIAAAAAAAAAAAAAAUFBQUFBQUFBwcHBwcHBQYGBgYGBgYGBgcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcGBgcICAgIBwcHBwcHBwcHBwcHBwcHBwcICAgICAcHBwcHBwcHBwcIBwcHBwcHBwcIBwcHBwcHBwcHBwcHBwcHBwcIBwgHBwgICAgICAgICAgAAAAACAgICAgICAgACAgIAAAFBQUFBQUFAAUFBQAAAAUFBQUHBwcHBwYHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcGBgYHCAgIBwcHBwgICAcHBwcHBwgICAgICAgICAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHCAcHBwgICAgICAgICAgICAgICAgICAAICAgICAgICAgICAgAAAgICAgICAgICAAAAAAAAAAABQUFBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwYGBgcHBwgGBgcIBwcHBwcHCAgIBwcHBwcICAgICAgICAcHBwcHCAcHBwcHBwcHBwcHBwcHBwcHBwcHCAgHBwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgFBwgIAAAAAAAAAAAAAAUFBQcIBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwgHBwcHCAcHBwcHBwcHBwcHBwcIBwgICAgICAgICAAICAgICAgICAcHBwgICAgIBwcHBwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAgICAgICAgICAgICAgICAgICAgIAAAAAAAAAAAAAAAAAAAFBQcHBwgHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwgICAcHBwcHBwcHBwcHBwcHBwgHBwcHBwcHBwcHBwcHBwcHCAgHBwcICAgICAgICAAAAAgICAgICAgIAgcICAgHBwcHBwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAACAgICAgICAgICAgICAgICAgICAgICAAICAgICAAAAAAAAAAAAAcHBwcHBwcHBwcHAAAAAAAICAgHBwcHBwgICAcHCAgICAgICAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHCAcICAgHBwcHCAgICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAAICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAAAAAAAAAAAAAICAgAAAAAAAAAAAAAAAAICAgICAgICAAICAgICAgICAgICAgHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwgICAgHCAgHBwcAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAAAAAAAAAAAAAAAAgICAgICAAAAAAAAAAAAAAAAAgICAgICAgICAgIAAgICAgICAgICAgIBwcHCAcHCAgHBwcHBwcHBwcICAgIBwcHCAgHCAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAAAAAAAAAACAgICAgICAgICAgICAAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAcHBwcICAcHAAAAAAAABwgICAgICAgICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAgICAgICAgICAgICAgICAgIAAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAgICAgICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgICAgICAgICAgICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  // src/core/country-traits.generated.js
  var COUNTRY_TRAITS = { "af": { "continent": "Asia", "subregion": "Southern Asia", "landlocked": true, "island": false, "currency": "AFN", "currencyName": "Afghan afghani", "tld": ".af", "density": 58.325673458749215, "elevationMean": 1884, "languageFamily": "Turkic", "script": "Latin" }, "al": { "continent": "Europe", "subregion": "Southeast Europe", "landlocked": false, "island": false, "currency": "ALL", "currencyName": "Albanian lek", "tld": ".al", "density": 99.28311534715459, "elevationMean": 708, "languageFamily": null, "script": "Latin" }, "dz": { "continent": "Africa", "subregion": "Northern Africa", "landlocked": false, "island": false, "currency": "DZD", "currencyName": "Algerian dinar", "tld": ".dz", "density": 18.07629544942124, "elevationMean": 800, "languageFamily": "Semitic", "script": "Arabic" }, "ao": { "continent": "Africa", "subregion": "Middle Africa", "landlocked": false, "island": false, "currency": "AOA", "currencyName": "Angolan kwanza", "tld": ".ao", "density": 25.527628940402664, "elevationMean": 1112, "languageFamily": "Romance", "script": "Latin" }, "aq": { "continent": "Antarctica", "subregion": null, "landlocked": false, "island": true, "currency": null, "currencyName": null, "tld": ".aq", "density": 3207142857142857e-19, "elevationMean": 2300, "languageFamily": null, "script": null }, "ar": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "ARS", "currencyName": "Argentine peso", "tld": ".ar", "density": 16.162678751258813, "elevationMean": 595, "languageFamily": "Romance", "script": "Latin" }, "am": { "continent": "Asia", "subregion": "Western Asia", "landlocked": true, "island": false, "currency": "AMD", "currencyName": "Armenian dram", "tld": ".am", "density": 99.44292774770534, "elevationMean": 1792, "languageFamily": null, "script": null }, "au": { "continent": "Oceania", "subregion": "Australia and New Zealand", "landlocked": false, "island": true, "currency": "AUD", "currencyName": "Australian dollar", "tld": ".au", "density": 3.297481521118499, "elevationMean": 330, "languageFamily": "Germanic", "script": "Latin" }, "at": { "continent": "Europe", "subregion": "Central Europe", "landlocked": true, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".at", "density": 105.84191198388001, "elevationMean": 910, "languageFamily": "Germanic", "script": "Latin" }, "az": { "continent": "Asia", "subregion": "Western Asia", "landlocked": true, "island": false, "currency": "AZN", "currencyName": "Azerbaijani manat", "tld": ".az", "density": 115.74270207852194, "elevationMean": 384, "languageFamily": "Slavic", "script": "Latin" }, "bd": { "continent": "Asia", "subregion": "Southern Asia", "landlocked": false, "island": false, "currency": "BDT", "currencyName": "Bangladeshi taka", "tld": ".bd", "density": 1104.8733550179577, "elevationMean": 85, "languageFamily": "Indo-Aryan", "script": null }, "by": { "continent": "Europe", "subregion": "Eastern Europe", "landlocked": true, "island": false, "currency": "BYN", "currencyName": "Belarusian ruble", "tld": ".by", "density": 45.60142581888247, "elevationMean": 160, "languageFamily": "Slavic", "script": "Cyrillic" }, "be": { "continent": "Europe", "subregion": "Western Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".be", "density": 376.1810469077568, "elevationMean": 181, "languageFamily": "Romance", "script": "Latin" }, "bz": { "continent": "North America", "subregion": "Central America", "landlocked": false, "island": false, "currency": "BZD", "currencyName": "Belize dollar", "tld": ".bz", "density": 16.99699555865192, "elevationMean": 173, "languageFamily": "Romance", "script": "Latin" }, "bj": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "XOF", "currencyName": "West African CFA franc", "tld": ".bj", "density": 104.78548596189022, "elevationMean": 273, "languageFamily": "Romance", "script": "Latin" }, "bt": { "continent": "Asia", "subregion": "Southern Asia", "landlocked": true, "island": false, "currency": "BTN", "currencyName": "Bhutanese ngultrum", "tld": ".bt", "density": 19.875293014533522, "elevationMean": 2220, "languageFamily": null, "script": null }, "bo": { "continent": "South America", "subregion": "South America", "landlocked": true, "island": false, "currency": "BOB", "currencyName": "Bolivian boliviano", "tld": ".bo", "density": 10.479973711542435, "elevationMean": 1192, "languageFamily": "Romance", "script": "Latin" }, "ba": { "continent": "Europe", "subregion": "Southeast Europe", "landlocked": false, "island": false, "currency": "BAM", "currencyName": "Bosnia and Herzegovina convertible mark", "tld": ".ba", "density": 64.46132515768713, "elevationMean": 500, "languageFamily": "Slavic", "script": "Latin" }, "bw": { "continent": "Africa", "subregion": "Southern Africa", "landlocked": true, "island": false, "currency": "BWP", "currencyName": "Botswana pula", "tld": ".bw", "density": 3.958242268041237, "elevationMean": 1013, "languageFamily": "Germanic", "script": "Latin" }, "br": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "BRL", "currencyName": "Brazilian real", "tld": ".br", "density": 24.783384397435956, "elevationMean": 320, "languageFamily": "Romance", "script": "Latin" }, "bn": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": false, "island": false, "currency": "BND", "currencyName": "Brunei dollar", "tld": ".bn", "density": 75.15784908933217, "elevationMean": 478, "languageFamily": "Austronesian", "script": "Latin" }, "bg": { "continent": "Europe", "subregion": "Southeast Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".bg", "density": 62.913274831122216, "elevationMean": 472, "languageFamily": "Slavic", "script": "Cyrillic" }, "bf": { "continent": "Africa", "subregion": "Western Africa", "landlocked": true, "island": false, "currency": "XOF", "currencyName": "West African CFA franc", "tld": ".bf", "density": 74.44628105228837, "elevationMean": 297, "languageFamily": "Romance", "script": "Latin" }, "bi": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": true, "island": false, "currency": "BIF", "currencyName": "Burundian franc", "tld": ".bi", "density": 414.2624128763383, "elevationMean": 1504, "languageFamily": "Romance", "script": "Latin" }, "kh": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": false, "island": false, "currency": "KHR", "currencyName": "Cambodian riel", "tld": ".kh", "density": 91.06825751926424, "elevationMean": 126, "languageFamily": null, "script": null }, "cm": { "continent": "Africa", "subregion": "Middle Africa", "landlocked": false, "island": false, "currency": "XAF", "currencyName": "Central African CFA franc", "tld": ".cm", "density": 54.42594469987927, "elevationMean": 667, "languageFamily": "Romance", "script": "Latin" }, "ca": { "continent": "North America", "subregion": "North America", "landlocked": false, "island": false, "currency": "CAD", "currencyName": "Canadian dollar", "tld": ".ca", "density": 3.764697481238739, "elevationMean": 487, "languageFamily": "Romance", "script": "Latin" }, "cf": { "continent": "Africa", "subregion": "Middle Africa", "landlocked": true, "island": false, "currency": "XAF", "currencyName": "Central African CFA franc", "tld": ".cf", "density": 7.61686495961373, "elevationMean": 635, "languageFamily": "Romance", "script": "Latin" }, "td": { "continent": "Africa", "subregion": "Middle Africa", "landlocked": true, "island": false, "currency": "XAF", "currencyName": "Central African CFA franc", "tld": ".td", "density": 12.419685358255451, "elevationMean": 543, "languageFamily": "Romance", "script": "Latin" }, "cl": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "CLP", "currencyName": "Chilean peso", "tld": ".cl", "density": 25.065451486704173, "elevationMean": 1871, "languageFamily": "Romance", "script": "Latin" }, "cn": { "continent": "Asia", "subregion": "Eastern Asia", "landlocked": false, "island": false, "currency": "CNY", "currencyName": "Chinese yuan", "tld": ".cn", "density": 143.99099780044443, "elevationMean": 1840, "languageFamily": null, "script": null }, "co": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "COP", "currencyName": "Colombian peso", "tld": ".co", "density": 44.08980177762518, "elevationMean": 593, "languageFamily": "Romance", "script": "Latin" }, "cr": { "continent": "North America", "subregion": "Central America", "landlocked": false, "island": false, "currency": "CRC", "currencyName": "Costa Rican colón", "tld": ".cr", "density": 98.77810176125244, "elevationMean": 746, "languageFamily": "Romance", "script": "Latin" }, "hr": { "continent": "Europe", "subregion": "Southeast Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".hr", "density": 71.87157649220765, "elevationMean": 331, "languageFamily": "Slavic", "script": "Latin" }, "cu": { "continent": "North America", "subregion": "Caribbean", "landlocked": false, "island": true, "currency": "CUP", "currencyName": "Cuban peso", "tld": ".cu", "density": 103.14042990790288, "elevationMean": 108, "languageFamily": "Romance", "script": "Latin" }, "cy": { "continent": "Asia", "subregion": "Southern Europe", "landlocked": false, "island": true, "currency": "EUR", "currencyName": "Euro", "tld": ".cy", "density": 129.5616690087558, "elevationMean": 91, "languageFamily": "Turkic", "script": "Latin" }, "cz": { "continent": "Europe", "subregion": "Central Europe", "landlocked": true, "island": false, "currency": "CZK", "currencyName": "Czech koruna", "tld": ".cz", "density": 135.29080073543398, "elevationMean": 433, "languageFamily": "Slavic", "script": "Latin" }, "cd": { "continent": "Africa", "subregion": "Middle Africa", "landlocked": false, "island": false, "currency": "CDF", "currencyName": "Congolese franc", "tld": ".cd", "density": 37.01314407951356, "elevationMean": 726, "languageFamily": "Romance", "script": "Latin" }, "dk": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": false, "currency": "DKK", "currencyName": "Danish krone", "tld": ".dk", "density": 135.02002598969693, "elevationMean": 34, "languageFamily": "Germanic", "script": "Latin" }, "dj": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": false, "island": false, "currency": "DJF", "currencyName": "Djiboutian franc", "tld": ".dj", "density": 41.963793103448275, "elevationMean": 430, "languageFamily": "Romance", "script": "Latin" }, "do": { "continent": "North America", "subregion": "Caribbean", "landlocked": false, "island": false, "currency": "DOP", "currencyName": "Dominican peso", "tld": ".do", "density": 220.64387417558711, "elevationMean": 424, "languageFamily": "Romance", "script": "Latin" }, "tl": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": false, "island": false, "currency": "USD", "currencyName": "United States dollar", "tld": ".tl", "density": 86.93821433373672, "elevationMean": null, "languageFamily": "Romance", "script": "Latin" }, "ec": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "USD", "currencyName": "United States dollar", "tld": ".ec", "density": 62.756824314317605, "elevationMean": 1117, "languageFamily": "Romance", "script": "Latin" }, "eg": { "continent": "Africa", "subregion": "Northern Africa", "landlocked": false, "island": false, "currency": "EGP", "currencyName": "Egyptian pound", "tld": ".eg", "density": 100.14272332784678, "elevationMean": 321, "languageFamily": "Semitic", "script": "Arabic" }, "sv": { "continent": "North America", "subregion": "Central America", "landlocked": false, "island": false, "currency": "USD", "currencyName": "United States dollar", "tld": ".sv", "density": 306.7132265576731, "elevationMean": 442, "languageFamily": "Romance", "script": "Latin" }, "gq": { "continent": "Africa", "subregion": "Middle Africa", "landlocked": false, "island": false, "currency": "XAF", "currencyName": "Central African CFA franc", "tld": ".gq", "density": 48.34002352857296, "elevationMean": 577, "languageFamily": "Romance", "script": "Latin" }, "er": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": false, "island": false, "currency": "ERN", "currencyName": "Eritrean nakfa", "tld": ".er", "density": 51.710850340136055, "elevationMean": 853, "languageFamily": "Germanic", "script": "Latin" }, "ee": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".ee", "density": 29.331815066221505, "elevationMean": 61, "languageFamily": "Uralic", "script": "Latin" }, "sz": { "continent": "Africa", "subregion": "Southern Africa", "landlocked": true, "island": false, "currency": "SZL", "currencyName": "Swazi lilangeni", "tld": ".sz", "density": 66.12128541810642, "elevationMean": 305, "languageFamily": "Germanic", "script": "Latin" }, "et": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": true, "island": false, "currency": "ETB", "currencyName": "Ethiopian birr", "tld": ".et", "density": 101.49300914606538, "elevationMean": 1330, "languageFamily": "Semitic", "script": null }, "fk": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": true, "currency": "FKP", "currencyName": "Falkland Islands pound", "tld": ".fk", "density": 0.2791423642487472, "elevationMean": null, "languageFamily": "Germanic", "script": "Latin" }, "fj": { "continent": "Oceania", "subregion": "Melanesia", "landlocked": false, "island": true, "currency": "FJD", "currencyName": "Fijian dollar", "tld": ".fj", "density": 48.705834063047284, "elevationMean": null, "languageFamily": "Germanic", "script": "Latin" }, "fi": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".fi", "density": 16.31182776635227, "elevationMean": 164, "languageFamily": "Germanic", "script": "Latin" }, "fr": { "continent": "Europe", "subregion": "Western Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".fr", "density": 121.55246467704076, "elevationMean": 375, "languageFamily": "Romance", "script": "Latin" }, "tf": { "continent": "Seven seas (open ocean)", "subregion": null, "landlocked": false, "island": true, "currency": "EUR", "currencyName": "Euro", "tld": ".tf", "density": 0.01807151155285917, "elevationMean": null, "languageFamily": "Romance", "script": "Latin" }, "ga": { "continent": "Africa", "subregion": "Middle Africa", "landlocked": false, "island": false, "currency": "XAF", "currencyName": "Central African CFA franc", "tld": ".ga", "density": 8.11669306753142, "elevationMean": 377, "languageFamily": "Romance", "script": "Latin" }, "gm": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "GMD", "currencyName": "dalasi", "tld": ".gm", "density": 219.6375713350173, "elevationMean": 34, "languageFamily": "Germanic", "script": "Latin" }, "ge": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "GEL", "currencyName": "lari", "tld": ".ge", "density": 53.377073170731705, "elevationMean": 1432, "languageFamily": null, "script": null }, "de": { "continent": "Europe", "subregion": "Western Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".de", "density": 232.7906466842521, "elevationMean": 263, "languageFamily": "Germanic", "script": "Latin" }, "gh": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "GHS", "currencyName": "Ghanaian cedi", "tld": ".gh", "density": 127.52053594261591, "elevationMean": 190, "languageFamily": "Germanic", "script": "Latin" }, "gr": { "continent": "Europe", "subregion": "Southern Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".gr", "density": 81.19040836427003, "elevationMean": 498, "languageFamily": null, "script": null }, "gl": { "continent": "North America", "subregion": "North America", "landlocked": false, "island": true, "currency": "DKK", "currencyName": "krone", "tld": ".gl", "density": 0.02595695646433244, "elevationMean": 1792, "languageFamily": null, "script": "Latin" }, "gt": { "continent": "North America", "subregion": "Central America", "landlocked": false, "island": false, "currency": "GTQ", "currencyName": "Guatemalan quetzal", "tld": ".gt", "density": 152.48579746347198, "elevationMean": 759, "languageFamily": "Romance", "script": "Latin" }, "gn": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "GNF", "currencyName": "Guinean franc", "tld": ".gn", "density": 51.94583029972708, "elevationMean": 472, "languageFamily": "Romance", "script": "Latin" }, "gw": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "XOF", "currencyName": "West African CFA franc", "tld": ".gw", "density": 53.17431141868512, "elevationMean": 70, "languageFamily": "Romance", "script": "Latin" }, "gy": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "GYD", "currencyName": "Guyanese dollar", "tld": ".gy", "density": 3.6412971172587674, "elevationMean": 207, "languageFamily": "Germanic", "script": "Latin" }, "ht": { "continent": "North America", "subregion": "Caribbean", "landlocked": false, "island": false, "currency": "HTG", "currencyName": "Haitian gourde", "tld": ".ht", "density": 405.87664864864865, "elevationMean": 470, "languageFamily": "Romance", "script": "Latin" }, "hn": { "continent": "North America", "subregion": "Central America", "landlocked": false, "island": false, "currency": "HNL", "currencyName": "Honduran lempira", "tld": ".hn", "density": 86.63831205774633, "elevationMean": 684, "languageFamily": "Romance", "script": "Latin" }, "hu": { "continent": "Europe", "subregion": "Central Europe", "landlocked": true, "island": false, "currency": "HUF", "currencyName": "Hungarian forint", "tld": ".hu", "density": 105.02159564862193, "elevationMean": 143, "languageFamily": "Uralic", "script": "Latin" }, "is": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": true, "currency": "ISK", "currencyName": "Icelandic króna", "tld": ".is", "density": 3.507893203883495, "elevationMean": 557, "languageFamily": "Germanic", "script": "Latin" }, "in": { "continent": "Asia", "subregion": "Southern Asia", "landlocked": false, "island": false, "currency": "INR", "currencyName": "Indian rupee", "tld": ".in", "density": 415.62900300828267, "elevationMean": 160, "languageFamily": "Germanic", "script": "Latin" }, "id": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": false, "island": false, "currency": "IDR", "currencyName": "Indonesian rupiah", "tld": ".id", "density": 142.09281364970238, "elevationMean": 367, "languageFamily": "Austronesian", "script": "Latin" }, "ir": { "continent": "Asia", "subregion": "Southern Asia", "landlocked": false, "island": false, "currency": "IRR", "currencyName": "Iranian rial", "tld": ".ir", "density": 50.305883709148496, "elevationMean": 1305, "languageFamily": "Iranian", "script": "Arabic" }, "iq": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "IQD", "currencyName": "Iraqi dinar", "tld": ".iq", "density": 89.68345512494382, "elevationMean": 312, "languageFamily": "Semitic", "script": "Arabic" }, "ie": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".ie", "density": 70.31781765400652, "elevationMean": 118, "languageFamily": "Germanic", "script": "Latin" }, "il": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "ILS", "currencyName": "Israeli new shekel", "tld": ".il", "density": 435.88348579682236, "elevationMean": 508, "languageFamily": "Semitic", "script": "Arabic" }, "it": { "continent": "Europe", "subregion": "Southern Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".it", "density": 200.10020707781348, "elevationMean": 538, "languageFamily": "Romance", "script": "Latin" }, "ci": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "XOF", "currencyName": "West African CFA franc", "tld": ".ci", "density": 79.75037136043515, "elevationMean": 250, "languageFamily": "Romance", "script": "Latin" }, "jm": { "continent": "North America", "subregion": "Caribbean", "landlocked": false, "island": true, "currency": "JMD", "currencyName": "Jamaican dollar", "tld": ".jm", "density": 268.2448366845601, "elevationMean": 18, "languageFamily": "Germanic", "script": "Latin" }, "jp": { "continent": "Asia", "subregion": "Eastern Asia", "landlocked": false, "island": true, "currency": "JPY", "currencyName": "Japanese yen", "tld": ".jp", "density": 334.09607863890136, "elevationMean": 438, "languageFamily": null, "script": null }, "jo": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "JOD", "currencyName": "Jordanian dinar", "tld": ".jo", "density": 113.0676949251192, "elevationMean": 812, "languageFamily": "Semitic", "script": "Arabic" }, "kz": { "continent": "Asia", "subregion": "Central Asia", "landlocked": true, "island": false, "currency": "KZT", "currencyName": "Kazakhstani tenge", "tld": ".kz", "density": 6.794352086315095, "elevationMean": 387, "languageFamily": "Slavic", "script": "Cyrillic" }, "ke": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": false, "island": false, "currency": "KES", "currencyName": "Kenyan shilling", "tld": ".ke", "density": 90.58746103758484, "elevationMean": 762, "languageFamily": "Germanic", "script": "Latin" }, "xk": { "continent": "Europe", "subregion": "Southeast Europe", "landlocked": true, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".xk", "density": 164.4891822515585, "elevationMean": 450, "languageFamily": "Slavic", "script": "Latin" }, "kw": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "KWD", "currencyName": "Kuwaiti dinar", "tld": ".kw", "density": 236.1142103490852, "elevationMean": 108, "languageFamily": "Semitic", "script": "Arabic" }, "kg": { "continent": "Asia", "subregion": "Central Asia", "landlocked": true, "island": false, "currency": "KGS", "currencyName": "Kyrgyzstani som", "tld": ".kg", "density": 32.29241164085201, "elevationMean": 2988, "languageFamily": "Slavic", "script": "Cyrillic" }, "la": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": true, "island": false, "currency": "LAK", "currencyName": "Lao kip", "tld": ".la", "density": 30.276414695945945, "elevationMean": 710, "languageFamily": null, "script": null }, "lv": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".lv", "density": 29.62854133428337, "elevationMean": 87, "languageFamily": null, "script": "Latin" }, "lb": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "LBP", "currencyName": "Lebanese pound", "tld": ".lb", "density": 655.923555300421, "elevationMean": 1250, "languageFamily": "Romance", "script": "Latin" }, "ls": { "continent": "Africa", "subregion": "Southern Africa", "landlocked": true, "island": false, "currency": "LSL", "currencyName": "Lesotho loti", "tld": ".ls", "density": 70.0137703837918, "elevationMean": 2161, "languageFamily": "Germanic", "script": "Latin" }, "lr": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "LRD", "currencyName": "Liberian dollar", "tld": ".lr", "density": 44.3334680207239, "elevationMean": 243, "languageFamily": "Germanic", "script": "Latin" }, "ly": { "continent": "Africa", "subregion": "Northern Africa", "landlocked": false, "island": false, "currency": "LYD", "currencyName": "Libyan dinar", "tld": ".ly", "density": 3.8518317287472863, "elevationMean": 423, "languageFamily": "Semitic", "script": "Arabic" }, "lt": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".lt", "density": 42.677549770290966, "elevationMean": 110, "languageFamily": null, "script": "Latin" }, "lu": { "continent": "Europe", "subregion": "Western Europe", "landlocked": true, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".lu", "density": 239.7122969837587, "elevationMean": 325, "languageFamily": "Romance", "script": "Latin" }, "mg": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": false, "island": true, "currency": "MGA", "currencyName": "Malagasy ariary", "tld": ".mg", "density": 45.94109610742691, "elevationMean": 615, "languageFamily": "Romance", "script": "Latin" }, "mw": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": true, "island": false, "currency": "MWK", "currencyName": "Malawian kwacha", "tld": ".mw", "density": 157.22584483980958, "elevationMean": 779, "languageFamily": "Germanic", "script": "Latin" }, "my": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": false, "island": false, "currency": "MYR", "currencyName": "Malaysian ringgit", "tld": ".my", "density": 96.5824886715054, "elevationMean": 419, "languageFamily": "Germanic", "script": "Latin" }, "ml": { "continent": "Africa", "subregion": "Western Africa", "landlocked": true, "island": false, "currency": "XOF", "currencyName": "West African CFA franc", "tld": ".ml", "density": 15.850796489575808, "elevationMean": 343, "languageFamily": "Romance", "script": "Latin" }, "mr": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "MRU", "currencyName": "Mauritanian ouguiya", "tld": ".mr", "density": 4.390895507907247, "elevationMean": 276, "languageFamily": "Semitic", "script": "Arabic" }, "mx": { "continent": "North America", "subregion": "North America", "landlocked": false, "island": false, "currency": "MXN", "currencyName": "Mexican peso", "tld": ".mx", "density": 64.94459000954502, "elevationMean": 1111, "languageFamily": "Romance", "script": "Latin" }, "md": { "continent": "Europe", "subregion": "Eastern Europe", "landlocked": true, "island": false, "currency": "MDL", "currencyName": "Moldovan leu", "tld": ".md", "density": 78.52145009750045, "elevationMean": 139, "languageFamily": "Romance", "script": "Latin" }, "mn": { "continent": "Asia", "subregion": "Eastern Asia", "landlocked": true, "island": false, "currency": "MNT", "currencyName": "Mongolian tögrög", "tld": ".mn", "density": 2.0619822135271817, "elevationMean": 1528, "languageFamily": null, "script": "Cyrillic" }, "me": { "continent": "Europe", "subregion": "Southeast Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".me", "density": 45.04322328410078, "elevationMean": 1086, "languageFamily": "Slavic", "script": "Latin" }, "ma": { "continent": "Africa", "subregion": "Northern Africa", "landlocked": false, "island": false, "currency": "MAD", "currencyName": "Moroccan dirham", "tld": ".ma", "density": 81.67454708319337, "elevationMean": 909, "languageFamily": "Semitic", "script": "Arabic" }, "mz": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": false, "island": false, "currency": "MZN", "currencyName": "Mozambican metical", "tld": ".mz", "density": 37.88225402013498, "elevationMean": 345, "languageFamily": "Romance", "script": "Latin" }, "mm": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": false, "island": false, "currency": "MMK", "currencyName": "Burmese kyat", "tld": ".mm", "density": 79.88054592375158, "elevationMean": 702, "languageFamily": null, "script": null }, "na": { "continent": "Africa", "subregion": "Southern Africa", "landlocked": false, "island": false, "currency": "NAD", "currencyName": "Namibian dollar", "tld": ".na", "density": 3.02142039570502, "elevationMean": 1141, "languageFamily": "Germanic", "script": "Latin" }, "np": { "continent": "Asia", "subregion": "Southern Asia", "landlocked": true, "island": false, "currency": "NPR", "currencyName": "Nepalese rupee", "tld": ".np", "density": 194.37773897446002, "elevationMean": 2565, "languageFamily": "Indo-Aryan", "script": null }, "nl": { "continent": "Europe", "subregion": "Western Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".nl", "density": 414.1660692951016, "elevationMean": 30, "languageFamily": "Germanic", "script": "Latin" }, "nc": { "continent": "Oceania", "subregion": "Melanesia", "landlocked": false, "island": true, "currency": "XPF", "currencyName": "CFP franc", "tld": ".nc", "density": 15.493943472409152, "elevationMean": null, "languageFamily": "Romance", "script": "Latin" }, "nz": { "continent": "Oceania", "subregion": "Australia and New Zealand", "landlocked": false, "island": true, "currency": "NZD", "currencyName": "New Zealand dollar", "tld": ".nz", "density": 18.17966702037587, "elevationMean": 388, "languageFamily": "Germanic", "script": "Latin" }, "ni": { "continent": "North America", "subregion": "Central America", "landlocked": false, "island": false, "currency": "NIO", "currencyName": "Nicaraguan córdoba", "tld": ".ni", "density": 50.20596289108941, "elevationMean": 298, "languageFamily": "Romance", "script": "Latin" }, "ne": { "continent": "Africa", "subregion": "Western Africa", "landlocked": true, "island": false, "currency": "XOF", "currencyName": "West African CFA franc", "tld": ".ne", "density": 18.398354380426202, "elevationMean": 474, "languageFamily": "Romance", "script": "Latin" }, "ng": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "NGN", "currencyName": "Nigerian naira", "tld": ".ng", "density": 217.54769487576968, "elevationMean": 380, "languageFamily": "Germanic", "script": "Latin" }, "kp": { "continent": "Asia", "subregion": "Eastern Asia", "landlocked": false, "island": false, "currency": "KPW", "currencyName": "North Korean won", "tld": ".kp", "density": 212.93003866000763, "elevationMean": 600, "languageFamily": null, "script": null }, "mk": { "continent": "Europe", "subregion": "Southeast Europe", "landlocked": true, "island": false, "currency": "MKD", "currencyName": "denar", "tld": ".mk", "density": 81.02745692840197, "elevationMean": 741, "languageFamily": "Slavic", "script": "Cyrillic" }, "no": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": false, "currency": "NOK", "currencyName": "Norwegian krone", "tld": ".no", "density": 16.515944929308652, "elevationMean": 460, "languageFamily": "Germanic", "script": "Latin" }, "om": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "OMR", "currencyName": "Omani rial", "tld": ".om", "density": 16.07426817447496, "elevationMean": 310, "languageFamily": "Semitic", "script": "Arabic" }, "pk": { "continent": "Asia", "subregion": "Southern Asia", "landlocked": false, "island": false, "currency": "PKR", "currencyName": "Pakistani rupee", "tld": ".pk", "density": 245.5634099547347, "elevationMean": 900, "languageFamily": "Germanic", "script": "Latin" }, "ps": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "EGP", "currencyName": "Egyptian pound", "tld": ".ps", "density": 753.2646302250804, "elevationMean": null, "languageFamily": "Semitic", "script": "Arabic" }, "pa": { "continent": "North America", "subregion": "Central America", "landlocked": false, "island": false, "currency": "PAB", "currencyName": "Panamanian balboa", "tld": ".pa", "density": 56.306124613813864, "elevationMean": 360, "languageFamily": "Romance", "script": "Latin" }, "pg": { "continent": "Oceania", "subregion": "Melanesia", "landlocked": false, "island": false, "currency": "PGK", "currencyName": "Papua New Guinean kina", "tld": ".pg", "density": 18.96143159623196, "elevationMean": 667, "languageFamily": "Germanic", "script": "Latin" }, "py": { "continent": "South America", "subregion": "South America", "landlocked": true, "island": false, "currency": "PYG", "currencyName": "Paraguayan guaraní", "tld": ".py", "density": 17.319241208402172, "elevationMean": 178, "languageFamily": "Romance", "script": "Latin" }, "pe": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "PEN", "currencyName": "Peruvian sol", "tld": ".pe", "density": 25.295711382366854, "elevationMean": 1555, "languageFamily": "Romance", "script": "Latin" }, "ph": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": false, "island": true, "currency": "PHP", "currencyName": "Philippine peso", "tld": ".ph", "density": 315.80449127070597, "elevationMean": 442, "languageFamily": "Germanic", "script": "Latin" }, "pl": { "continent": "Europe", "subregion": "Central Europe", "landlocked": false, "island": false, "currency": "PLN", "currencyName": "Polish złoty", "tld": ".pl", "density": 121.43723755033118, "elevationMean": 173, "languageFamily": "Slavic", "script": "Latin" }, "pt": { "continent": "Europe", "subregion": "Southern Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".pt", "density": 111.51500705831252, "elevationMean": 372, "languageFamily": "Romance", "script": "Latin" }, "pr": { "continent": "North America", "subregion": "Caribbean", "landlocked": false, "island": true, "currency": "USD", "currencyName": "United States dollar", "tld": ".pr", "density": 360.05569334836525, "elevationMean": 261, "languageFamily": "Romance", "script": "Latin" }, "qa": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "QAR", "currencyName": "Qatari riyal", "tld": ".qa", "density": 244.43871914379423, "elevationMean": 28, "languageFamily": "Semitic", "script": "Arabic" }, "rs": { "continent": "Europe", "subregion": "Southeast Europe", "landlocked": true, "island": false, "currency": "RSD", "currencyName": "Serbian dinar", "tld": ".rs", "density": 78.59774108486776, "elevationMean": 442, "languageFamily": "Slavic", "script": "Cyrillic" }, "cg": { "continent": "Africa", "subregion": "Middle Africa", "landlocked": false, "island": false, "currency": "XAF", "currencyName": "Central African CFA franc", "tld": ".cg", "density": 15.732479532163742, "elevationMean": 430, "languageFamily": "Romance", "script": "Latin" }, "ro": { "continent": "Europe", "subregion": "Southeast Europe", "landlocked": false, "island": false, "currency": "RON", "currencyName": "Romanian leu", "tld": ".ro", "density": 81.19662235570974, "elevationMean": 414, "languageFamily": "Romance", "script": "Latin" }, "ru": { "continent": "Europe", "subregion": "Eastern Europe", "landlocked": false, "island": false, "currency": "RUB", "currencyName": "Russian ruble", "tld": ".ru", "density": 8.443764861908026, "elevationMean": 600, "languageFamily": "Slavic", "script": "Cyrillic" }, "rw": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": true, "island": false, "currency": "RWF", "currencyName": "Rwandan franc", "tld": ".rw", "density": 479.41946996734754, "elevationMean": 1598, "languageFamily": "Romance", "script": "Latin" }, "sa": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "SAR", "currencyName": "Saudi riyal", "tld": ".sa", "density": 15.941148723769473, "elevationMean": 665, "languageFamily": "Semitic", "script": "Arabic" }, "sn": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "XOF", "currencyName": "West African CFA franc", "tld": ".sn", "density": 82.83956039487195, "elevationMean": 69, "languageFamily": "Romance", "script": "Latin" }, "sl": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "SLE", "currencyName": "Sierra Leonean leone", "tld": ".sl", "density": 108.91016169500976, "elevationMean": 279, "languageFamily": "Germanic", "script": "Latin" }, "sk": { "continent": "Europe", "subregion": "Central Europe", "landlocked": true, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".sk", "density": 111.22362705712014, "elevationMean": 458, "languageFamily": "Slavic", "script": "Latin" }, "si": { "continent": "Europe", "subregion": "Central Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".si", "density": 102.99146648251369, "elevationMean": 492, "languageFamily": "Slavic", "script": "Latin" }, "sb": { "continent": "Oceania", "subregion": "Melanesia", "landlocked": false, "island": true, "currency": "SBD", "currencyName": "Solomon Islands dollar", "tld": ".sb", "density": 23.180474806201552, "elevationMean": null, "languageFamily": "Germanic", "script": "Latin" }, "so": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": false, "island": false, "currency": "SOS", "currencyName": "Somali shilling", "tld": ".so", "density": 15.984012251100514, "elevationMean": 410, "languageFamily": "Semitic", "script": "Latin" }, "za": { "continent": "Africa", "subregion": "Southern Africa", "landlocked": false, "island": false, "currency": "ZAR", "currencyName": "South African rand", "tld": ".za", "density": 47.95781782206436, "elevationMean": 1034, "languageFamily": "Germanic", "script": "Latin" }, "kr": { "continent": "Asia", "subregion": "Eastern Asia", "landlocked": false, "island": false, "currency": "KRW", "currencyName": "South Korean won", "tld": ".kr", "density": 516.0073645344776, "elevationMean": 282, "languageFamily": null, "script": null }, "ss": { "continent": "Africa", "subregion": "Middle Africa", "landlocked": true, "island": false, "currency": "SSP", "currencyName": "South Sudanese pound", "tld": ".ss", "density": 17.84945905170675, "elevationMean": null, "languageFamily": "Germanic", "script": "Latin" }, "es": { "continent": "Europe", "subregion": "Southern Europe", "landlocked": false, "island": false, "currency": "EUR", "currencyName": "Euro", "tld": ".es", "density": 93.03858756660185, "elevationMean": 660, "languageFamily": "Romance", "script": "Latin" }, "lk": { "continent": "Asia", "subregion": "Southern Asia", "landlocked": false, "island": false, "currency": "LKR", "currencyName": "Sri Lankan rupee", "tld": ".lk", "density": 332.31214753848496, "elevationMean": 228, "languageFamily": "Indo-Aryan", "script": null }, "sd": { "continent": "Africa", "subregion": "Northern Africa", "landlocked": false, "island": false, "currency": "SDG", "currencyName": "Sudanese pound", "tld": ".sd", "density": 22.699731929071486, "elevationMean": 568, "languageFamily": "Germanic", "script": "Latin" }, "sr": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "SRD", "currencyName": "Surinamese dollar", "tld": ".sr", "density": 3.548791356366744, "elevationMean": 246, "languageFamily": "Germanic", "script": "Latin" }, "se": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": false, "currency": "SEK", "currencyName": "Swedish krona", "tld": ".se", "density": 22.84158829211961, "elevationMean": 320, "languageFamily": "Germanic", "script": "Latin" }, "ch": { "continent": "Europe", "subregion": "Western Europe", "landlocked": true, "island": false, "currency": "CHF", "currencyName": "Swiss franc", "tld": ".ch", "density": 207.7035171010561, "elevationMean": 1350, "languageFamily": "Romance", "script": "Latin" }, "sy": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "SYP", "currencyName": "Syrian pound", "tld": ".sy", "density": 92.18131007668215, "elevationMean": 514, "languageFamily": "Semitic", "script": "Arabic" }, "tw": { "continent": "Asia", "subregion": "Eastern Asia", "landlocked": false, "island": true, "currency": "TWD", "currencyName": "New Taiwan dollar", "tld": ".tw", "density": 651.186085707181, "elevationMean": 1150, "languageFamily": null, "script": null }, "tj": { "continent": "Asia", "subregion": "Central Asia", "landlocked": true, "island": false, "currency": "TJS", "currencyName": "Tajikistani somoni", "tld": ".tj", "density": 65.13639412997904, "elevationMean": 3186, "languageFamily": "Slavic", "script": "Cyrillic" }, "th": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": false, "island": false, "currency": "THB", "currencyName": "Thai baht", "tld": ".th", "density": 135.69064156532585, "elevationMean": 287, "languageFamily": null, "script": null }, "bs": { "continent": "North America", "subregion": "Caribbean", "landlocked": false, "island": true, "currency": "BSD", "currencyName": "Bahamian dollar", "tld": ".bs", "density": 27.93387362834397, "elevationMean": null, "languageFamily": "Germanic", "script": "Latin" }, "tg": { "continent": "Africa", "subregion": "Western Africa", "landlocked": false, "island": false, "currency": "XOF", "currencyName": "West African CFA franc", "tld": ".tg", "density": 142.33276393413755, "elevationMean": 236, "languageFamily": "Romance", "script": "Latin" }, "tt": { "continent": "North America", "subregion": "Caribbean", "landlocked": false, "island": true, "currency": "TTD", "currencyName": "Trinidad and Tobago dollar", "tld": ".tt", "density": 271.9245614035088, "elevationMean": 83, "languageFamily": "Germanic", "script": "Latin" }, "tn": { "continent": "Africa", "subregion": "Northern Africa", "landlocked": false, "island": false, "currency": "TND", "currencyName": "Tunisian dinar", "tld": ".tn", "density": 71.4792433225353, "elevationMean": 246, "languageFamily": "Semitic", "script": "Arabic" }, "tr": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "TRY", "currencyName": "Turkish lira", "tld": ".tr", "density": 106.47480990655494, "elevationMean": 1132, "languageFamily": "Turkic", "script": "Latin" }, "tm": { "continent": "Asia", "subregion": "Central Asia", "landlocked": true, "island": false, "currency": "TMT", "currencyName": "Turkmenistan manat", "tld": ".tm", "density": 12.173917230075805, "elevationMean": 230, "languageFamily": "Slavic", "script": "Latin" }, "ug": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": true, "island": false, "currency": "UGX", "currencyName": "Ugandan shilling", "tld": ".ug", "density": 183.2730035189402, "elevationMean": null, "languageFamily": "Germanic", "script": "Latin" }, "ua": { "continent": "Europe", "subregion": "Eastern Europe", "landlocked": false, "island": false, "currency": "UAH", "currencyName": "Ukrainian hryvnia", "tld": ".ua", "density": 73.54623860811931, "elevationMean": 175, "languageFamily": "Slavic", "script": "Cyrillic" }, "ae": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "AED", "currencyName": "United Arab Emirates dirham", "tld": ".ae", "density": 116.87235645933015, "elevationMean": 149, "languageFamily": "Semitic", "script": "Arabic" }, "gb": { "continent": "Europe", "subregion": "Northern Europe", "landlocked": false, "island": false, "currency": "GBP", "currencyName": "British pound", "tld": ".uk", "density": 275.15193495265544, "elevationMean": 162, "languageFamily": "Germanic", "script": "Latin" }, "tz": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": false, "island": false, "currency": "TZS", "currencyName": "Tanzanian shilling", "tld": ".tz", "density": 61.37579185831569, "elevationMean": 1018, "languageFamily": "Germanic", "script": "Latin" }, "us": { "continent": "North America", "subregion": "North America", "landlocked": false, "island": false, "currency": "USD", "currencyName": "United States dollar", "tld": ".us", "density": 35.021143843603866, "elevationMean": 760, "languageFamily": "Germanic", "script": "Latin" }, "uy": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "UYU", "currencyName": "Uruguayan peso", "tld": ".uy", "density": 19.12201023012252, "elevationMean": 109, "languageFamily": "Romance", "script": "Latin" }, "uz": { "continent": "Asia", "subregion": "Central Asia", "landlocked": true, "island": false, "currency": "UZS", "currencyName": "Uzbekistani soʻm", "tld": ".uz", "density": 75.05733124720608, "elevationMean": null, "languageFamily": "Slavic", "script": "Latin" }, "vu": { "continent": "Oceania", "subregion": "Melanesia", "landlocked": false, "island": true, "currency": "VUV", "currencyName": "Vanuatu vatu", "tld": ".vu", "density": 24.602674542620395, "elevationMean": null, "languageFamily": "Romance", "script": "Latin" }, "ve": { "continent": "South America", "subregion": "South America", "landlocked": false, "island": false, "currency": "VES", "currencyName": "Venezuelan bolívar soberano", "tld": ".ve", "density": 31.11570143325568, "elevationMean": 450, "languageFamily": "Romance", "script": "Latin" }, "vn": { "continent": "Asia", "subregion": "South-Eastern Asia", "landlocked": false, "island": false, "currency": "VND", "currencyName": "Vietnamese đồng", "tld": ".vn", "density": 291.2397678828062, "elevationMean": 398, "languageFamily": null, "script": "Latin" }, "eh": { "continent": "Africa", "subregion": "Northern Africa", "landlocked": false, "island": false, "currency": "DZD", "currencyName": "Algerian dinar", "tld": ".eh", "density": 2.2678684210526314, "elevationMean": 256, "languageFamily": "Romance", "script": "Latin" }, "ye": { "continent": "Asia", "subregion": "Western Asia", "landlocked": false, "island": false, "currency": "YER", "currencyName": "Yemeni rial", "tld": ".ye", "density": 55.2342604097218, "elevationMean": 999, "languageFamily": "Semitic", "script": "Arabic" }, "zm": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": true, "island": false, "currency": "ZMW", "currencyName": "Zambian kwacha", "tld": ".zm", "density": 23.732055826906826, "elevationMean": 1138, "languageFamily": "Germanic", "script": "Latin" }, "zw": { "continent": "Africa", "subregion": "Eastern Africa", "landlocked": true, "island": false, "currency": "BWP", "currencyName": "Botswana pula", "tld": ".zw", "density": 37.47973292864875, "elevationMean": 961, "languageFamily": "Germanic", "script": "Latin" } };

  // src/core/environment.ts
  var CLIMATE_CATEGORIES = [
    null,
    "Tropical",
    "Arid / Semi-arid",
    "Mediterranean",
    "Subtropical",
    "Oceanic",
    "Continental",
    "Boreal / Subarctic",
    "Polar / Alpine"
  ];
  var climateGrid = null;
  function decodeBase64(text) {
    if (typeof atob === "function") {
      return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
    }
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"));
    return null;
  }
  function getClimateGrid() {
    if (climateGrid) return climateGrid;
    climateGrid = decodeBase64(CLIMATE_GRID_BASE64);
    return climateGrid;
  }
  function countryTraits(iso) {
    if (typeof iso !== "string") return null;
    return COUNTRY_TRAITS[iso.toLowerCase()] || null;
  }
  function climateRegionsFor(label) {
    const code = CLIMATE_CATEGORIES.indexOf(label);
    const grid = getClimateGrid();
    if (!grid || code <= 0) return [];
    const regions = [];
    for (let row = 0; row < CLIMATE_GRID_HEIGHT; row++) {
      let column = 0;
      while (column < CLIMATE_GRID_WIDTH) {
        if (grid[row * CLIMATE_GRID_WIDTH + column] !== code) {
          column++;
          continue;
        }
        let end = column + 1;
        while (end < CLIMATE_GRID_WIDTH && grid[row * CLIMATE_GRID_WIDTH + end] === code) end++;
        const south = -90 + row * 2;
        const west = -180 + column * 2;
        regions.push({
          south,
          north: south + 2,
          west,
          east: west + (end - column) * 2,
          area: end - column
        });
        column = end;
      }
    }
    return regions;
  }
  function climateAt(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const grid = getClimateGrid();
    if (!grid) return null;
    const row = Math.min(
      CLIMATE_GRID_HEIGHT - 1,
      Math.max(0, Math.floor((Math.max(-90, Math.min(90, latitude)) + 90) / 2))
    );
    const column = Math.min(
      CLIMATE_GRID_WIDTH - 1,
      Math.max(0, Math.floor(((longitude + 180) % 360 + 360) % 360 / 2))
    );
    const code = grid[row * CLIMATE_GRID_WIDTH + column];
    const label = CLIMATE_CATEGORIES[code];
    return label ? { code, label } : null;
  }
  function nearestMajorCity(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    let best = null;
    for (const city of MAJOR_CITIES) {
      const [name, cityLat, cityLng, iso, population] = city;
      const distanceKm = haversineKm(latitude, longitude, cityLat, cityLng);
      if (!Number.isFinite(distanceKm)) continue;
      if (!best || distanceKm < best.distanceKm) {
        const bearing = bearingDeg(cityLat, cityLng, latitude, longitude);
        best = {
          name,
          lat: cityLat,
          lng: cityLng,
          iso,
          population,
          distanceKm,
          bearing,
          direction: compassDirection(bearing)
        };
      }
    }
    return best;
  }
  function elevationBand(value) {
    if (value == null) return null;
    const elevation = Number(value);
    if (!Number.isFinite(elevation)) return null;
    if (elevation < 300) return { id: "lowland", label: "Lowland", detail: "below 300 m" };
    if (elevation < 1200) return { id: "upland", label: "Upland", detail: "roughly 300–1200 m" };
    if (elevation < 2500) return { id: "highland", label: "Highland", detail: "roughly 1200–2500 m" };
    return { id: "mountainous", label: "Mountainous", detail: "above 2500 m" };
  }
  function densityBand(value) {
    if (value == null) return null;
    const density = Number(value);
    if (!Number.isFinite(density) || density < 0) return null;
    if (density < 10)
      return { id: "sparse", label: "Sparsely Populated", detail: "under 10 people/km²" };
    if (density < 100)
      return { id: "moderate", label: "Moderately Populated", detail: "roughly 10–100 people/km²" };
    if (density < 300)
      return { id: "dense", label: "Densely Populated", detail: "roughly 100–300 people/km²" };
    return { id: "very-dense", label: "Very Densely Populated", detail: "above 300 people/km²" };
  }

  // src/core/sampling.ts
  var sampling_exports = {};
  __export(sampling_exports, {
    buildAnimationPoints: () => buildAnimationPoints,
    buildSchedule: () => buildSchedule,
    easeOutCubic: () => easeOutCubic,
    randomPointAnywhereInCountry: () => randomPointAnywhereInCountry,
    randomPointInCountry: () => randomPointInCountry,
    randomPointInPolygon: () => randomPointInPolygon,
    randomWeightedPoint: () => randomWeightedPoint,
    shouldSkipAnimation: () => shouldSkipAnimation,
    weightedPick: () => weightedPick
  });

  // src/core/heatmap.ts
  var heatmap_exports = {};
  __export(heatmap_exports, {
    buildHeatmapRaster: () => buildHeatmapRaster,
    centerDistance: () => centerDistance,
    centerHeatWeight: () => centerHeatWeight,
    halfSpan: () => halfSpan,
    heatmapColor: () => heatmapColor,
    heatmapFootprint: () => heatmapFootprint,
    heatmapWeightAt: () => heatmapWeightAt
  });
  function centerHeatWeight(distance, centerBias) {
    const bias = clamp2(Number(centerBias) || 0, 0, 1);
    return Math.exp(-CENTER_BIAS_FALLOFF * bias * distance * distance);
  }
  function heatmapFootprint(country) {
    if (!country?.polygons.length) return null;
    if (country.mainOnly === false) {
      const center2 = countryCenter(country);
      const span = country.span;
      if (!center2 || !span) return null;
      return {
        center: center2,
        halfLat: halfSpan(span.minLat, span.maxLat),
        halfLng: halfSpan(span.minLng, span.maxLng)
      };
    }
    const main = mainPolygon(country);
    const center = main ? polygonCenter(main) : null;
    if (!main || !center) return null;
    return {
      center,
      halfLat: halfSpan(main.minLat, main.maxLat),
      halfLng: halfSpan(main.minLng, main.maxLng)
    };
  }
  function heatmapWeightAt(footprint, lat, lng, centerBias) {
    if (!footprint) return 0;
    const distance = centerDistance(
      { lat, lng },
      footprint.center,
      footprint.halfLat,
      footprint.halfLng
    );
    return centerHeatWeight(distance, centerBias);
  }
  function heatmapColor(value) {
    const target = clamp2(Number(value) || 0, 0, 1);
    let low = HEATMAP_RAMP[0];
    let high = HEATMAP_RAMP[HEATMAP_RAMP.length - 1];
    for (let index = 1; index < HEATMAP_RAMP.length; index++) {
      if (target <= HEATMAP_RAMP[index][0]) {
        low = HEATMAP_RAMP[index - 1];
        high = HEATMAP_RAMP[index];
        break;
      }
    }
    const span = high[0] - low[0] || 1;
    const ratio = (target - low[0]) / span;
    return low[1].map((channel, index) => channel + (high[1][index] - channel) * ratio);
  }
  function buildHeatmapRaster({ polygon, footprint, bias, width, height, pointAt }) {
    const columns = Math.max(1, Math.round(Number(width) || 1));
    const rows = Math.max(1, Math.round(Number(height) || 1));
    const data = new Float32Array(columns * rows);
    if (!polygon || !footprint || typeof pointAt !== "function") {
      return { width: columns, height: rows, data, max: 0 };
    }
    let max = 0;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const point = pointAt(column, row);
        if (!point) continue;
        if (!polygonContains(point.lat, point.lng, polygon.rings)) continue;
        const weight = heatmapWeightAt(footprint, point.lat, point.lng, bias);
        data[row * columns + column] = weight;
        if (weight > max) max = weight;
      }
    }
    return { width: columns, height: rows, data, max };
  }
  function halfSpan(min, max) {
    return Math.max((max - min) / 2, 1e-6);
  }
  function centerDistance(point, center, halfLat, halfLng) {
    const dx = (unwrapLng(point.lng, center.lng) - center.lng) / halfLng;
    const dy = (point.lat - center.lat) / halfLat;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // src/core/sampling.ts
  function weightedPick(items, rng) {
    let total = 0;
    for (const item of items) total += item.weight;
    if (total <= 0) return items[0] || null;
    let value = rng() * total;
    for (const item of items) {
      value -= item.weight;
      if (value <= 0) return item;
    }
    return items[items.length - 1];
  }
  function randomWeightedPoint(center, halfLat, halfLng, bias, rng, sample) {
    let fallback = null;
    let fallbackWeight = -1;
    for (let attempt = 0; attempt < 256; attempt++) {
      const point = sample(rng);
      if (!point) break;
      const weight = centerHeatWeight(centerDistance(point, center, halfLat, halfLng), bias);
      if (weight > fallbackWeight) {
        fallback = point;
        fallbackWeight = weight;
      }
      if (rng() < weight) return point;
    }
    return fallback;
  }
  function randomPointInPolygon(polygon, rng) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const lat = polygon.minLat + rng() * (polygon.maxLat - polygon.minLat);
      const lng = normalizeLng(polygon.minLng + rng() * (polygon.maxLng - polygon.minLng));
      if (polygonContains(lat, lng, polygon.rings)) return { lat, lng };
    }
    const vertex = polygon.rings[0][Math.floor(rng() * polygon.rings[0].length)] || polygon.rings[0][0];
    return { lat: vertex[1], lng: normalizeLng(vertex[0]) };
  }
  function randomPointAnywhereInCountry(country, rng) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const polygon2 = weightedPick(country.polygons, rng);
      if (!polygon2) break;
      const lat = polygon2.minLat + rng() * (polygon2.maxLat - polygon2.minLat);
      const lng = normalizeLng(polygon2.minLng + rng() * (polygon2.maxLng - polygon2.minLng));
      if (polygonContains(lat, lng, polygon2.rings)) return { lat, lng };
    }
    const polygon = country.polygons.reduce(
      (a, b) => a.area >= b.area ? a : b,
      country.polygons[0]
    );
    const vertex = polygon.rings[0][Math.floor(rng() * polygon.rings[0].length)] || polygon.rings[0][0];
    return { lat: vertex[1], lng: normalizeLng(vertex[0]) };
  }
  function randomPointInCountry(country, rng = Math.random, centerBias = 0) {
    if (!country?.polygons.length) return null;
    const bias = clamp2(Number(centerBias) || 0, 0, 1);
    if (bias <= 0) return randomPointAnywhereInCountry(country, rng);
    const footprint = heatmapFootprint(country);
    if (!footprint) return randomPointAnywhereInCountry(country, rng);
    if (bias >= 1) return { ...footprint.center };
    return randomWeightedPoint(
      footprint.center,
      footprint.halfLat,
      footprint.halfLng,
      bias,
      rng,
      (random) => randomPointAnywhereInCountry(country, random)
    );
  }
  function shouldSkipAnimation(centerBias) {
    return clamp2(Number(centerBias) || 0, 0, 1) >= 1;
  }
  function buildAnimationPoints(country, count, rng = Math.random, centerBias = 0) {
    const points = [];
    for (let i = 0; i < count; i++) {
      const point = randomPointInCountry(country, rng, centerBias);
      if (point) points.push(point);
    }
    return points;
  }
  function easeOutCubic(value) {
    const progress = clamp2(value, 0, 1);
    return 1 - (1 - progress) ** 3;
  }
  function buildSchedule(durationMs, startIntervalMs, endIntervalMs) {
    const duration = Math.max(100, Number(durationMs) || 2800);
    const start = Math.max(10, Number(startIntervalMs) || 45);
    const end = Math.max(start, Number(endIntervalMs) || 320);
    const ticks = [];
    let elapsed = 0;
    while (true) {
      const progress = clamp2(elapsed / duration, 0, 1);
      ticks.push({ at: elapsed, progress });
      if (elapsed >= duration) break;
      const interval = start + (end - start) * easeOutCubic(progress);
      elapsed = Math.min(duration, elapsed + interval);
    }
    if (ticks.length === 1) ticks.push({ at: duration, progress: 1 });
    return ticks;
  }

  // src/core/cases.ts
  function caseRarity(value) {
    return CASE_RARITY_BY_ID.get(String(value || "").toLowerCase()) || null;
  }
  function countryFlagEmoji(iso) {
    const code = String(iso || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return "";
    return String.fromCodePoint(...Array.from(code, (letter) => 127397 + letter.charCodeAt(0)));
  }
  function roundCoordinate(value, decimals = 0) {
    const precision = clamp2(Math.trunc(Number(decimals) || 0), 0, 4);
    const factor = 10 ** precision;
    return Math.round(Number(value) * factor) / factor;
  }
  function formatCoordinate(value, axis, decimals = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    const rounded = Math.abs(roundCoordinate(number, decimals)).toFixed(
      clamp2(Math.trunc(Number(decimals) || 0), 0, 4)
    );
    const positive = axis === "lat" ? number >= 0 : number >= 0;
    return `${rounded}°${positive ? axis === "lat" ? "N" : "E" : axis === "lat" ? "S" : "W"}`;
  }
  function formatCoordinates(lat, lng, decimals = 0) {
    return `${formatCoordinate(lat, "lat", decimals)}, ${formatCoordinate(lng, "lng", decimals)}`;
  }
  function segmentDistanceKm(lat, lng, aLng, aLat, bLng, bLat) {
    const values = [lat, lng, aLng, aLat, bLng, bLat].map(Number);
    if (values.some((value) => !Number.isFinite(value))) return Infinity;
    const [pointLat, pointLng, aLngValue, aLatValue, bLngValue, bLatValue] = values;
    const reference = pointLng;
    const cosLat = Math.cos(pointLat * Math.PI / 180);
    const scaleX = 111.32 * Math.max(0.01, cosLat);
    const scaleY = 110.574;
    const ax = (unwrapLng(aLngValue, reference) - reference) * scaleX;
    const ay = (aLatValue - pointLat) * scaleY;
    const bx = (unwrapLng(bLngValue, reference) - reference) * scaleX;
    const by = (bLatValue - pointLat) * scaleY;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0) return Math.hypot(ax, ay);
    const t = clamp2(-(ax * dx + ay * dy) / lengthSquared, 0, 1);
    return Math.hypot(ax + dx * t, ay + dy * t);
  }
  function distanceToBorderKm(lat, lng, country) {
    let nearest = Infinity;
    if (!country?.polygons?.length) return nearest;
    for (const polygon of country.polygons) {
      for (const ring of polygon.rings) {
        if (!ring.length) continue;
        for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
          const a = ring[previous];
          const b = ring[index];
          const distance = segmentDistanceKm(lat, lng, a[0], a[1], b[0], b[1]);
          if (distance < nearest) nearest = distance;
        }
      }
    }
    return nearest;
  }
  function caseLatitudeBand(lat) {
    const absolute = Math.abs(Number(lat));
    if (!Number.isFinite(absolute)) return null;
    if (absolute <= 23.5)
      return { title: "Tropical Band", detail: "The location lies between the Tropics." };
    if (absolute <= 35)
      return { title: "Subtropical Band", detail: "The location is in the subtropics." };
    if (absolute <= 55)
      return { title: "Temperate Band", detail: "The location is in the mid-latitudes." };
    if (absolute <= 66.5)
      return { title: "Subpolar Band", detail: "The location is close to the polar circle." };
    return { title: "Polar Band", detail: "The location is in a polar region." };
  }
  function caseBorderBand(distance) {
    if (!Number.isFinite(distance)) return null;
    if (distance <= 25)
      return { title: "Near a Border", detail: "The location is within 25 km of a border." };
    if (distance <= 75)
      return { title: "Border Country", detail: "The location is roughly 25-75 km from a border." };
    if (distance <= 200)
      return {
        title: "Moderately Inland",
        detail: "The location is roughly 75-200 km from a border."
      };
    return { title: "Deep Inland", detail: "The location is more than 200 km from a border." };
  }
  function caseHintEligible(type, context) {
    if (!type || !Number.isFinite(Number(context?.lat)) || !Number.isFinite(Number(context?.lng)))
      return false;
    const lat = Number(context.lat);
    const lng = Number(context.lng);
    const country = context?.country;
    const traits = country ? countryTraits(country.iso) : null;
    if (type.requiresCountry && !country?.name) return false;
    switch (type.id) {
      case "hemisphere":
      case "longitude-half":
      case "tropical-band":
      case "radius-50":
      case "radius-20":
      case "coords-01":
      case "coords-005":
      case "exact":
        return true;
      case "landlocked":
        return !!traits && typeof traits.landlocked === "boolean";
      case "island-nation":
        return !!traits && typeof traits.island === "boolean";
      case "continent":
        return !!traits?.continent;
      case "climate-group":
        return !!climateAt(lat, lng);
      case "elevation-band":
        return Number.isFinite(Number(traits?.elevationMean));
      case "population-density":
        return Number.isFinite(Number(traits?.density));
      case "subregion":
        return !!traits?.subregion;
      case "script-family":
        return !!traits?.script;
      case "language-family":
        return !!traits?.languageFamily;
      case "currency":
        return !!traits?.currency;
      case "tld":
        return !!traits?.tld;
      case "country-name":
      case "country-outline":
        return !!country?.name && typeof country?.iso === "string";
      case "country-flag":
        return !!countryFlagEmoji(country?.iso);
      case "country-iso":
        return typeof country?.iso === "string" && country.iso.length === 2;
      case "nearest-city":
        return !!nearestMajorCity(lat, lng);
      default:
        return false;
    }
  }
  function buildCaseHint(type, context) {
    if (!caseHintEligible(type, context)) return null;
    const lat = Number(context.lat);
    const lng = Number(context.lng);
    const country = context.country || null;
    const traits = country ? countryTraits(country.iso) : null;
    const rarity = type.rarity;
    const base = {
      id: type.id,
      rarity,
      label: type.label,
      family: type.family,
      scope: type.scope,
      title: "",
      detail: "",
      overlay: null,
      payload: null
    };
    if (type.id === "hemisphere") {
      const north = lat >= 0;
      base.title = north ? "Northern Hemisphere" : "Southern Hemisphere";
      base.detail = `The location is on the ${north ? "north" : "south"} side of the equator.`;
      base.overlay = "hemisphere";
      base.payload = { kind: "hemisphere", north };
    } else if (type.id === "longitude-half") {
      const east = normalizeLng(lng) >= 0;
      base.title = east ? "Eastern Hemisphere" : "Western Hemisphere";
      base.detail = `The location is in the ${east ? "east" : "west"}ern hemisphere.`;
      base.overlay = "longitude-half";
      base.payload = { kind: "longitude-half", east };
    } else if (type.id === "tropical-band") {
      const tropical = Math.abs(lat) <= 23.436;
      base.title = tropical ? "Within the Tropics" : "Outside the Tropics";
      base.detail = tropical ? "The location is between the Tropic of Cancer and the Tropic of Capricorn." : "The location is outside the tropics.";
      base.overlay = "tropical-band";
      base.payload = { kind: "tropical-band", tropical };
    } else if (type.id === "landlocked") {
      base.title = traits.landlocked ? "Landlocked Country" : "Coastal Country";
      base.detail = traits.landlocked ? "The target is in a country with no ocean coastline." : "The target is in a country with an ocean coastline.";
      base.overlay = "category";
      base.payload = { field: "landlocked", value: traits.landlocked, mainOnly: true };
    } else if (type.id === "island-nation") {
      base.title = traits.island ? "No Land Borders" : "Shares Land Borders";
      base.detail = traits.island ? "The target is in a country with no land borders." : "The target is in a country that shares land borders.";
      base.overlay = "category";
      base.payload = { field: "island", value: traits.island, mainOnly: true };
    } else if (type.id === "continent") {
      base.title = traits.continent;
      base.detail = `The target is in ${traits.continent}.`;
      base.overlay = "region";
      base.payload = { field: "continent", value: traits.continent };
    } else if (type.id === "climate-group") {
      const climate = climateAt(lat, lng);
      if (!climate) return null;
      base.title = climate.label;
      const article = /^[aeiou]/i.test(climate.label) ? "an" : "a";
      base.detail = `The target is in ${article} ${climate.label.toLowerCase()} climate zone.`;
      base.overlay = "climate";
      base.payload = { label: climate.label };
    } else if (type.id === "elevation-band") {
      const band = elevationBand(traits.elevationMean);
      if (!band) return null;
      base.title = `${band.label} Country`;
      base.detail = `The country's mean elevation is about ${Math.round(traits.elevationMean)} m (${band.detail}).`;
      base.overlay = "category";
      base.payload = { band: "elevation", value: band.id, mainOnly: true };
    } else if (type.id === "population-density") {
      const band = densityBand(traits.density);
      if (!band) return null;
      base.title = band.label;
      base.detail = `The country's population density is about ${Math.round(traits.density)} people/km² (${band.detail}).`;
      base.overlay = "category";
      base.payload = { band: "density", value: band.id, mainOnly: true };
    } else if (type.id === "subregion") {
      base.title = traits.subregion;
      base.detail = `The target is in ${traits.subregion}.`;
      base.overlay = "region";
      base.payload = { field: "subregion", value: traits.subregion };
    } else if (type.id === "script-family") {
      base.title = `${traits.script} Script`;
      base.detail = `An official language in this country uses ${traits.script} script.`;
      base.overlay = "category";
      base.payload = { field: "script", value: traits.script, mainOnly: true };
    } else if (type.id === "language-family") {
      base.title = `${traits.languageFamily} Language`;
      base.detail = `An official language in this country belongs to the ${traits.languageFamily} family.`;
      base.overlay = "category";
      base.payload = { field: "languageFamily", value: traits.languageFamily, mainOnly: true };
    } else if (type.id === "currency") {
      base.title = traits.currencyName || traits.currency;
      base.detail = `The country uses ${traits.currencyName || traits.currency} (${traits.currency}).`;
    } else if (type.id === "tld") {
      base.title = traits.tld;
      base.detail = `The country's internet TLD is ${traits.tld}.`;
    } else if (type.id === "country-name") {
      base.title = country.name;
      base.detail = `The location is in ${country.name}.`;
    } else if (type.id === "country-flag") {
      const flag = countryFlagEmoji(country.iso);
      if (!flag) return null;
      base.title = `${flag} ${country.name}`;
      base.detail = `The country flag is ${flag}.`;
    } else if (type.id === "country-outline") {
      base.title = "Country Outline";
      base.detail = "The country outline is highlighted on the guess map.";
      base.overlay = "outline";
      base.payload = { iso: country.iso };
    } else if (type.id === "country-iso") {
      const code = String(country.iso).toUpperCase();
      base.title = code;
      base.detail = `The country code is ${code}.`;
    } else if (type.id === "nearest-city") {
      const city = nearestMajorCity(lat, lng);
      if (!city) return null;
      const distance = Math.round(city.distanceKm);
      base.title = "Nearest Major City";
      base.detail = distance <= 5 ? `The target is in the ${city.name} urban area (${city.iso.toUpperCase()}).` : `About ${distance} km ${city.direction} of ${city.name} (${city.iso.toUpperCase()}).`;
      base.overlay = "center";
      base.payload = { lat: city.lat, lng: city.lng };
    } else if (type.id === "radius-50" || type.id === "radius-20") {
      const radiusKm = type.id === "radius-50" ? 50 : 20;
      const center = offsetRadiusCenter(lat, lng, radiusKm);
      if (!center) return null;
      base.title = `${radiusKm} km Radius`;
      base.detail = "The target is somewhere inside this circle.";
      base.overlay = "circle";
      base.payload = { ...center, radiusKm, offset: true };
    } else if (type.id === "coords-01" || type.id === "coords-005") {
      const decimals = type.id === "coords-01" ? 0 : 2;
      const cellLat = roundCoordinate(lat, decimals);
      const cellLng = roundCoordinate(lng, decimals);
      const half = 0.5 / 10 ** decimals;
      base.title = `${decimals === 0 ? "1" : "0.05"}° Coordinate Cell`;
      base.detail = `The target is inside the coordinate cell around ${formatCoordinates(cellLat, cellLng, decimals)}.`;
      base.overlay = "cell";
      base.payload = {
        south: cellLat - half,
        north: cellLat + half,
        west: cellLng - half,
        east: cellLng + half
      };
    } else if (type.id === "exact") {
      base.title = "Exact Location";
      base.detail = "The exact location is pinned on the guess map.";
      base.overlay = "pin";
      base.payload = { lat, lng };
    }
    return base.title ? base : null;
  }
  function pickCaseHint(rarity, context, used = /* @__PURE__ */ new Set(), rng = Math.random, familyFocus = null) {
    const available = CASE_HINT_TYPES.filter(
      (type) => !used.has(type.id) && caseHintEligible(type, context)
    );
    if (!available.length) return null;
    const requested = CASE_RARITY_BY_ID.get(rarity);
    const requestedRank = requested?.rank ?? 0;
    const matching = available.filter((type) => type.rarity === rarity);
    let pool = matching.length ? matching : [...available].sort((a, b) => {
      const rankA = CASE_RARITY_BY_ID.get(a.rarity)?.rank ?? 0;
      const rankB = CASE_RARITY_BY_ID.get(b.rarity)?.rank ?? 0;
      return Math.abs(rankA - requestedRank) - Math.abs(rankB - requestedRank);
    });
    if (Array.isArray(familyFocus) && familyFocus.length) {
      const focused = pool.filter((type) => familyFocus.includes(type.family));
      if (focused.length) pool = focused;
    }
    const usedFamilies = new Set(
      [...used].map((id) => CASE_HINT_TYPES.find((type) => type.id === id)?.family).filter(Boolean)
    );
    if (usedFamilies.size) {
      const diverse = pool.filter((type) => !usedFamilies.has(type.family));
      if (diverse.length) pool = diverse;
    }
    let value = Number(rng());
    if (!Number.isFinite(value)) value = 0;
    const index = Math.min(pool.length - 1, Math.max(0, Math.floor(value * pool.length)));
    return buildCaseHint(pool[index], context);
  }
  function pickCaseCrateOutcome(crateId, context, used = /* @__PURE__ */ new Set(), rng = Math.random) {
    const crate = CASE_CRATE_BY_ID.get(crateId) || CASE_CRATES[0];
    const weights = Object.entries(crate.weights).map(([rarity, weight]) => ({ rarity, weight }));
    const rolled = weightedPick(weights, rng);
    const hint = pickCaseHint(rolled?.rarity || "common", context, used, rng, crate.families);
    if (!hint) return null;
    return { crateId: crate.id, rolledRarity: rolled?.rarity || "common", hint };
  }
  function caseModeAllowed({ pathname = "/", isRated = null, hasLocation = true } = {}) {
    if (hasLocation === false) return false;
    const path = String(pathname || "/").split("?")[0];
    if (/(?:^|\/)(replay|summary|spectate|broadcast)(?:\/|$)/i.test(path)) return false;
    if (/^\/game\/[^/]+\/?$/i.test(path)) return true;
    if (/^\/party(?:\/|$)/i.test(path)) return isRated !== true;
    if (/^\/(?:duels|team-duels)\/[^/]+\/?$/i.test(path)) return isRated === false;
    return false;
  }
  function caseRoundKey({
    pathname = "/",
    gameId = null,
    roundNumber = null,
    panoId = null
  } = {}) {
    const pano = typeof panoId === "string" ? panoId.trim() : "";
    const game = typeof gameId === "string" ? gameId.trim() : "";
    const round = Number(roundNumber);
    if (game && Number.isFinite(round) && round > 0 && pano)
      return `duel:${game}:${Math.trunc(round)}:${pano}`;
    if (pano) return `std:${String(pathname || "/").split("?")[0]}:${pano}`;
    return null;
  }
  function normalizeCaseSnapshot(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const roundKey = typeof value.roundKey === "string" && value.roundKey ? value.roundKey : null;
    if (!roundKey) return null;
    const opened = [];
    for (const entry of Array.isArray(value.opened) ? value.opened : []) {
      const id = typeof entry === "string" ? entry : "";
      if (CASE_CRATE_BY_ID.has(id) && !opened.includes(id)) opened.push(id);
    }
    const hints = [];
    for (const entry of Array.isArray(value.hints) ? value.hints : []) {
      if (hints.length >= CASE_MAX_HINTS) break;
      if (!entry || typeof entry !== "object") continue;
      const type = CASE_HINT_TYPES.find((candidate) => candidate.id === entry.id);
      if (!type || hints.some((hint) => hint.id === type.id)) continue;
      if (typeof entry.title !== "string" || typeof entry.detail !== "string") continue;
      const overlay = [
        "outline",
        "region",
        "category",
        "climate",
        "circle",
        "cell",
        "hemisphere",
        "longitude-half",
        "tropical-band",
        "center",
        "pin"
      ].includes(entry.overlay) ? entry.overlay : null;
      hints.push({
        id: type.id,
        rarity: type.rarity,
        label: type.label,
        family: type.family,
        scope: type.scope,
        title: entry.title,
        detail: entry.detail,
        overlay,
        payload: entry.payload && typeof entry.payload === "object" ? entry.payload : null
      });
    }
    const used = [];
    for (const entry of Array.isArray(value.used) ? value.used : []) {
      if (typeof entry === "string" && CASE_HINT_TYPES.some((type) => type.id === entry) && !used.includes(entry)) {
        used.push(entry);
      }
    }
    for (const hint of hints) {
      if (!used.includes(hint.id)) used.push(hint.id);
    }
    return { roundKey, opened, hints, used };
  }
  function caseHintHasOverlay(hint) {
    return !!hint?.payload && (hint.overlay === "outline" || hint.overlay === "region" || hint.overlay === "category" || hint.overlay === "climate" || hint.overlay === "circle" || hint.overlay === "cell" || hint.overlay === "hemisphere" || hint.overlay === "longitude-half" || hint.overlay === "tropical-band" || hint.overlay === "center" || hint.overlay === "pin");
  }
  var CASE_AREA_OVERLAYS = /* @__PURE__ */ new Set([
    "outline",
    "region",
    "category",
    "climate",
    "hemisphere",
    "longitude-half",
    "tropical-band",
    "circle",
    "cell"
  ]);
  function caseHintIsAreaHint(hint) {
    return !!hint?.payload && CASE_AREA_OVERLAYS.has(hint.overlay);
  }
  function splitBandRects(rects) {
    const result = [];
    for (const rect of rects) {
      const west = Number(rect.west);
      const east = Number(rect.east);
      if (!Number.isFinite(west) || !Number.isFinite(east) || east <= west) continue;
      let start = west;
      while (start < east - 1e-9) {
        const end = Math.min(east, start + 90);
        result.push({ ...rect, west: start, east: end });
        start = end;
      }
    }
    return result;
  }
  function caseBandRects(hint) {
    const payload = hint?.payload;
    if (hint?.overlay === "hemisphere") {
      return splitBandRects([
        {
          north: payload?.north ? 85 : 0,
          south: payload?.north ? 0 : -85,
          west: -180,
          east: 180
        }
      ]);
    }
    if (hint?.overlay === "longitude-half") {
      return splitBandRects([
        {
          north: 85,
          south: -85,
          west: payload?.east ? 0 : -180,
          east: payload?.east ? 180 : 0
        }
      ]);
    }
    if (hint?.overlay === "tropical-band") {
      if (payload?.tropical)
        return splitBandRects([{ north: 23.436, south: -23.436, west: -180, east: 180 }]);
      return splitBandRects([
        { north: 85, south: 23.436, west: -180, east: 180 },
        { north: -23.436, south: -85, west: -180, east: 180 }
      ]);
    }
    return [];
  }
  function boundsUnion(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return {
      north: Math.max(a.north, b.north),
      south: Math.min(a.south, b.south),
      west: Math.min(a.west, b.west),
      east: Math.max(a.east, b.east)
    };
  }
  function boundsIntersection(a, b) {
    if (!a || !b) return null;
    const result = {
      north: Math.min(a.north, b.north),
      south: Math.max(a.south, b.south),
      west: Math.max(a.west, b.west),
      east: Math.min(a.east, b.east)
    };
    return result.north >= result.south && result.east >= result.west ? result : null;
  }
  function countryBounds(countries) {
    let bounds = null;
    for (const country of countries || []) {
      const polygon = mainPolygon(country);
      if (!polygon) continue;
      bounds = boundsUnion(bounds, {
        north: polygon.maxLat,
        south: polygon.minLat,
        west: polygon.minLng,
        east: polygon.maxLng
      });
    }
    return bounds;
  }
  function mergeBandRects(rects) {
    const merged = [];
    const sorted = (rects || []).slice().sort((a, b) => a.north - b.north || a.south - b.south || a.west - b.west);
    for (const rect of sorted) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.north - rect.north) < 1e-9 && Math.abs(last.south - rect.south) < 1e-9 && Math.abs(last.east - rect.west) < 1e-9) {
        last.east = rect.east;
      } else {
        merged.push({ ...rect });
      }
    }
    return merged;
  }
  function splitRectsForRender(rects) {
    const result = [];
    for (const rect of mergeBandRects(rects)) {
      let start = rect.west;
      while (start < rect.east - 1e-9) {
        const end = Math.min(rect.east, start + 90);
        result.push({ ...rect, west: start, east: end });
        start = end;
      }
    }
    return result;
  }
  function intersectRect(a, b) {
    if (!a || !b) return null;
    const rect = {
      north: Math.min(a.north, b.north),
      south: Math.max(a.south, b.south),
      west: Math.max(a.west, b.west),
      east: Math.min(a.east, b.east)
    };
    return rect.north > rect.south && rect.east > rect.west ? rect : null;
  }
  function intersectRectLists(a, b) {
    if (!a) return b ? b.map((rect) => ({ ...rect })) : null;
    if (!b) return a.map((rect) => ({ ...rect }));
    const result = [];
    for (const left of a) {
      for (const right of b) {
        const rect = intersectRect(left, right);
        if (rect) result.push(rect);
      }
    }
    return result;
  }
  function clipRingToRect(ring, rect) {
    let points = ring.map(([lng, lat]) => ({ lng, lat }));
    const edges = [
      {
        inside: (p) => p.lng >= rect.west,
        intersect: (a, b) => ({
          lng: rect.west,
          lat: a.lat + (b.lat - a.lat) * (rect.west - a.lng) / (b.lng - a.lng)
        })
      },
      {
        inside: (p) => p.lng <= rect.east,
        intersect: (a, b) => ({
          lng: rect.east,
          lat: a.lat + (b.lat - a.lat) * (rect.east - a.lng) / (b.lng - a.lng)
        })
      },
      {
        inside: (p) => p.lat >= rect.south,
        intersect: (a, b) => ({
          lng: a.lng + (b.lng - a.lng) * (rect.south - a.lat) / (b.lat - a.lat),
          lat: rect.south
        })
      },
      {
        inside: (p) => p.lat <= rect.north,
        intersect: (a, b) => ({
          lng: a.lng + (b.lng - a.lng) * (rect.north - a.lat) / (b.lat - a.lat),
          lat: rect.north
        })
      }
    ];
    for (const edge of edges) {
      if (!points.length) break;
      const output = [];
      for (let index = 0; index < points.length; index++) {
        const current = points[index];
        const previous = points[(index + points.length - 1) % points.length];
        const currentInside = edge.inside(current);
        const previousInside = edge.inside(previous);
        if (currentInside) {
          if (!previousInside) output.push(edge.intersect(previous, current));
          output.push(current);
        } else if (previousInside) {
          output.push(edge.intersect(previous, current));
        }
      }
      points = output;
    }
    return points.filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat)).map((point) => [point.lng, point.lat]);
  }
  function clipPolygonToRect(polygon, rect) {
    const rings = [];
    for (const ring of polygon.rings) {
      const clipped = clipRingToRect(ring, rect);
      if (clipped.length >= 3) rings.push(clipped);
    }
    return rings.length ? { rings } : null;
  }
  function rectRings(rect) {
    return [
      [
        [rect.west, rect.south],
        [rect.east, rect.south],
        [rect.east, rect.north],
        [rect.west, rect.north],
        [rect.west, rect.south]
      ]
    ];
  }
  function ringsBounds(rings) {
    let north = -85;
    let south = 85;
    let west = Infinity;
    let east = -Infinity;
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (lat > north) north = lat;
        if (lat < south) south = lat;
        if (lng < west) west = lng;
        if (lng > east) east = lng;
      }
    }
    return [north, south, west, east].every(Number.isFinite) ? { north, south, west, east } : null;
  }
  function countryContainsPoint(country, lat, lng) {
    const polygon = mainPolygon(country);
    return !!polygon && polygonContains(lat, lng, polygon.rings);
  }
  function caseCompositeGeometry(hints, countryIndex) {
    const areaHints = (hints || []).filter(caseHintIsAreaHint);
    const labels = areaHints.map((hint) => hint.title);
    const composite = areaHints.length > 1;
    const base = {
      areaHints,
      labels,
      composite,
      mode: "native",
      empty: true,
      bounds: null,
      polygons: []
    };
    if (!areaHints.length) return base;
    if (areaHints.some((hint) => hint.overlay === "circle")) {
      return { ...base, mode: "canvas" };
    }
    const countryPredicates = [];
    let climateHint = null;
    let rects = null;
    let hasRects = false;
    for (const hint of areaHints) {
      if (hint.overlay === "outline") {
        if (hint.payload?.iso) countryPredicates.push({ iso: hint.payload.iso });
      } else if (hint.overlay === "region" || hint.overlay === "category") {
        countryPredicates.push(hint.payload);
      } else if (hint.overlay === "hemisphere" || hint.overlay === "longitude-half" || hint.overlay === "tropical-band") {
        hasRects = true;
        rects = intersectRectLists(rects, mergeBandRects(caseBandRects(hint)));
      } else if (hint.overlay === "cell") {
        hasRects = true;
        rects = intersectRectLists(rects, [
          {
            north: Number(hint.payload?.north),
            south: Number(hint.payload?.south),
            west: Number(hint.payload?.west),
            east: Number(hint.payload?.east)
          }
        ]);
      } else if (hint.overlay === "climate") {
        climateHint = hint;
      }
    }
    let countries = [];
    if (countryPredicates.length) {
      countries = (countryIndex?.all || []).filter(
        (country) => countryPredicates.every((predicate) => caseHintCountryMatches(country, predicate))
      );
      if (!countries.length) return base;
    }
    if (hasRects && !rects?.length) return base;
    const polygons = [];
    if (climateHint) {
      const regions = climateRegionsFor(climateHint.payload?.label);
      if (!regions.length) return base;
      for (const region of regions) {
        const lat = (region.north + region.south) / 2;
        const lng = (region.west + region.east) / 2;
        if (countries.length && !countries.some((country) => countryContainsPoint(country, lat, lng)))
          continue;
        const pieces = rects ? rects.map((rect) => intersectRect(region, rect)).filter(Boolean) : [region];
        for (const piece of pieces) polygons.push(rectRings(piece));
      }
    } else if (countries.length) {
      const source = countries.map((country) => mainPolygon(country)).filter(Boolean);
      for (const polygon of source) {
        if (hasRects) {
          for (const rect of rects) {
            const clipped = clipPolygonToRect(polygon, rect);
            if (clipped) polygons.push(clipped.rings);
          }
        } else {
          polygons.push(polygon.rings);
        }
      }
    } else if (hasRects) {
      for (const rect of splitRectsForRender(rects)) polygons.push(rectRings(rect));
    }
    if (!polygons.length) return base;
    let bounds = null;
    for (const rings of polygons) {
      const next = ringsBounds(rings);
      if (!next) continue;
      bounds = bounds ? {
        north: Math.max(bounds.north, next.north),
        south: Math.min(bounds.south, next.south),
        west: Math.min(bounds.west, next.west),
        east: Math.max(bounds.east, next.east)
      } : next;
    }
    if (!bounds) return base;
    return { ...base, empty: false, bounds, polygons };
  }
  function caseAreaFilterPlan(hints, countryIndex) {
    const areaHints = (hints || []).filter(caseHintIsAreaHint);
    const layers = [];
    const countryPredicates = [];
    for (const hint of areaHints) {
      if (hint.overlay === "outline") {
        if (hint.payload?.iso) countryPredicates.push({ iso: hint.payload.iso });
      } else if (hint.overlay === "region" || hint.overlay === "category") {
        countryPredicates.push(hint.payload);
      }
    }
    let countries = [];
    if (countryPredicates.length) {
      countries = (countryIndex?.all || []).filter(
        (country) => countryPredicates.every((predicate) => caseHintCountryMatches(country, predicate))
      );
      if (!countries.length) {
        return {
          areaHints,
          layers: [],
          countries,
          bounds: null,
          labels: areaHints.map((hint) => hint.title),
          composite: areaHints.length > 1,
          empty: true
        };
      }
      layers.push({ kind: "countries", countries, mainOnly: true });
    }
    for (const hint of areaHints) {
      if (hint.overlay === "hemisphere" || hint.overlay === "longitude-half" || hint.overlay === "tropical-band") {
        const rects = caseBandRects(hint);
        if (rects.length) layers.push({ kind: "bands", rects });
      } else if (hint.overlay === "climate") {
        const regions = climateRegionsFor(hint.payload?.label);
        if (regions.length) layers.push({ kind: "climate", regions });
      } else if (hint.overlay === "circle") {
        layers.push({
          kind: "circle",
          lat: Number(hint.payload?.lat),
          lng: Number(hint.payload?.lng),
          radiusKm: Number(hint.payload?.radiusKm)
        });
      } else if (hint.overlay === "cell") {
        layers.push({
          kind: "cell",
          north: Number(hint.payload?.north),
          south: Number(hint.payload?.south),
          west: Number(hint.payload?.west),
          east: Number(hint.payload?.east)
        });
      }
    }
    let bounds = { north: 85, south: -85, west: -180, east: 180 };
    for (const layer of layers) {
      let layerBounds = null;
      if (layer.kind === "countries") layerBounds = countryBounds(layer.countries);
      else if (layer.kind === "bands") {
        for (const rect of layer.rects) layerBounds = boundsUnion(layerBounds, rect);
      } else if (layer.kind === "climate") {
        for (const region of layer.regions) layerBounds = boundsUnion(layerBounds, region);
      } else if (layer.kind === "circle") {
        layerBounds = coordinateHintBounds(layer.lat, layer.lng, layer.radiusKm);
      } else if (layer.kind === "cell") {
        layerBounds = { north: layer.north, south: layer.south, west: layer.west, east: layer.east };
      }
      bounds = boundsIntersection(bounds, layerBounds);
      if (!bounds) break;
    }
    return {
      areaHints,
      layers,
      countries,
      bounds,
      labels: areaHints.map((hint) => hint.title),
      composite: areaHints.length > 1,
      empty: !layers.length || !bounds
    };
  }
  function coordinateHintBounds(lat, lng, radiusKm = 0) {
    const latitude = clamp2(Number(lat), -85, 85);
    const longitude = Number(lng);
    const radius = Math.max(0, Number(radiusKm) || 0);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radius))
      return null;
    const latDelta = radius / 111.195;
    const cosLat = Math.max(0.05, Math.cos(latitude * Math.PI / 180));
    const lngDelta = radius / (111.195 * cosLat);
    return {
      north: clamp2(latitude + latDelta, -85, 85),
      south: clamp2(latitude - latDelta, -85, 85),
      west: longitude - lngDelta,
      east: longitude + lngDelta
    };
  }
  function offsetRadiusCenter(lat, lng, radiusKm) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    const radius = Number(radiusKm);
    if (![latitude, longitude, radius].every(Number.isFinite) || radius <= 0) return null;
    const angle = Math.random() * Math.PI * 2;
    const distance = radius * (0.55 + Math.random() * 0.23);
    const cosLat = Math.max(0.08, Math.cos(latitude * Math.PI / 180));
    const centerLat = clamp2(latitude + distance / 111.195 * Math.cos(angle), -84, 84);
    const centerLng = normalizeLng(longitude + distance / (111.32 * cosLat) * Math.sin(angle));
    return { lat: centerLat, lng: centerLng };
  }
  function caseHintCountryMatches(country, payload) {
    const traits = country ? countryTraits(country.iso) : null;
    if (!traits || !payload) return false;
    if (payload.iso) return String(country.iso).toLowerCase() === String(payload.iso).toLowerCase();
    if (payload.band === "elevation") {
      return elevationBand(traits.elevationMean)?.id === payload.value;
    }
    if (payload.band === "density") {
      return densityBand(traits.density)?.id === payload.value;
    }
    const field = payload.field;
    const value = payload.value;
    if (!field || value === void 0 || value === null) return false;
    return traits[field] === value;
  }
  function caseHintBandBounds(payload) {
    if (!payload) return null;
    if (payload.kind === "hemisphere") {
      return {
        north: 85,
        south: payload.north ? 0 : -85,
        west: -180,
        east: 180
      };
    }
    if (payload.kind === "longitude-half") {
      return {
        north: 85,
        south: -85,
        west: payload.east ? 0 : -180,
        east: payload.east ? 180 : 0
      };
    }
    if (payload.kind === "tropical-band") {
      if (payload.tropical) return { north: 23.436, south: -23.436, west: -180, east: 180 };
      return { north: 85, south: -85, west: -180, east: 180 };
    }
    return null;
  }
  function caseHintBounds(hint, countryIndex) {
    if (!caseHintHasOverlay(hint)) return null;
    const payload = hint.payload;
    if (hint.overlay === "outline") {
      const iso = typeof payload.iso === "string" ? payload.iso.toLowerCase() : "";
      const country = countryIndex?.byIso?.get(iso);
      const polygon = mainPolygon(country);
      if (!polygon) return null;
      let north = -85;
      let south = 85;
      let west = Infinity;
      let east = -Infinity;
      for (const ring of polygon.rings) {
        for (const [lng, lat] of ring) {
          if (lat > north) north = lat;
          if (lat < south) south = lat;
          if (lng < west) west = lng;
          if (lng > east) east = lng;
        }
      }
      if (![north, south, west, east].every(Number.isFinite)) return null;
      return { north, south, west, east };
    }
    if (hint.overlay === "circle") {
      return coordinateHintBounds(payload.lat, payload.lng, payload.radiusKm);
    }
    if (hint.overlay === "cell") {
      const north = Number(payload?.north);
      const south = Number(payload?.south);
      const west = Number(payload?.west);
      const east = Number(payload?.east);
      if (![north, south, west, east].every(Number.isFinite)) return null;
      return { north, south, west, east };
    }
    if (["hemisphere", "longitude-half", "tropical-band"].includes(hint.overlay)) {
      return caseHintBandBounds(payload);
    }
    if (hint.overlay === "climate") {
      const label = payload?.label;
      if (!label) return null;
      const regions = climateRegionsFor(label);
      if (!regions.length) return null;
      let north = -85;
      let south = 85;
      let west = Infinity;
      let east = -Infinity;
      for (const region of regions) {
        if (region.north > north) north = region.north;
        if (region.south < south) south = region.south;
        if (region.west < west) west = region.west;
        if (region.east > east) east = region.east;
      }
      return { north, south, west, east };
    }
    if (hint.overlay === "region" || hint.overlay === "category") {
      if (!countryIndex?.all) return null;
      let north = -85;
      let south = 85;
      let west = Infinity;
      let east = -Infinity;
      let count = 0;
      for (const country of countryIndex.all) {
        if (!caseHintCountryMatches(country, payload)) continue;
        const polygons = payload?.mainOnly ? [mainPolygon(country)].filter(Boolean) : country.polygons;
        for (const polygon of polygons) {
          for (const ring of polygon.rings) {
            for (const [lng, lat] of ring) {
              if (lat > north) north = lat;
              if (lat < south) south = lat;
              if (lng < west) west = lng;
              if (lng > east) east = lng;
            }
          }
        }
        count++;
      }
      if (!count || ![north, south, west, east].every(Number.isFinite)) return null;
      return { north, south, west, east };
    }
    return coordinateHintBounds(payload.lat, payload.lng, 0);
  }

  // src/core/duel.ts
  var duel_exports = {};
  __export(duel_exports, {
    DUEL_FRAME_HEADER_SIZE: () => DUEL_FRAME_HEADER_SIZE,
    DUEL_ROUND_END_CODES: () => DUEL_ROUND_END_CODES,
    DUEL_ROUND_START_CODES: () => DUEL_ROUND_START_CODES,
    DUEL_SAMPLE_PIN: () => DUEL_SAMPLE_PIN,
    encodeDuelPinFrame: () => encodeDuelPinFrame,
    encodeDuelPinPayload: () => encodeDuelPinPayload,
    parseDuelJsonEvent: () => parseDuelJsonEvent2,
    parseDuelStateEvent: () => parseDuelStateEvent2
  });
  function parseDuelJsonEvent2(message) {
    const event = parseDuelJsonEvent(message);
    if (!event) return null;
    if (event.kind === "round-start") {
      return { code: event.code, kind: "round-start", round: event.round };
    }
    return { code: event.code, kind: event.kind === "finished" ? "round-end" : event.kind };
  }
  function parseDuelStateEvent2(message) {
    const state3 = parseDuelStateEvent(message);
    if (!state3) return null;
    return { ...state3, panoId: state3.panoId ?? "" };
  }

  // src/core/encoding.ts
  var encoding_exports = {};
  __export(encoding_exports, {
    decodePanoId: () => decodePanoId2,
    hexToBytes: () => hexToBytes2
  });
  var hexToBytes2 = hexToBytes;
  function decodePanoId2(value) {
    return decodePanoId(value) ?? "";
  }

  // src/core/gamble.ts
  var gamble_exports = {};
  __export(gamble_exports, {
    createClickGate: () => createClickGate,
    isActivationPressed: () => isActivationPressed,
    makeFinalEvent: () => makeFinalEvent,
    runAnimation: () => runAnimation,
    unwrapClickHandler: () => unwrapClickHandler
  });
  function isActivationPressed(domEvent, activationKey) {
    if (!domEvent) return false;
    switch (activationKey) {
      case "shift":
        return domEvent.shiftKey === true;
      case "alt":
        return domEvent.altKey === true;
      case "ctrl":
        return domEvent.ctrlKey === true;
      case "meta":
        return domEvent.metaKey === true;
      default:
        return true;
    }
  }
  function makeFinalEvent(original, latLng, pixel = null, jj = null) {
    const finalEvent = Object.create(Object.getPrototypeOf(original));
    for (const key of Object.keys(original)) finalEvent[key] = original[key];
    finalEvent.latLng = latLng;
    if (pixel) finalEvent.pixel = pixel;
    if (jj) finalEvent.jj = jj;
    if (typeof finalEvent.stop !== "function") finalEvent.stop = () => {
    };
    return finalEvent;
  }
  function createClickGate({
    map,
    settings,
    index,
    onStart,
    onFinish,
    trigger,
    canStart,
    onGamblePoint,
    debug
  }) {
    let active = false;
    let bypass = false;
    let current = null;
    let generation = 0;
    let gate = null;
    const handlers = /* @__PURE__ */ new Set();
    function wrap(handler) {
      if (typeof handler !== "function") return handler;
      if (handler.__geogambleWrapped) {
        if (handler.__geogambleGate === gate) return handler;
        handler = unwrapClickHandler(handler);
      }
      const wrapped = function(event) {
        if (bypass) return handler.call(this, event);
        if (active) return;
        if (!event?.latLng || !event.domEvent) return handler.call(this, event);
        if (!isActivationPressed(event.domEvent, settings.activationKey))
          return handler.call(this, event);
        if (canStart && !canStart()) return handler.call(this, event);
        const lat = typeof event.latLng.lat === "function" ? event.latLng.lat() : event.latLng.lat;
        const lng = typeof event.latLng.lng === "function" ? event.latLng.lng() : event.latLng.lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return handler.call(this, event);
        const hit = findCountryAt(lat, lng, index);
        if (!hit) return handler.call(this, event);
        const finalPoint = randomPointInCountry(hit.country, Math.random, settings.centerBias);
        if (!finalPoint) return handler.call(this, event);
        try {
          if (onGamblePoint) onGamblePoint(finalPoint);
        } catch (error) {
          if (debug) debug("gamble point callback failed", error);
        }
        active = true;
        const nextGeneration = ++generation;
        current = { originalEvent: event, hit, finalPoint, generation: nextGeneration };
        if (debug) debug("gamble start", hit.country.iso, hit.country.name, finalPoint);
        try {
          onStart({ map, event, hit, finalPoint, generation: nextGeneration });
        } catch (error) {
          active = false;
          current = null;
          if (debug) debug("gamble start failed", error);
          return handler.call(this, event);
        }
      };
      wrapped.__geogambleWrapped = true;
      wrapped.__geogambleOriginal = handler;
      wrapped.__geogambleGate = gate;
      handlers.add(handler);
      return wrapped;
    }
    function finish(finalEvent) {
      if (!active) return false;
      active = false;
      const info = current;
      current = null;
      bypass = true;
      try {
        trigger(map, finalEvent);
      } catch (error) {
        if (debug) debug("final click failed", error);
        try {
          for (const handler of handlers) handler.call(map, finalEvent);
        } catch (fallbackError) {
          if (debug) debug("final fallback failed", fallbackError);
        }
      } finally {
        bypass = false;
      }
      if (onFinish) {
        try {
          onFinish(info);
        } catch (error) {
          if (debug) debug("finish callback failed", error);
        }
      }
      return true;
    }
    function failOpen(event) {
      if (!active) return;
      active = false;
      current = null;
      bypass = true;
      try {
        trigger(map, event);
      } catch (error) {
        if (debug) debug("fail-open trigger failed", error);
      } finally {
        bypass = false;
      }
    }
    function cancel() {
      if (!active) return;
      active = false;
      current = null;
      generation++;
    }
    gate = {
      wrap,
      finish,
      failOpen,
      cancel,
      isActive: () => active,
      isBypassing: () => bypass,
      handlers,
      getCurrent: () => current,
      getGeneration: () => generation
    };
    return gate;
  }
  function runAnimation({
    country,
    finalPoint,
    settings,
    onTick,
    onDone,
    onError,
    isAlive = () => true,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
  }) {
    const schedule = buildSchedule(
      settings.animationMs,
      settings.startIntervalMs,
      settings.endIntervalMs
    );
    const points = buildAnimationPoints(
      country,
      Math.max(1, schedule.length - 1),
      Math.random,
      settings.centerBias
    );
    while (points.length < schedule.length - 1) points.push(finalPoint);
    const ticks = schedule.map((tick, index2) => ({
      ...tick,
      point: index2 === schedule.length - 1 ? finalPoint : points[index2] || finalPoint
    }));
    let index = 0;
    let timer = null;
    let canceled = false;
    function step() {
      if (canceled) return;
      if (!isAlive()) {
        canceled = true;
        if (onError) onError(new Error("map unavailable"));
        return;
      }
      const tick = ticks[index];
      try {
        onTick(tick.point, tick.progress, index);
      } catch (error) {
        canceled = true;
        if (onError) onError(error);
        return;
      }
      index++;
      if (index >= ticks.length) {
        timer = setTimeoutFn(() => {
          if (canceled) return;
          if (!isAlive()) {
            canceled = true;
            if (onError) onError(new Error("map unavailable"));
            return;
          }
          try {
            if (onDone) onDone();
          } catch (error) {
            if (onError) onError(error);
          }
        }, settings.finalHoldMs);
        return;
      }
      timer = setTimeoutFn(step, Math.max(0, ticks[index].at - tick.at));
    }
    step();
    return {
      cancel() {
        canceled = true;
        if (timer !== null) clearTimeoutFn(timer);
      }
    };
  }
  function unwrapClickHandler(handler) {
    let current = handler;
    const seen = /* @__PURE__ */ new Set();
    while (current?.__geogambleWrapped && current.__geogambleOriginal && !seen.has(current)) {
      seen.add(current);
      current = current.__geogambleOriginal;
    }
    return current;
  }

  // src/core/hint-data-sources.generated.js
  var HINT_DATA_SOURCES = {
    "sources": [
      {
        "name": "Natural Earth Admin 0 Countries and Populated Places",
        "license": "Public domain",
        "url": "https://www.naturalearthdata.com/"
      },
      {
        "name": "mledoze/countries",
        "license": "ODbL 1.0",
        "url": "https://github.com/mledoze/countries"
      },
      {
        "name": "CIA World Factbook country profiles",
        "license": "Public domain",
        "url": "https://github.com/factbook/factbook.json"
      },
      {
        "name": "Koppen-Geiger climate classification lookup",
        "license": "ISC package; data citation: Kottek et al. 2006 and Rubel et al. 2017",
        "url": "https://koeppen-geiger.vu-wien.ac.at/present.htm"
      }
    ]
  };

  // src/core/index.ts
  var Core = {
    COUNTRY_DATA,
    HINT_DATA_SOURCES,
    ...constants_exports,
    ...geo_exports,
    ...countries_exports,
    ...heatmap_exports,
    ...sampling_exports,
    ...encoding_exports,
    ...duel_exports,
    ...config_exports,
    ...gamble_exports,
    ...cases_exports,
    ...environment_exports
  };

  // src/main.ts
  (() => {
    const VERSION = "2026.11.19";
    if (typeof globalThis !== "undefined" && globalThis.__GEOGAMBLE_TEST__) {
      globalThis.__GEOGAMBLE_EXPORTS__ = { VERSION, CONFIG, COUNTRY_DATA, Core };
      return;
    }
    Object.assign(CONFIG, geogambleConfig.get());
    const resolvedInitial = resolveConfig(CONFIG, COUNTRY_DATA);
    const settings = resolvedInitial.settings;
    let index = resolvedInitial.index;
    applyPerfTweaks();
    const trackedCanvases = /* @__PURE__ */ new Map();
    const trackedMaps = /* @__PURE__ */ new WeakMap();
    let staticHookInstalled = false;
    let audioContext = null;
    let masterGain = null;
    const GUESS_MAP_CANVAS_SELECTORS = '[data-qa="guess-map-canvas"], [class*="guess-map_canvas"]';
    let applyingFromStore = false;
    function applyResolved(trackedKeys) {
      const next = resolveConfig(CONFIG, COUNTRY_DATA);
      const structuralChange = jsonOf(next.settings, ["enabledCountries", "excludeCountries", "allowOtherModes"]) !== trackedKeys;
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
      let info;
      try {
        info = JSON.parse(data);
      } catch {
        return;
      }
      if (info?.code !== "SubscribeToLobby" || typeof info.gameId !== "string" || info.gameId.length !== 24)
        return;
      duelBridge = {
        socket,
        gameId: info.gameId,
        playerId: typeof info.playerId === "string" ? info.playerId : null,
        round: 1,
        confirmedDuel: false
      };
      debug("duel socket identified", duelBridge.gameId);
    }
    function onDuelMessage(event) {
      try {
        const parsed = parseDuelJsonEvent2(event?.data);
        const state3 = parseDuelStateEvent2(event?.data);
        if (state3) updateCaseDuel(state3);
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
        headerType: 5
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
    let caseHiddenHints = /* @__PURE__ */ new Set();
    let caseCountryIndex = null;
    let caseOverlayMap = null;
    let caseOverlaySignature = "";
    let caseOverlayBaseSignature = "";
    let caseOverlays = [];
    let caseFocusedHintIds = /* @__PURE__ */ new Set();
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
          excludeCountries: []
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
          source: "duel"
        };
      }
      if (casePano && Number.isFinite(casePano.lat) && Number.isFinite(casePano.lng) && casePano.panoId) {
        const key = caseRoundKey({ pathname: path, gameId, roundNumber, panoId: casePano.panoId });
        if (key)
          return {
            key,
            lat: casePano.lat,
            lng: casePano.lng,
            panoId: casePano.panoId,
            isRated,
            source: "panorama"
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
        area: "session"
      });
      store.set({
        roundKey: caseRound.key,
        opened: caseRound.opened,
        hints: caseRound.hints,
        used: caseRound.used
      });
    }
    function loadCaseRound(roundKey) {
      const store = createJsonStore({
        key: caseStorageKey(roundKey),
        version: 3,
        area: "session"
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
      caseHiddenHints = /* @__PURE__ */ new Set();
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
      caseRound = loaded ? { key: locationInfo.key, hints: loaded.hints, opened: loaded.opened, used: loaded.used } : { key: locationInfo.key, hints: [], opened: [], used: [] };
      caseLocation = locationInfo;
      caseHiddenHints = /* @__PURE__ */ new Set();
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
        hasLocation: true
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
        panoId: keepLocation ? previous.panoId : summary.panoId
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
      const pano = decodePanoId2(panoId);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !pano) return;
      if (casePano && casePano.lat === latitude && casePano.lng === longitude && casePano.panoId === pano) {
        return;
      }
      casePano = { lat: latitude, lng: longitude, panoId: pano };
      casePanoPath = location.pathname;
      scheduleCaseRefresh();
    }
    function updatePanoFromInstance(instance) {
      try {
        const panoId = decodePanoId2(typeof instance.getPano === "function" ? instance.getPano() : "");
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
        const target = decodePanoId2(panoId);
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
      onPanoramaChange((location2) => {
        if (location2.instance) trackPanoInstance(location2.instance);
      });
      casePanoHookInstalled = true;
    }
    function findDuelStateObject(value) {
      if (!value || typeof value !== "object") return null;
      const stack = [value];
      const seen = /* @__PURE__ */ new Set();
      let visited = 0;
      while (stack.length && visited < 3e4) {
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
        const nextData2 = JSON.parse(script.textContent || "null");
        const state3 = findDuelStateObject(nextData2);
        if (!state3) return;
        const summary = parseDuelStateEvent2(
          JSON.stringify({ gameId: state3.gameId || null, duel: { state: state3 } })
        );
        if (summary) updateCaseDuel(summary);
      } catch (error) {
        debug("case initial duel state failed", error);
      }
    }
    function handleCaseMapRemoved(map) {
      if (caseOverlayMap === map) clearCaseOverlays();
    }
    const CASE_CHEST_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.2h16V19H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3 9.2 5.2 5h13.6L21 9.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.8 9.2v3.2h4.4V9.2M12 12.4V19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
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
    `
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
      wrap = el2(
        "div",
        ["gg-case-wrap", ...nativeTokenClasses(nativeWrapper, ["styles_control__"])].join(" ")
      );
      wrap.id = GG_CASE_WRAP_ID;
      const hudClasses = nativeTokenClasses(nativeHud, [
        "styles_hudButton__",
        "styles_sizeSmall__",
        "styles_sizeLarge__"
      ]);
      const button = el2("button", ["gg-case-button", ...hudClasses].join(" "));
      button.id = GG_CASE_BUTTON_ID;
      button.type = "button";
      button.setAttribute("aria-haspopup", "dialog");
      const icon = el2("span", "gg-case-icon");
      icon.innerHTML = CASE_CHEST_SVG;
      const badge = el2("span", "gg-case-badge", "3");
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
      const text = remaining ? `Open cases (${remaining} left this round)` : "All cases opened this round";
      button.title = text;
      button.setAttribute("aria-label", text);
    }
    function ensureCaseDialog() {
      ensureCaseStyles();
      let dialog = document.getElementById(GG_CASE_DIALOG_ID);
      if (dialog) return dialog;
      dialog = el2("div", "gg-case-dialog");
      dialog.id = GG_CASE_DIALOG_ID;
      dialog.hidden = true;
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "geogamble-case-title");
      const panel = el2("div", "gg-case-panel");
      const header = el2("div", "gg-case-header");
      const titleWrap = el2("div", "gg-case-titleWrap");
      const title = el2("h2", "gg-case-title", "Cases");
      title.id = "geogamble-case-title";
      titleWrap.append(title);
      const close = el2("button", "gg-case-close", "×");
      close.type = "button";
      close.setAttribute("aria-label", "Close cases");
      close.addEventListener("click", () => closeCaseDialog(true));
      header.append(titleWrap, close);
      const cratesView = el2("div", "gg-case-cratesView");
      const crates = el2("div", "gg-case-crates");
      cratesView.append(crates);
      const reelView = el2("div", "gg-case-reelView");
      reelView.hidden = true;
      const reelWindow = el2("div", "gg-case-reelWindow");
      const marker = el2("div", "gg-case-reelMarker");
      const track = el2("div", "gg-case-reelTrack");
      reelWindow.append(marker, track);
      const result = el2("div", "gg-case-result");
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
        result: dialog.querySelector(".gg-case-result")
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
      return CASE_RARITIES.filter((rarity) => Number(crate.weights[rarity.id]) > 0).map((rarity) => `${rarity.label} ${crate.weights[rarity.id]}%`).join(" · ");
    }
    function crateAccent(crate) {
      return [...CASE_RARITIES].reverse().find((rarity) => Number(crate.weights[rarity.id]) > 0) || CASE_RARITIES[0];
    }
    function caseRewardLabel(rarityId, rng = Math.random) {
      const labels = CASE_HINT_TYPES.filter((hint) => hint.rarity === rarityId).map(
        (hint) => hint.label
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
        const choice = el2("div", "gg-case-choice");
        choice.style.setProperty("--crate-color", accent.color);
        choice.style.setProperty("--crate-soft", accent.soft);
        const label = el2("span", "gg-case-choiceLabel", crate.name);
        const button = el2("button", "gg-case-crateButton");
        button.type = "button";
        button.disabled = opened || caseReelActive;
        button.title = `${crate.name}: ${crateOddsText(crate)}`;
        button.setAttribute(
          "aria-label",
          opened ? `${crate.name} already opened` : `Open ${crate.name}`
        );
        const icon = el2("span", "gg-case-icon");
        icon.innerHTML = CASE_CHEST_SVG;
        const state3 = el2("span", "gg-case-crateState", opened ? "Opened" : "Open");
        button.append(icon, state3);
        button.addEventListener("click", () => openCaseCrate(crate.id));
        choice.append(label, button);
        parts.crates.appendChild(choice);
      }
    }
    function makeCaseChip(hint) {
      const card = el2("div", "gg-case-hintCard");
      const rarity = caseStyle(card, hint.rarity);
      const hasOverlay = caseHintHasOverlay(hint);
      const main = el2(
        hasOverlay ? "button" : "div",
        hasOverlay ? "gg-case-hintMain" : "gg-case-hintMain is-static"
      );
      if (hasOverlay) {
        main.type = "button";
        main.setAttribute("aria-pressed", caseHiddenHints.has(hint.id) ? "false" : "true");
        main.title = `${rarity.label}: ${hint.title}. Click to toggle its map overlay.`;
        main.addEventListener("click", () => toggleCaseHint(hint.id));
      } else {
        main.title = `${rarity.label}: ${hint.title}. Text hint only.`;
      }
      const meta = el2("span", "gg-case-hintMeta");
      const family = el2("span", "gg-case-hintFamily", hint.family || "hint");
      const status = el2(
        "span",
        "gg-case-hintStatus",
        hasOverlay ? caseHiddenHints.has(hint.id) ? "Map off" : "Map" : "Text only"
      );
      if (!hasOverlay) status.classList.add("is-text");
      meta.append(family, status);
      const title = el2("span", "gg-case-hintTitle", hint.title);
      const detail = el2("span", "gg-case-hintDetail", hint.detail);
      main.append(meta, title, detail);
      const remove = el2("button", "gg-case-hintRemove", "×");
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
        drawer = el2("aside", "gg-case-hintDrawer");
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
      if (!div || caseDrawerMapDiv === div && caseDrawerHostDiv === host) return;
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
      const map = mapOverride === void 0 ? getCaseMap() : mapOverride;
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
      if (!caseModeAllowed({ pathname: casePagePath, isRated: caseLocation.isRated, hasLocation: true }))
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
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
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
      const x = clamp2(progress, 0, 1);
      const bezier = (t2, a, b) => 3 * (1 - t2) * (1 - t2) * t2 * a + 3 * (1 - t2) * t2 * t2 * b + t2 * t2 * t2;
      const slope = (t2, a, b) => 3 * (1 - t2) * (1 - t2) * a + 6 * (1 - t2) * t2 * (b - a) + 3 * t2 * t2 * (1 - b);
      let t = x;
      for (let index2 = 0; index2 < 8; index2++) {
        const current = bezier(t, x1, x2);
        const derivative = slope(t, x1, x2);
        if (Math.abs(current - x) < 1e-6 || Math.abs(derivative) < 1e-6) break;
        t = clamp2(t - (current - x) / derivative, 0, 1);
      }
      if (Math.abs(bezier(t, x1, x2) - x) > 1e-4) {
        let low = 0;
        let high = 1;
        for (let index2 = 0; index2 < 16; index2++) {
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
      if (!caseRound.hints.some((hint) => hint.id === outcome.hint.id) && caseRound.hints.length < CASE_MAX_HINTS) {
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
        weight
      }));
      for (let index2 = 0; index2 < total; index2++) {
        const rarityId = index2 === targetIndex ? outcome.hint.rarity : weightedPick(bandWeights, Math.random)?.rarity || "common";
        const rarity = CASE_RARITY_BY_ID.get(rarityId) || CASE_RARITIES[0];
        const card = el2("div", "gg-case-reelCard");
        card.style.setProperty("--case-color", rarity.color);
        card.style.setProperty("--case-soft", rarity.soft);
        card.dataset.rarity = rarityId;
        const icon = el2("span", "gg-case-icon");
        icon.innerHTML = CASE_CHEST_SVG;
        const reward = el2(
          "span",
          "gg-case-reelReward",
          index2 === targetIndex ? outcome.hint.label : caseRewardLabel(rarityId)
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
        const progress = clamp2((now - started) / CASE_REEL_MS, 0, 1);
        const offset = caseReelTarget * cubicBezierEase(progress, 0.1, 0.82, 0.12, 1);
        parts.track.style.transform = `translate3d(-${offset}px,0,0)`;
        const marker = offset + width / 2;
        let cardIndex = 0;
        for (let index2 = 0; index2 < cardLefts.length; index2++) {
          if (marker >= cardLefts[index2]) cardIndex = index2;
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
        for (const [index2, card] of [...parts.track.children].entries()) {
          card.classList.toggle("is-winner", index2 === caseReelWinnerIndex);
          card.classList.toggle("is-dimmed", index2 !== caseReelWinnerIndex);
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
      const ray = el2("div", "gg-case-resultRay");
      const body = el2("div", "gg-case-resultBody");
      const familyLabel = hint.family ? String(hint.family) : "location";
      const rarityLabel = el2("span", "gg-case-resultRarity", `${rarity.label} ${familyLabel} hint`);
      const icon = el2("span", "gg-case-resultIcon");
      icon.innerHTML = CASE_CHEST_SVG;
      const title = el2("h3", "gg-case-resultTitle", hint.title);
      const detail = el2("p", "gg-case-resultDetail", hint.detail);
      const note = el2(
        "span",
        "gg-case-resultNote",
        caseHintHasOverlay(hint) ? "Added to active hints. Map updated." : "Added to active hints as a text hint."
      );
      const close = el2("button", "gg-case-resultClose", "Close");
      close.type = "button";
      close.addEventListener("click", () => closeCaseDialog(true));
      body.append(rarityLabel, icon, title, detail, note, close);
      parts.result.append(ray, body);
      if (!caseReducedMotion()) {
        for (let index2 = 0; index2 < 14; index2++) {
          const particle = el2("span", "gg-case-particle");
          particle.style.setProperty("--case-color", rarity.color);
          particle.style.setProperty("--angle", `${360 / 14 * index2 + Math.random() * 10}deg`);
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
      return div.closest('[class*="guess-map_active__"]') || div.closest('[class*="guess-map_guessMap__"]') || div.closest('[class*="guess-map_size3__"]') || div;
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
        if (north - south < 5e-4 && east - west < 5e-4) {
          map.panTo({ lat: north, lng: east });
          const zoom = Number(typeof map.getZoom === "function" ? map.getZoom() : NaN);
          if (!Number.isFinite(zoom) || zoom < 5) map.setZoom(5);
          return true;
        }
        const latLngBounds = new maps.LatLngBounds(
          { lat: south, lng: west },
          { lat: north, lng: east }
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
      const root = el2("div", "gg-case-mapMarker");
      root.style.setProperty(
        "--case-color",
        (CASE_RARITY_BY_ID.get(hint.rarity) || CASE_RARITIES[0]).color
      );
      if (hint.overlay === "pin") {
        root.append(el2("span", "gg-case-mapPulse"));
        root.appendChild(el2("span", "gg-case-mapPin"));
      } else {
        root.appendChild(el2("span", "gg-case-mapDot"));
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
        b: parseInt(hex.slice(4, 6), 16)
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
          zIndex: 18
        });
        caseOverlays.push({ remove: () => shape.setMap(null) });
      }
    }
    function addCaseCompositeOverlay(map, plan) {
      const maps = window.google?.maps;
      const OverlayView = maps?.OverlayView;
      if (!OverlayView || !plan?.layers?.length) return null;
      const wrapper = el2("div", "gg-case-compositeOverlay");
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
        return !(polygon.maxLat < bounds.south || polygon.minLat > bounds.north || polygon.maxLng < bounds.west || polygon.minLng > bounds.east);
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
          project(projection, south, west)
        ];
        if (corners.some((point) => !point)) return false;
        context.moveTo(corners[0].x, corners[0].y);
        for (let index2 = 1; index2 < corners.length; index2++)
          context.lineTo(corners[index2].x, corners[index2].y);
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
        for (let index2 = 0; index2 < plan.layers.length; index2++) {
          if (index2 > 0) context.globalCompositeOperation = "destination-in";
          if (!drawMaskLayer(context, plan.layers[index2], projection, plan.bounds)) {
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
          hideListeners = ["zoom_changed", "bounds_changed", "dragstart"].map(
            (name) => map.addListener(name, hideComposite)
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
            }
          }
          listeners = [];
          for (const listener of hideListeners) {
            try {
              listener?.remove?.();
            } catch {
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
            zIndex: 20
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
          const polygons = broad && payload.mainOnly ? [Core.mainPolygon(country)].filter(Boolean) : country.polygons;
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
              zIndex: 17
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
              { lat: region.south, lng: region.west }
            ],
            clickable: false,
            strokeColor: rarity.color,
            strokeOpacity: 0.45,
            strokeWeight: 0.75,
            fillColor: rarity.color,
            fillOpacity: 0.15,
            zIndex: 16
          });
          caseOverlays.push({ remove: () => shape.setMap(null) });
        }
        return;
      }
      if (hint.overlay === "hemisphere" || hint.overlay === "longitude-half" || hint.overlay === "tropical-band") {
        const bands = caseBandRects(hint);
        if (!bands.length) return;
        for (const band of bands) {
          const paths = [
            { lat: band.north, lng: band.west },
            { lat: band.north, lng: band.east },
            { lat: band.south, lng: band.east },
            { lat: band.south, lng: band.west }
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
            zIndex: 15
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
            { lat: south, lng: west }
          ],
          clickable: false,
          strokeColor: rarity.color,
          strokeOpacity: 0.98,
          strokeWeight: 2,
          fillColor: rarity.color,
          fillOpacity: 0.22,
          zIndex: 19
        });
        caseOverlays.push({ remove: () => shape.setMap(null) });
        return;
      }
      if (hint.overlay === "circle" && Number.isFinite(Number(payload?.lat)) && Number.isFinite(Number(payload?.lng))) {
        const center = { lat: Number(payload.lat), lng: Number(payload.lng) };
        const radiusKm = Number(payload.radiusKm);
        const shape = new maps.Circle({
          map,
          center,
          radius: Number.isFinite(radiusKm) ? Math.max(250, radiusKm * 1e3) : 1e3,
          clickable: false,
          strokeColor: rarity.color,
          strokeOpacity: 0.98,
          strokeWeight: 2,
          fillColor: rarity.color,
          fillOpacity: 0.2,
          zIndex: 19
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
        }
      }
      caseOverlays = [];
      caseOverlayMap = null;
      caseOverlaySignature = "";
      caseOverlayBaseSignature = "";
      if (resetFocus) caseFocusedHintIds = /* @__PURE__ */ new Set();
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
        (hint) => !caseHiddenHints.has(hint.id) && caseHintHasOverlay(hint)
      );
      const baseSignature = `${caseRound.key || ""}|${visible.map((hint) => `${hint.id}:${hint.overlay}`).join("|")}`;
      if (caseOverlayMap === map && caseOverlayBaseSignature === baseSignature && (caseOverlays.length > 0 || caseOverlaySignature.includes("-empty"))) {
        return;
      }
      const visibleAreaHints = visible.filter(caseHintIsAreaHint);
      const composite = visibleAreaHints.length > 1;
      const geometry = composite ? caseCompositeGeometry(visible, getCaseCountryIndex()) : null;
      const areaPlan = geometry?.mode === "canvas" ? caseAreaFilterPlan(visible, getCaseCountryIndex()) : null;
      const signature = `${caseRound.key || ""}|${geometry ? `${geometry.mode}${geometry.empty ? "-empty" : ""}` : "I"}|${visible.map((hint) => `${hint.id}:${hint.overlay}`).join("|")}`;
      if (caseOverlayMap === map && caseOverlaySignature === signature && (caseOverlays.length > 0 || signature.includes("-empty"))) {
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
            focusBounds = focusBounds ? {
              north: Math.max(focusBounds.north, bounds.north),
              south: Math.min(focusBounds.south, bounds.south),
              west: Math.min(focusBounds.west, bounds.west),
              east: Math.max(focusBounds.east, bounds.east)
            } : bounds;
          }
          if (focusBounds) focusCaseBounds(map, focusBounds);
        } else {
          focusCaseMap(map, newlyFocused);
        }
        for (const hint of newlyFocused) caseFocusedHintIds.add(hint.id);
      }
    }
    function caseOverlayDiagnostics() {
      let trackedMaps2 = 0;
      let visibleMaps = 0;
      let selectedMapArea = 0;
      for (const entry of trackedCanvases.values()) {
        trackedMaps2++;
        const score = caseMapVisibilityScore(entry);
        if (score > 0) visibleMaps++;
        if (entry.map === caseOverlayMap) selectedMapArea = score;
      }
      return {
        trackedMaps: trackedMaps2,
        visibleMaps,
        selectedMap: !!caseOverlayMap,
        selectedMapArea: Math.round(selectedMapArea),
        overlays: caseOverlays.length,
        activeMap: caseOverlayMap ? caseMapIsActive(caseOverlayMap) : false,
        drawer: !document.getElementById(GG_CASE_HINT_DRAWER_ID)?.hidden,
        focusedHints: [...caseFocusedHintIds],
        spatialHints: caseRound.hints.filter((hint) => caseHintHasOverlay(hint)).map((hint) => hint.id)
      };
    }
    function el2(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== void 0) node.textContent = text;
      return node;
    }
    function countryName(iso) {
      const feature = COUNTRY_DATA.find((item) => item.iso === iso);
      return feature ? feature.name : iso.toUpperCase();
    }
    function countryListControl(context) {
      const key = context.key;
      const native = context.nativeClasses;
      const wrap = el2("div", "gg-countryList");
      const allRow = el2("div", "gg-countryAllRow");
      const allLabel = el2("span", native.rowLabel || "gg-countryAllLabel", "All countries");
      const allControl = el2("div", "gg-countryAllControl");
      const allToggle = el2("label", native.toggle || "ggk-toggle");
      const allInput = el2("input", native.toggleInput || "ggk-toggleInput");
      allInput.type = "checkbox";
      if (native.toggleInput) allInput.setAttribute("role", "switch");
      allToggle.append(allInput);
      if (!native.toggle) allToggle.append(el2("span", "ggk-switch"));
      const allState = native.rowState ? el2("span", native.rowState) : null;
      allControl.append(allToggle);
      if (allState) allControl.append(allState);
      allRow.append(allLabel, allControl);
      if (key !== "enabledCountries") allRow.hidden = true;
      const chips = el2("div", "gg-countryChips");
      const input = document.createElement("input");
      input.type = "search";
      input.className = "gg-countrySearch";
      input.placeholder = "Type a country name or ISO code";
      const dropdown = el2("div", "gg-countryDropdown");
      dropdown.hidden = true;
      wrap.append(allRow, chips, input, dropdown);
      const current = () => {
        const value = context.config.get(key);
        return Array.isArray(value) ? value : [];
      };
      const apply = (value) => {
        context.config.set(key, value);
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
          chips.append(el2("span", "gg-countryEmpty", "Every country is enabled."));
        } else if (!value.length) {
          chips.append(
            el2(
              "span",
              "gg-countryEmpty",
              key === "excludeCountries" ? "No excluded countries." : "No countries enabled."
            )
          );
        } else {
          for (const iso of value) {
            const chip = el2("span", "gg-countryChip");
            chip.append(
              el2("span", null, countryName(iso)),
              el2("span", "gg-countryIso", iso.toUpperCase())
            );
            const remove = el2("button", "gg-countryRemove", "×");
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
          limit: 8
        });
        dropdown.textContent = "";
        if (!options.length) {
          dropdown.append(el2("div", "gg-countryEmpty", "No matching country."));
        } else {
          for (const feature of options) {
            const option = el2(
              "label",
              native.toggle ? `${native.toggle} gg-countryToggleRow` : "gg-countryToggleRow"
            );
            const check = el2("input", native.toggleInput || "gg-countryCheck");
            check.type = "checkbox";
            check.addEventListener("change", () => {
              if (check.checked) add(feature.iso);
            });
            option.append(
              check,
              el2("span", "gg-countryName", feature.name),
              el2("span", "gg-countryIso", feature.iso.toUpperCase())
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
          dropdown.querySelector(".gg-countryToggleRow")?.click();
        }
      });
      input.addEventListener(
        "blur",
        () => setTimeout(() => {
          dropdown.hidden = true;
        }, 120)
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
  `
    );
    function closestGuessMapCanvas(element) {
      return element?.closest(GUESS_MAP_CANVAS_SELECTORS) || null;
    }
    function findCanvases(scope = document) {
      return Array.from(scope.querySelectorAll(GUESS_MAP_CANVAS_SELECTORS));
    }
    function mapDivInside2(map, canvas) {
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
      if (props.selectedRegion !== void 0 && props.setSelectedRegion) return true;
      if (props.mapType === "country" && (props.regionName || props.countryStreak)) return true;
      return false;
    }
    function isMarkerMapProps(props) {
      return !!props && (props.markerLocation !== void 0 || props.validateGuesses !== void 0 || props.onPinMount !== void 0);
    }
    function isGuessMapProps(props) {
      if (!props) return false;
      return isMarkerMapProps(props) || typeof props.onMapClick === "function" || typeof props.onPlacedPin === "function" || typeof props.onRemovedPin === "function";
    }
    function installStaticHook() {
      if (staticHookInstalled) return;
      const eventApi = window.google?.maps?.event;
      if (!eventApi || typeof eventApi.addListener !== "function") return;
      const original = eventApi.addListener;
      try {
        eventApi.addListener = function(instance, name, handler, ...rest) {
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
        map.addListener = function(name, handler, ...rest) {
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
          map.addListenerOnce = function(name, handler, ...rest) {
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
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {
      });
      return audioContext;
    }
    function playTick(progress) {
      const context = getAudioContext();
      if (!context || !masterGain) return;
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(420 + 520 * clamp2(progress, 0, 1), now);
      gain.gain.setValueAtTime(1e-4, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 5e-3);
      gain.gain.exponentialRampToValueAtTime(1e-4, now + 0.055);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(now);
      oscillator.stop(now + 0.07);
    }
    function playFinal() {
      const context = getAudioContext();
      if (!context || !masterGain) return;
      const now = context.currentTime;
      for (const [index2, frequency] of [660, 990].entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + index2 * 0.055;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(1e-4, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(1e-4, start + 0.22);
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
      const position = clamp2(progress, 0, 1);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(480 + 640 * position + (step % 2 ? 44 : 0), now);
      gain.gain.setValueAtTime(1e-4, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 4e-3);
      gain.gain.exponentialRampToValueAtTime(1e-4, now + 0.045);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(now);
      oscillator.stop(now + 0.06);
    }
    function playCaseLanding() {
      const context = getAudioContext();
      if (!context || !masterGain) return;
      const now = context.currentTime;
      for (const [index2, frequency] of [110, 165].entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + index2 * 0.025;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(1e-4, start);
        gain.gain.exponentialRampToValueAtTime(0.065, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(1e-4, start + 0.22);
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
        (frequency) => frequency * 2 ** (rarity.rank / 36)
      );
      for (const [index2, frequency] of notes.entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + index2 * 0.06;
        oscillator.type = index2 < 2 ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(1e-4, start);
        gain.gain.exponentialRampToValueAtTime(0.065, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(1e-4, start + 0.5);
        oscillator.connect(gain);
        gain.connect(masterGain);
        oscillator.start(start);
        oscillator.stop(start + 0.52);
      }
      const low = context.createOscillator();
      const lowGain = context.createGain();
      low.type = "sine";
      low.frequency.setValueAtTime(130.81, now);
      lowGain.gain.setValueAtTime(1e-4, now);
      lowGain.gain.exponentialRampToValueAtTime(0.055, now + 0.025);
      lowGain.gain.exponentialRampToValueAtTime(1e-4, now + 0.36);
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
            const x = view.baseX + (unwrapLng(lng, reference) + offset - view.centerLng) * view.pixelsPerLng;
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
        for (let index2 = 0; index2 < raster.data.length; index2++) {
          const weight = raster.data[index2];
          if (weight <= 0) continue;
          const [r, g, b, a] = heatmapColor(Math.sqrt(clamp2(weight / max, 0, 1)));
          const offset = index2 * 4;
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
          const x = view.baseX + (unwrapLng(footprint.center.lng, view.centerLng) - view.centerLng) * view.pixelsPerLng;
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
          if (zoom >= 5 && bounds && bounds.right - bounds.left >= 90 && bounds.bottom - bounds.top >= 50) {
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
        let pixelsPerLng = Number.isFinite(zoom) ? 256 * 2 ** zoom / 360 : 0;
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
        const labels = /* @__PURE__ */ new Map();
        let globalBudget = 45e4;
        for (const country of index.selected) {
          const footprint = heatmapFootprint(country);
          if (!footprint) continue;
          let countryBounds2 = null;
          const pieces = [];
          let countryMax = 0;
          if (bias > 0 && bias < 1) {
            let countryBudget = 2600;
            const polygons = [...country.polygons].sort((a, b) => b.area - a.area);
            for (const polygon of polygons) {
              if (polygon.minLat <= -84 || polygon.maxLat >= 84) continue;
              const projected = projectPolygon(projection, polygon, view);
              if (!projected) continue;
              if (projected.right < -2 || projected.left > width + 2 || projected.bottom < -2 || projected.top > height + 2)
                continue;
              const left = Math.max(0, Math.floor(projected.left));
              const top = Math.max(0, Math.floor(projected.top));
              const right = Math.min(width, Math.ceil(projected.right));
              const bottom = Math.min(height, Math.ceil(projected.bottom));
              const rasterWidth = right - left;
              const rasterHeight = bottom - top;
              if (rasterWidth < 3 || rasterHeight < 3) continue;
              let columns = clamp2(Math.ceil(rasterWidth / 8), 4, 72);
              let rows = clamp2(Math.ceil(rasterHeight / 8), 4, 72);
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
                  new maps.Point(width / 2, top + (row + 0.5) * cellHeight)
                );
                lats[row] = latLng ? typeof latLng.lat === "function" ? latLng.lat() : latLng.lat : NaN;
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
                pointAt
              });
              if (raster.max > 0)
                pieces.push({
                  projected,
                  raster,
                  left,
                  top,
                  width: rasterWidth,
                  height: rasterHeight
                });
              if (raster.max > countryMax) countryMax = raster.max;
              if (!countryBounds2)
                countryBounds2 = {
                  left: projected.left,
                  top: projected.top,
                  right: projected.right,
                  bottom: projected.bottom
                };
              else {
                countryBounds2.left = Math.min(countryBounds2.left, projected.left);
                countryBounds2.top = Math.min(countryBounds2.top, projected.top);
                countryBounds2.right = Math.max(countryBounds2.right, projected.right);
                countryBounds2.bottom = Math.max(countryBounds2.bottom, projected.bottom);
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
              if (projected.right < 0 || projected.left > width || projected.bottom < 0 || projected.top > height)
                continue;
              context.save();
              tracePath(context, projected);
              context.clip("evenodd");
              context.fillStyle = HEATMAP_UNIFORM_COLOR;
              context.fillRect(0, 0, width, height);
              context.restore();
              if (!countryBounds2)
                countryBounds2 = {
                  left: projected.left,
                  top: projected.top,
                  right: projected.right,
                  bottom: projected.bottom
                };
              else {
                countryBounds2.left = Math.min(countryBounds2.left, projected.left);
                countryBounds2.top = Math.min(countryBounds2.top, projected.top);
                countryBounds2.right = Math.max(countryBounds2.right, projected.right);
                countryBounds2.bottom = Math.max(countryBounds2.bottom, projected.bottom);
              }
            }
          }
          if (countryBounds2) labels.set(country, countryBounds2);
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
          listeners = ["idle", "bounds_changed", "zoom_changed"].map(
            (name) => map.addListener(name, onMapChange)
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
      root.style.cssText = "position:absolute;width:0;height:0;pointer-events:none;z-index:2147483647;transition:left 55ms linear,top 55ms linear;";
      const ripple = document.createElement("div");
      ripple.style.cssText = "position:absolute;left:-12px;top:-12px;width:24px;height:24px;border:2px solid rgba(255,90,54,.9);border-radius:50%;opacity:0;pointer-events:none;";
      const tail = document.createElement("div");
      tail.style.cssText = "position:absolute;left:-6px;top:-12px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:12px solid #d92323;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35));";
      const head = document.createElement("div");
      head.style.cssText = "position:absolute;left:-17px;top:-44px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#ff6a3d,#d92323);border:3px solid #fff;box-shadow:0 5px 14px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 18px/1 system-ui,sans-serif;transform-origin:50% 100%;";
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
                { transform: "scale(1.9)", opacity: 0 }
              ],
              { duration: 360, easing: "ease-out" }
            );
          }
          if (typeof head.animate === "function") {
            head.animate(
              [
                { transform: "rotate(-7deg)" },
                { transform: "rotate(7deg)" },
                { transform: "rotate(0deg)" }
              ],
              { duration: 130, easing: "ease-out" }
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
          lng: typeof event.latLng.lng === "function" ? event.latLng.lng() : event.latLng.lng
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
          const jj = pixel && event.jj && typeof event.jj === "object" ? { x: pixel.x, y: pixel.y } : null;
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
            if (settings.duelSubmitHop && point && !(hopPlonkPoint && hopPlonkPoint.lat === point.lat && hopPlonkPoint.lng === point.lng)) {
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
          isAlive: () => canGamble(entry.canvas, map)
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
        const button = root.querySelector('[data-qa="perform-guess"]') || document.querySelector('[data-qa="perform-guess"]');
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
        if (mapDivInside2(existing.map, canvas)) {
          wrapExistingClickHandlers(existing.map, existing.gate);
          return existing;
        }
        cleanupEntry(existing);
        existing.gate.cancel();
        trackedCanvases.delete(canvas);
        trackedMaps.delete(existing.map);
      }
      const found = findMapForCanvas(canvas, {
        allowOtherModes: settings.allowOtherModes,
        isExcludedProps: isExcludedMapProps,
        isGuessMapProps
      });
      if (!found) return null;
      const entry = {
        canvas,
        map: found.map,
        gate: null,
        animation: null,
        overlay: null,
        heatmapOverlay: null,
        wrapped: 0
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
        debug
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
          overlays: caseOverlayDiagnostics()
        }),
        openCases: openCaseDialog,
        sendDuelPin: (lat, lng) => sendDuelPin({ lat, lng })
      };
      installWsHooks();
      const observerRoot = document.documentElement || document;
      const scanObserver = observerRoot ? new MutationObserver(scheduleScan) : null;
      if (observerRoot) scanObserver?.observe(observerRoot, { childList: true, subtree: true });
      const scanTimer = setInterval(scan, 1e3);
      context.onCleanup(() => clearInterval(scanTimer));
      context.onCleanup(() => scanObserver?.disconnect());
      if (!index.selected.length) debug("no enabled countries");
      if (index.unknown.length)
        console.warn("[GeoGamble] Unknown country codes:", index.unknown.join(", "));
      installStaticHook();
      installPanoHook();
      scan();
      setInterval(scan, 1e3);
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
            fields: ["autoSubmit", "submitDelayMs", "duelSubmitPin", "duelSubmitHop"]
          },
          { id: "audio", title: "Audio", fields: ["sound", "volume"] },
          {
            id: "misc",
            title: "Misc",
            fields: ["allowOtherModes", "perfTweaks", "heatmapOverlay", "debug"]
          }
        ],
        controls: { "country-list": countryListControl }
      },
      setup(context) {
        init(context);
      }
    });
  })();
})();
