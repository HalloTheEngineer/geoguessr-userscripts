import type { NativeSettingsClasses } from "./types.js";

export const EMPTY_NATIVE_CLASSES: NativeSettingsClasses = {
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
  buttonLabel: "",
};

const PREFIXES: Record<keyof NativeSettingsClasses, string> = {
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
  buttonLabel: '[class*="button_label__"]',
};

function fullClassIn(scope: ParentNode, selector: string): string {
  for (const node of scope.querySelectorAll(selector)) {
    if (node.closest("#ggk-userscripts-panel")) continue;
    if (node.id.startsWith("ggk-")) continue;
    const value = typeof node.className === "string" ? node.className.trim() : "";
    if (value) return value;
  }
  return "";
}

export function readNativeClasses(scope: ParentNode): NativeSettingsClasses {
  const result = { ...EMPTY_NATIVE_CLASSES };
  for (const key of Object.keys(PREFIXES) as (keyof NativeSettingsClasses)[]) {
    result[key] = fullClassIn(scope, PREFIXES[key]);
  }
  return result;
}

export function settingsDialog(): HTMLDialogElement | HTMLElement | null {
  const panel = document.querySelector<HTMLElement>("[data-settings-panel]");
  const dialog = panel?.closest("dialog") || document.querySelector<HTMLElement>("dialog[open]");
  return dialog || null;
}

export function settingsTablist(dialog: ParentNode): HTMLElement | null {
  return dialog.querySelector<HTMLElement>('[role="tablist"]');
}

export function settingsPanelsRoot(dialog: ParentNode, tablist: HTMLElement): ParentNode {
  const parent = tablist.parentElement?.parentElement;
  if (parent?.querySelector('[role="tabpanel"]')) return parent;
  return dialog;
}
