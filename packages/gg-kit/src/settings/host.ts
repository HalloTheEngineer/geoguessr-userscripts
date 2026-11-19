import type { ConfigField } from "../config/types.js";
import { onDomChange } from "../dom.js";
import { injectStyle } from "../ui.js";
import { pageWindow } from "../window.js";
import {
  readNativeClasses,
  settingsDialog,
  settingsPanelsRoot,
  settingsTablist,
} from "./native-classes.js";
import type {
  CustomControlContext,
  CustomControlRenderer,
  NativeSettingsClasses,
  SettingsHandle,
  SettingsRegistrationInput,
  SettingsSectionSpec,
} from "./types.js";

const HOST_KEY = "__GG_KIT_SETTINGS__";
const TAB_ID = "ggk-userscripts-tab";
const PANEL_ID = "ggk-userscripts-panel";
const STYLE_ID = "ggk-settings-style";
const API_VERSION = 1;

interface InternalRegistration {
  input: SettingsRegistrationInput<Record<string, any>>;
  sections: SettingsSectionSpec[];
  controls: Record<string, CustomControlRenderer<any>>;
}

interface HostState {
  apiVersion: number;
  registrations: Map<string, InternalRegistration>;
  installed: boolean;
  activeScriptId?: string;
  ensureAll?: () => void;
  refresh?: () => void;
}

function hostState(): HostState {
  const win = pageWindow() as unknown as Record<string, HostState | undefined>;
  if (win[HOST_KEY]) {
    if (win[HOST_KEY]!.apiVersion !== API_VERSION) {
      console.warn(
        `[gg-kit] shared settings host version mismatch (${win[HOST_KEY]!.apiVersion} vs ${API_VERSION})`,
      );
    }
    return win[HOST_KEY]!;
  }
  const state: HostState = {
    apiVersion: API_VERSION,
    registrations: new Map(),
    installed: false,
  };
  win[HOST_KEY] = state;
  return state;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fieldMap(registration: InternalRegistration): Record<string, ConfigField> {
  return registration.input.config.definition.fields as Record<string, ConfigField>;
}

function autoSections(registration: InternalRegistration): SettingsSectionSpec[] {
  if (registration.sections.length) return registration.sections;
  const fields = fieldMap(registration);
  const groups = new Map<string, string[]>();
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
    fields: keys,
  }));
}

function sectionFields(registration: InternalRegistration, section: SettingsSectionSpec): string[] {
  const fields = fieldMap(registration);
  if (section.fields)
    return [...section.fields].filter((key) => fields[key] && !fields[key].hidden);
  return Object.entries(fields)
    .filter(([, field]) => (field.section || "general") === section.id && !field.hidden)
    .map(([key]) => key);
}

function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden;
  element.style.display = hidden ? "none" : "";
}

function buildRow(
  classes: NativeSettingsClasses,
  label: string,
  hint?: string,
): {
  row: HTMLElement;
  control: HTMLElement;
  note: HTMLElement | null;
} {
  const row = el("div", classes.row || "ggk-row");
  const labelNode = el(classes.rowLabel ? "p" : "span", classes.rowLabel || "ggk-label", label);
  const control = el("div", classes.rowControl || "ggk-control");
  row.append(labelNode, control);
  let note: HTMLElement | null = null;
  if (hint) {
    note = el("div", classes.rowNote || "ggk-note", hint);
    row.append(note);
  }
  return { row, control, note };
}

function buildNativeButton(classes: NativeSettingsClasses, label: string): HTMLButtonElement {
  const button = el("button") as HTMLButtonElement;
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

function buildSelector(
  config: any,
  key: string,
  field: ConfigField,
  classes: NativeSettingsClasses,
  cleanup: Array<() => void>,
): HTMLElement {
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

function buildRange(
  config: any,
  key: string,
  field: ConfigField,
  classes: NativeSettingsClasses,
  cleanup: Array<() => void>,
): HTMLElement {
  const input = el("input", classes.rangeInput || "ggk-range") as HTMLInputElement;
  input.type = "range";
  input.min = String(field.min ?? 0);
  input.max = String(field.max ?? 1);
  input.step = String(field.step ?? 0.01);
  input.value = String(config.get(key));
  const value = el("span", classes.rangeBubble || "ggk-rangeValue", input.value);
  let wrap: HTMLElement;
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
    const progress = ((Number(input.value) - minimum) / (maximum - minimum || 1)) * 100;
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
    }, [key]),
  );
  return wrap;
}

