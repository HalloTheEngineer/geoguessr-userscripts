import { isVisible } from "./dom.js";
import { hasDom } from "./window.js";

export interface SelectorSpec {
  any: string[];
  description?: string;
  required?: boolean;
}

export const SELECTORS: Record<string, SelectorSpec> = {
  "game.controls": {
    any: ['[data-qa="game-controls"]', '[class*="game_controls__"]'],
    description: "In-game bottom control bar",
    required: true,
  },
  "game.settingsRoot": {
    any: ['[class*="game-menu_settingsContainer__"]', '[data-qa="game-settings"]'],
    description: "Native in-game settings container",
  },
  "game.settingsOptions": {
    any: ['[class*="game-menu_optionsContainer__"]', '[class*="game-menu_options"]'],
    description: "Native in-game settings options list",
  },
  "game.settingsVolume": {
    any: ['[class*="game-menu_volumeContainer__"]'],
    description: "Native volume slider row",
  },
  "game.settingsSubHeader": {
    any: ['[class*="game-menu_subHeader__"]'],
    description: "Native settings sub-header",
  },
  "game.hudButton": {
    any: ['[class*="styles_hudButton__"]'],
    description: "Native round HUD button",
  },
  "game.menuRow": {
    any: ['[class*="game-menu_row__"]'],
    description: "Native settings row",
  },
  "game.menuDivider": {
    any: ['[class*="game-menu_divider__"]'],
    description: "Native settings divider",
  },
  "game.menuToggle": {
    any: ['[class*="toggle_toggle__"]'],
    description: "Native settings toggle",
  },
  "game.menuRange": {
    any: ['[class*="range-slider_field__"]'],
    description: "Native settings range slider",
  },
  "game.menuButton": {
    any: ['[class*="button_button__"]'],
    description: "Native button",
  },
  "guessMap.root": {
    any: ['[data-qa="guess-map"]'],
    description: "Guess map wrapper",
  },
  "guessMap.canvas": {
    any: ['[data-qa="guess-map-canvas"]', '[class*="guess-map_canvas__"]'],
    description: "Guess map canvas",
  },
  "guessMap.submit": {
    any: ['[data-qa="perform-guess"]'],
    description: "Guess submit button",
  },
  "guessMap.active": {
    any: ['[class*="guess-map_active__"]', '[class*="guess-map_guessMap__"]'],
    description: "Expanded guess map",
  },
  "profile.widgetRow": {
    any: ['[class*="profile-v2_widgetRow__"]'],
    description: "Profile widget row",
  },
  "duel.summaryRound": {
    any: ['[class*="game-summary_playedRound__"]'],
    description: "Duel summary round",
  },
};

export type SelectorKey = keyof typeof SELECTORS;

export function query<T extends Element = HTMLElement>(
  key: SelectorKey,
  root: ParentNode = document,
): T | null {
  if (!hasDom()) return null;
  const spec = SELECTORS[key];
  for (const selector of spec.any) {
    const element = root.querySelector<T>(selector);
    if (element) return element;
  }
  return null;
}

export function queryVisible<T extends HTMLElement = HTMLElement>(
  key: SelectorKey,
  root: ParentNode = document,
): T | null {
  const element = query<T>(key, root);
  return element && isVisible(element) ? element : null;
}

export function queryAll<T extends Element = HTMLElement>(
  key: SelectorKey,
  root: ParentNode = document,
): T[] {
  if (!hasDom()) return [];
  const seen = new Set<T>();
  for (const selector of SELECTORS[key].any) {
    for (const element of root.querySelectorAll<T>(selector)) seen.add(element);
  }
  return [...seen];
}

export function classToken(prefix: string, root: ParentNode = document): string | null {
  if (!hasDom()) return null;
  const element = root.querySelector(`[class*="${prefix}"]`);
  if (!element) return null;
  const token = [...element.classList].find((name) => name.startsWith(prefix));
  return token || null;
}

export function copyNativeClasses(
  target: Element,
  prefixes: string[],
  root: ParentNode = document,
): string[] {
  const copied: string[] = [];
  for (const prefix of prefixes) {
    const token = classToken(prefix, root);
    if (token && !target.classList.contains(token)) {
      target.classList.add(token);
      copied.push(token);
    }
  }
  return copied;
}

export interface SelectorHealth {
  key: string;
  ok: boolean;
  selector: string | null;
  description?: string;
}

export function health(root: ParentNode = document): SelectorHealth[] {
  return Object.entries(SELECTORS).map(([key, spec]) => {
    let found: string | null = null;
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
