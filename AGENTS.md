# Agent Notes

## Commands

- `npm run dev -- <script>` - watch/build and serve one script
- `npm run build` - build all artifacts
- `npm run build:check` - verify committed artifacts are current
- `npm run format` / `format:check` - Biome formatting
- `npm run lint` - Biome checks plus hardcoded hashed-class scan
- `npm run typecheck` - TypeScript check for every package
- `npm test` - kit, GeoGamble, and artifact tests
- `npm run verify` - lint + typecheck + build check + tests
- `npm run publish -- --confirm-pages-live` - publish permanent legacy gist migration notices (requires `gh`)
- `npm run stage:pages` - stage artifacts for GitHub Pages
- GitHub Actions publishes on pushes to `main`

## Conventions

- Do not edit `dist/*.user.js` directly. Edit `packages/<script>/src/` and rebuild.
- Never use a full hashed CSS module class. Use `[class*="module_local__"]` or a `gg-kit` selector.
- Prefer `data-qa` and semantic selectors over class names.
- Keep shared GeoGuessr behavior in `packages/gg-kit`; keep script-specific behavior in its package.
- New UI must use a `gg-`, `ggk-`, `bgh-`, or `ggb-` namespace.
- Settings are schema/config driven; register a section with `gg-kit` instead of building a tab/panel.
- Do not add runtime `@require` dependencies. Bundle code into the userscript.
- Do not commit `.har`, `storageState.json`, cookies, or tokens.

## Adding a script

1. Create `packages/<name>/src/main.ts` and `src/userscript.meta.txt`.
2. Add `package.json`, `userscript.config.mjs`, and a `dist/` output path.
3. Use `__VERSION__`, `__UPDATE_URL__`, and `__DOWNLOAD_URL__` in the metadata template.
4. Add the package to the workspace (it is picked up by `packages/*`).
5. Run `npm run build -- <name>` and `npm run verify`.