function buildNumber(config: any, key: string, cleanup: Array<() => void>): HTMLInputElement {
  const input = el("input", "ggk-number") as HTMLInputElement;
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
    }, [key]),
  );
  return input;
}

function buildText(
  config: any,
  key: string,
  field: ConfigField,
  cleanup: Array<() => void>,
): HTMLInputElement {
  const input = el("input", "ggk-text") as HTMLInputElement;
  input.type = "text";
  if (field.placeholder) input.placeholder = field.placeholder;
  input.value = String(config.get(key) ?? "");
  input.addEventListener("change", () => config.set(key, input.value));
  cleanup.push(
    config.subscribe(() => {
      input.value = String(config.get(key) ?? "");
    }, [key]),
  );
  return input;
}

function buildToggle(
  config: any,
  key: string,
  classes: NativeSettingsClasses,
  cleanup: Array<() => void>,
  control: HTMLElement,
): void {
  const label = el("label", classes.toggle || "ggk-toggle");
  const input = el("input", classes.toggleInput || "ggk-toggleInput") as HTMLInputElement;
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

function renderField(
  registration: InternalRegistration,
  section: HTMLElement,
  classes: NativeSettingsClasses,
  key: string,
  cleanup: Array<() => void>,
): HTMLElement | null {
  const field = fieldMap(registration)[key];
  if (!field) return null;
  const config = registration.input.config as any;
  const { row, control } = buildRow(classes, field.label || humanize(key), field.hint);
  const updateVisibility = () => {
    const values = config.get();
    const hidden = field.visibleWhen ? !field.visibleWhen(values) : false;
    setHidden(row, hidden);
    for (const input of control.querySelectorAll<HTMLInputElement>("input, select, button")) {
      input.disabled = field.disabledWhen ? field.disabledWhen(values) : false;
    }
  };
  const unsubscribeVisibility = config.subscribe(updateVisibility);
  cleanup.push(unsubscribeVisibility);
  updateVisibility();

  if (field.control) {
    const renderer = registration.controls[field.control];
    if (renderer) {
      const context: CustomControlContext = {
        key,
        field,
        config,
        root: control,
        section,
        nativeClasses: classes,
        button: (label: string) => buildNativeButton(classes, label),
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

function renderRegistration(
  registration: InternalRegistration,
  container: HTMLElement,
  classes: NativeSettingsClasses,
): void {
  const cleanup = ((container as unknown as Record<string, any>).__ggkCleanup || []) as Array<
    () => void
  >;
  for (const dispose of cleanup) dispose();
  const nextCleanup: Array<() => void> = [];
  (container as unknown as Record<string, any>).__ggkCleanup = nextCleanup;
  container.textContent = "";

  const sections = [...autoSections(registration)].sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0),
  );
  const config = registration.input.config as any;
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

function disposeTree(root: ParentNode): void {
  const nodes = [root as Element, ...root.querySelectorAll("*")];
  for (const node of nodes) {
    const cleanup = (node as unknown as Record<string, unknown>).__ggkCleanup as
      | Array<() => void>
      | undefined;
    if (!cleanup) continue;
    for (const dispose of cleanup) dispose();
    delete (node as unknown as Record<string, unknown>).__ggkCleanup;
  }
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function renderAll(container: HTMLElement, classes: NativeSettingsClasses): void {
  const state = hostState();
  disposeTree(container);
  container.textContent = "";
  const registrations = [...state.registrations.values()].sort(
    (left, right) => (left.input.order ?? 0) - (right.input.order ?? 0),
  );
  if (!registrations.length) {
    container.append(el("p", "ggk-note", "No userscripts settings registered."));
    return;
  }

  const activeId =
    state.activeScriptId && registrations.some((item) => item.input.id === state.activeScriptId)
      ? state.activeScriptId
      : registrations[0].input.id;

  const subTabs = el("div", "ggk-subTabs");
  subTabs.setAttribute("role", "tablist");
  subTabs.setAttribute("aria-label", "Userscript settings sections");
  const buttons = new Map<string, HTMLButtonElement>();
  for (const registration of registrations) {
    const id = sanitizeId(registration.input.id);
    const button = el("button", "ggk-subTab") as HTMLButtonElement;
    button.type = "button";
    button.id = `ggk-subtab-${id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `ggk-subpanel-${id}`);
    button.setAttribute("aria-selected", String(registration.input.id === activeId));
    button.dataset.ggkScript = registration.input.id;
    button.textContent =
      registration.input.shortTitle || registration.input.title || humanize(registration.input.id);
    button.addEventListener("click", () => {
      state.activeScriptId = registration.input.id;
      renderAll(container, classes);
      container.querySelector<HTMLButtonElement>(`#ggk-subtab-${id}`)?.focus();
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
    container.querySelector<HTMLButtonElement>(`#ggk-subtab-${sanitizeId(ids[index])}`)?.focus();
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
      el("p", "ggk-note", "Storage is unavailable; settings will apply but will not persist."),
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

function activateNative(dialog: ParentNode, tab: HTMLElement): void {
  const panel = dialog.querySelector<HTMLElement>(`#${PANEL_ID}`);
  const tablist = tab.closest('[role="tablist"]');
  if (!panel || !tablist) return;
  for (const other of tablist.querySelectorAll<HTMLElement>('[role="tab"]')) {
    const active = other === tab;
    other.setAttribute("aria-selected", String(active));
    other.dataset.state = active ? "active" : "inactive";
    other.tabIndex = active ? 0 : -1;
  }
  if (dialog instanceof Element) dialog.classList.add("ggk-userscripts-active");
  setHidden(panel, false);
  renderAll(panel, readNativeClasses(dialog));
}

function deactivateNative(): void {
  const dialog = document.querySelector<HTMLElement>(".ggk-userscripts-active");
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

function ensureNative(): void {
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
  let tab = document.getElementById(TAB_ID) as HTMLButtonElement | null;
  let panel = document.getElementById(PANEL_ID);
  if (tab && panel && tablist.contains(tab) && dialog.contains(panel)) return;

  tab?.remove();
  panel?.remove();
  tab = el("button", classes.tab || "ggk-tab") as HTMLButtonElement;
  tab.id = TAB_ID;
  tab.type = "button";
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", "false");
  tab.setAttribute("aria-controls", PANEL_ID);
  tab.dataset.state = "inactive";
  tab.tabIndex = -1;
  tab.append(el("span", "ggk-tabLabel", "Userscripts"));
  tab.addEventListener("click", () => activateNative(dialog, tab!));
  tablist.append(tab);

  panel = el("div", classes.panel || "ggk-panel");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", TAB_ID);
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.style.display = "none";
  const panelsRoot = settingsPanelsRoot(dialog, tablist);
  const panels = panelsRoot.querySelectorAll<HTMLElement>('[role="tabpanel"]');
  if (panels.length) panels[panels.length - 1].after(panel);
  else panelsRoot.appendChild(panel);
  renderAll(panel, classes);
}

function ensureAll(): void {
  ensureNative();
}

function installHost(): HostState {
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
  `,
  );
  onDomChange(ensureAll);
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      if (!target || target.closest(`#${TAB_ID}`) || target.closest(`#${PANEL_ID}`)) return;
      if (target.closest('[role="tab"]')) deactivateNative();
    },
    true,
  );
  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target as Element | null;
      if (!target || target.closest(`#${TAB_ID}`) || target.closest(`#${PANEL_ID}`)) return;
      if (target.closest('[role="tab"]')) deactivateNative();
    },
    true,
  );
  ensureAll();
  return state;
}

export function registerSettings<T extends Record<string, any>>(
  input: SettingsRegistrationInput<T>,
): SettingsHandle {
  const state = installHost();
  if (state.registrations.has(input.id)) {
    console.warn(`[gg-kit] duplicate settings registration for "${input.id}"; replacing`);
  }
  const registration: InternalRegistration = {
    input: input as unknown as SettingsRegistrationInput<Record<string, any>>,
    sections: input.sections ? [...input.sections] : [],
    controls: (input.controls || {}) as Record<string, CustomControlRenderer<any>>,
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
    },
  };
}
