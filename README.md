# GeoGuessr Userscripts

A small monorepo for GeoGuessr userscripts. Each script is built from `src/` into a single self-contained `dist/*.user.js` artifact.

## Scripts

| Package | Artifact | Description |
| --- | --- | --- |
| `packages/adblocker` | `dist/geoguessr-adblocker.user.js` | Best-effort ad blocking plus targeted UI cleanup |
| `packages/geogamble` | `dist/geoguessr-geogamble.user.js` | Country gambling and per-round location cases |
| `packages/match-notifier` | `dist/geoguessr-match-notifier.user.js` | Match and new-round alert sounds |
| `packages/geosurfer` | `dist/geoguessr-geosurfer.user.js` | Optional lazy video overlay for the in-game stats panel |
| `packages/better-game-history` | `dist/geoguessr-better-game-history.user.js` | Account-scoped solo/team history, 300-per-queue ranked backfill, and selectable team graphs |

Install a generated artifact in Tampermonkey, Violentmonkey, or a compatible userscript manager. Artifacts are published to GitHub Pages:

| Script | Install URL |
| --- | --- |
| AdBlocker | https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-adblocker.user.js |
| GeoGamble | https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-geogamble.user.js |
| GeoSurfer | https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-geosurfer.user.js |
| Match Notifier | https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-match-notifier.user.js |
| Better Game History | https://hallotheengineer.github.io/geoguessr-userscripts/geoguessr-better-game-history.user.js |

## Development

```bash
npm install
npm run dev -- match-notifier          # build/watch one script, serve all selected
npm run dev                            # build/watch every script
npm run build                          # build every artifact
npm run build -- geogamble             # build one artifact
npm run build:check                    # fail if a committed artifact is stale
npm run format                         # format all authored code with Biome
npm run verify                         # format check + lint + typecheck + build:check + tests
```

The dev server lists installable scripts at `http://127.0.0.1:8787/`. It rebuilds on source changes and uses the next patch version with a timestamped `-dev` prerelease (for example `0.15.2-dev.20261118210506`) so dev builds sort above the current release while the following stable patch still sorts above them. Reload the GeoGuessr tab after a rebuild.

Tests:

```bash
npm run test:kit                 # gg-kit unit tests
npm run test:geogamble           # GeoGamble core and bundle contract tests
npm run test:better-game-history # history data, hydration, feed, and graph tests
npm run test:artifacts           # artifact metadata, site, and migration tests
npm test                         # all of the above
```

## Layout

```text
tooling/                  Generic build, dev server, publish, selector lint
packages/gg-kit/          Shared GeoGuessr userscript library (TypeScript)
packages/<script>/        src/, dist/, tests/, userscript.config.mjs
tests/                    Repository-level artifact tests
docs/                     Architecture, selector policy, release notes
fixtures/                 Small sanitized DOM/API fixtures
```

Before publishing, run the [live smoke test](docs/smoke-test.md) with all five scripts installed.

## Install page

GitHub Pages serves a landing page at:

```text
https://hallotheengineer.github.io/geoguessr-userscripts/
```

It lists every script in a rectangular row with feature tags, install links, installation steps, migration status, and enlargable previews. Generate it locally with:

```bash
npm run build:site
npm run stage:pages
```

## Publishing

GitHub Actions builds and publishes artifacts on every push to `main`:

- `.github/workflows/verify.yml` runs `npm run verify`.
- `.github/workflows/publish.yml` builds date/run-versioned artifacts, deploys them to GitHub Pages, and uploads the GeoSurfer media asset to the `userscripts-assets` release.
- `npm run stage:pages` stages local artifacts for inspection.
- `npm run publish -- --dry-run` checks the permanent legacy gist migration notices; run with `--confirm-pages-live` after verifying Pages.

The update/download URLs are generated in `tooling/build-userscript.mjs` from `repo.config.json`.

## Shared library

`gg-kit` is bundled into each script rather than loaded with `@require`. Multiple installed scripts share one runtime hook set and one Userscripts settings host through page globals. It provides:

- schema-driven config with validation, sparse persistence, subscriptions, reset, and import/export
- a shared settings host: one **Userscripts** native tab with one sub-tab per script; no floating overlay
- reusable toggle, range, number, select, text, action, and custom controls
- bounded list/session storage for history and per-round data
- one run-once app lifecycle with route listeners, cleanup, and config flush
- selector registry with `data-qa`, semantic, and CSS-module-prefix fallbacks
- one shared DOM observer and route-change helper
- safe `__NEXT_DATA__` page/user/build helpers
- HTTP feed, duel, profile, and user helpers with retry and encoded pagination
- one shared WebSocket bridge for JSON, binary, send, open, and close events
- duel event parsing and pin-frame encoding
- diagnostics with site buildId change detection

## Selector policy

1. Prefer `data-qa` and semantic attributes.
2. Use CSS-module prefixes through `__`: `[class*="game-menu_row__"]`.
3. Use scoped role/structure/text fallbacks.
4. Keep React fiber and Google Maps internals inside `gg-kit` map helpers.
5. Never hardcode a full hashed class. `npm run lint` fails the build if one is added.

GeoGuessr build IDs are compared on startup and reported by `__GG_DIAGNOSTICS__.report()`. See [docs/selectors.md](docs/selectors.md).

## Notes

- Hand-written code is TypeScript; generated data and assets remain non-authored assets.
- Existing settings/history are **not migrated** in this release. Old keys are removed once; scripts start from fresh defaults.
- Remove captured `.har` files before committing. They can contain `_ncfa` cookies and session data.
- Scripts use the site's authenticated APIs from the page context. Keep request volume low; `gg-kit` retries 429 responses with backoff.
- GeoGuessr classes and internals are unofficial and can change. Run `npm run site:build` after a site update, then check diagnostics on the affected page.
