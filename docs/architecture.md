# Architecture

## Language and tooling

Hand-written code is TypeScript. Generated data files, the embedded alert sound, and fixture snapshots are treated as non-authored assets. Biome enforces formatting and lint rules; `npm run format:check` and `npm run lint` are part of `verify`.

The remaining legacy runtime monolith (`geogamble/src/main.ts`) and GeoGamble pure-core files still carry `// @ts-nocheck` while they are split into typed modules. Shared config/settings/storage/app modules are fully typechecked. Better Game History is fully typed across its data, hydration, feed, graph, and UI modules.

## Multi-script runtime

Each userscript bundles its own copy of `gg-kit`. Runtime state is shared through page globals:

- `__GG_KIT_HTTP__` — one fetch wrapper and middleware lists
- `__GG_KIT_WS__` — one WebSocket proxy and listener sets
- `__GG_KIT_DOM__` — one MutationObserver scheduler
- `__GG_KIT_ROUTE__` — one history/popstate hook
- `__GG_KIT_PANORAMA__` — one Street View prototype hook
- `__GG_KIT_DIAGNOSTICS__` — one script/build/selector registry
- `__GG_KIT_SETTINGS__` — one native Userscripts tab and registration map

The first bundle to load installs each hook and the settings host. Later bundles add listeners, configurations, and settings registrations to the existing state. Same-script duplicates are stopped by the `startUserscript` guard. Shared state records an API version; mismatched versions log a warning while still reusing the first installed implementation.

The settings host also warns and replaces a registration if two script versions use the same settings id. Adblocker intentionally keeps its own immediate MutationObserver because the shared scheduler is debounced and background-aware.

## Build

Every package has a `userscript.config.mjs`:

```js
export default {
  name: "match-notifier",
  entry: "src/main.ts",
  outfile: "dist/geoguessr-match-notifier.user.js",
  meta: "src/userscript.meta.txt",
  versionDefine: "__MATCH_NOTIFIER_VERSION__",
  sizeBudget: 600000,
  publish: { filename: "geoguessr-match-notifier.user.js" },
};
```

`tooling/build-userscript.mjs` reads `repo.config.json` and the package version, renders the metadata template, injects GitHub Pages URLs, optional `@resource`/`@webRequest` lines, bundles with esbuild as an IIFE, validates required metadata, enforces the size budget, and writes atomically. `--check` compares output byte-for-byte with the committed artifact. CI may override the artifact version.

## Configuration and settings

`packages/gg-kit/src/config` owns schema-driven config: defaults, validation, sparse writes, subscriptions, reset/clear, migrations, and import/export. `packages/gg-kit/src/settings` owns the shared **Userscripts** native tab, script sub-tabs, full native class detection, native toggle/range/select/button structures, section cards, control rendering, section ordering, and disposal. Settings are exposed only through the official in-game settings dialog; there is no floating settings overlay. Scripts define a schema and register sections; they do not create their own settings tabs, panels, or control implementations.

`packages/gg-kit/src/app` provides `startUserscript`, which owns run guards, top-frame checks, config loading, settings registration, route listeners, cleanup, and `pagehide` flushing. It also records installed script versions when executed on the GitHub Pages landing page and exits without initializing game behavior.

## Shared runtime

`gg-kit` is bundled into each artifact. It installs page hooks as globals on the page window so multiple scripts share one hook:

- `__GG_KIT_HTTP__` - one `fetch` wrapper and middleware list
- `__GG_KIT_WS__` - one `WebSocket` proxy and listener sets
- `__GG_KIT_DOM__` - one MutationObserver scheduler
- `__GG_KIT_ROUTE__` - history/popstate route listeners
- `__GG_KIT_PANORAMA__` - one Street View prototype hook
- `__GG_KIT_DIAGNOSTICS__` - registered scripts, build ID, selector health

Scripts must not patch `fetch`, `WebSocket`, or DOM observers directly when a kit helper exists.

## Page model

`pageKind()` classifies routes as home, singleplayer, game, duel, team-duel, summary, profile, settings, or other. `gameId()` extracts the route ID. `siteBuild()` reads the Next.js build ID for diagnostics. `currentUserId()` reads the signed-in account from `__NEXT_DATA__` only; `waitForCurrentUserId()` handles hydration timing without treating a viewed profile as the current account.

## API and transport

`http.ts` owns endpoint constants and provides `feedPage`, `duel`, `profile`, and `user`. Feed pagination tokens are URL-encoded. `fetchJson` retries 429 and transient failures with backoff. `mockFetch` is used for the deliberate `/api/duels/ongoing` DELETE suppression.

`ws.ts` parses JSON once and fans out to all scripts. Binary messages and outgoing frames are exposed without copying the socket.

`duel.ts` contains the captured protocol logic: JSON event classification, state normalization, and golden-byte pin-frame encoding.

## UI

`ui.ts` provides style injection and settings/HUD mounting. Native class tokens can be copied at runtime with `copyNativeClasses`, but the UI must still work if those prefixes disappear. All injected classes and IDs are namespaced.

## Testing

- `packages/gg-kit/tests` covers config, settings, selectors, HTTP, duel encoding, and page helpers.
- `packages/geogamble/tests` covers the pure country/case engine and the built bundle contract.
- `packages/better-game-history/tests` covers history merging, ranked solo/team feed classification, team composition hydration, feed pagination, and graph data.
- `tests/artifacts.test.mjs` validates metadata, version, imports, and size budgets for every artifact.
- `npm run lint` rejects hardcoded hashed classes.
- `npm run site:build` compares the public GeoGuessr build ID with the last checked value.
