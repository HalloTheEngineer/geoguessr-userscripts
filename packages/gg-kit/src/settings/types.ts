import type { ConfigField, ConfigStore } from "../config/types.js";

export interface SettingsSectionSpec {
  id: string;
  title?: string;
  description?: string;
  order?: number;
  fields?: readonly string[];
}

export interface CustomControlContext<T extends Record<string, any> = Record<string, any>> {
  key: keyof T & string;
  field: ConfigField;
  config: ConfigStore<T>;
  root: HTMLElement;
  section: HTMLElement;
  nativeClasses: NativeSettingsClasses;
  button(label: string): HTMLButtonElement;
}

export type CustomControlRenderer<T extends Record<string, any> = Record<string, any>> = (
  context: CustomControlContext<T>,
) => void | (() => void);

export interface SettingsRegistrationInput<T extends Record<string, any>> {
  id: string;
  title?: string;
  shortTitle?: string;
  order?: number;
  config: ConfigStore<T>;
  sections?: readonly SettingsSectionSpec[];
  controls?: Record<string, CustomControlRenderer<any>>;
}

export interface SettingsHandle {
  readonly element: HTMLElement | null;
  refresh(): void;
  dispose(): void;
}

export interface NativeSettingsClasses {
  tab: string;
  panel: string;
  row: string;
  rowLabel: string;
  rowControl: string;
  rowNote: string;
  rowState: string;
  divider: string;
  toggle: string;
  toggleInput: string;
  rangeField: string;
  rangeInput: string;
  rangeThumb: string;
  rangeBubble: string;
  selectWrap: string;
  select: string;
  selectArrow: string;
  button: string;
  buttonWrapper: string;
  buttonLabel: string;
}
