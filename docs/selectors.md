# Selector policy

GeoGuessr uses CSS modules whose class names end in a build-specific hash, for example `game-menu_settingsContainer__NeJu2`. The hash changes between deployments. Selectors must not depend on it.

## Priority

1. `data-qa` attributes and stable semantic attributes:
   - `[data-qa="guess-map-canvas"]`
   - `[data-qa="perform-guess"]`
   - `[role="dialog"]`, `[role="tablist"]`, `[role="tabpanel"]`
2. CSS module prefix through the double underscore:
   - `[class*="game-menu_row__"]`
   - `[class*="guess-map_canvas__"]`
   - `[class*="button_button__"]`
3. Scoped structure, role, or visible text. Use text only as a last resort because the site is localized.
4. React fiber and Google Maps internals (`__reactFiber$`, `map.__e3_`) only inside `gg-kit` map helpers, with feature detection and diagnostics.

## Rules

- Never write `game-menu_settingsContainer__NeJu2` or another full hash.
- `npm run lint` fails on hashed selectors.
- Prefer `query("capability")` from `gg-kit` over ad-hoc `document.querySelector` for shared UI.
- Injected UI uses namespaced classes and IDs: `gg-`, `ggk-`, `pers-`, or `ggb-`.
- Add candidate selectors as a list (`any: [...]`), not a single brittle selector.
- Keep the scope narrow: search inside the settings dialog or guess map, not the whole document.

## Runtime diagnostics

`gg-kit` records the site build ID and selector health. Run this in the page console:

```js
__GG_DIAGNOSTICS__.report()
__GG_DIAGNOSTICS__.log()
```

`gg-kit` logs a warning when the build ID changes. The report includes missing capabilities and their descriptions. Use it to update `packages/gg-kit/src/selectors.ts`.

## When a site update breaks a script

1. Open the affected page and run the diagnostics report.
2. Find the missing capability.
3. Inspect the new DOM. Prefer a `data-qa` or semantic alternative.
4. Add a prefix or fallback candidate to the selector registry.
5. Add a small fixture under `fixtures/dom/` if the logic is non-trivial.
6. Run `npm run verify` and publish a patch release.
