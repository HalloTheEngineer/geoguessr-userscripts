# Release

## Versioning

Each package has its own semantic version in `package.json`. The build injects it into `@version` and into the package's `versionDefine`.

- Patch: selector fixes, bug fixes
- Minor: new settings or features
- Major: behavior changes that require user action

## Publish

Set the repository Pages source to **GitHub Actions** before the first deployment. Publishing is managed by GitHub Actions:

- `verify.yml` runs `npm run verify`.
- `publish.yml` runs on pushes to `main`, builds artifacts with a `YYYY.MM.DD.<run>` version, deploys them to GitHub Pages, uploads `assets/geosurfer/brainrot.mp4` to the `userscripts-assets` release. Legacy gists are updated manually with permanent migration notices after Pages is verified.

Local checks:

```bash
npm run verify
npm run stage:pages
npm run publish -- --dry-run
# after Pages is verified:
npm run publish -- --confirm-pages-live
```

`@updateURL`/`@downloadURL` are generated from `repo.config.json`. Legacy gists are replaced permanently with migration notices linking to the Pages site. The GitHub Pages filenames are stable; GeoGamble now publishes as `geoguessr-geogamble.user.js`.

Publishing is never part of `npm run verify` or `npm run build`.

## Clean reset

This refactor intentionally drops legacy settings/history. The new config/data keys are:

- `gg.adblocker.config`
- `gg.match-notifier.config`
- `gg.persistent-game-summary.config`
- `gg.persistent-game-summary.history`
- `gg.geogamble.config`

Old keys are removed on first load. Include this warning in the next release notes. Dev builds use the next patch version with a `-dev` prerelease; CI publishes date/run-versioned artifacts.

## Pre-release checklist

- [ ] `npm run verify` passes
- [ ] `npm run build:check` reports all artifacts current
- [ ] `npm run lint` reports no hashed selectors
- [ ] Manual smoke test on the affected GeoGuessr route
- [ ] `__GG_KIT_DIAGNOSTICS__` has no unexpected missing selectors
- [ ] No `.har`, tokens, or cookies staged
- [ ] Version bumped for every changed package
