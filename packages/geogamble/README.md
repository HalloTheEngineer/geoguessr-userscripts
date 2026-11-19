# GeoGamble

GeoGamble is an unofficial GeoGuessr userscript for country gambling and per-round location cases. When you click the guess map inside an enabled country, it animates a series of random pins inside that country and then places the final guess through GeoGuessr's normal Google Maps click path. A separate case system can reveal up to three location hints per round.

The animation uses a custom overlay pin and synthesized Web Audio ticks. Country data is embedded in the script, so there are no runtime network requests or external assets.

## Install

1. Install Tampermonkey, Violentmonkey, or a compatible userscript manager.
2. Create a new userscript.
3. Replace the template contents with [`geoguessr-geogamble.user.js`](./dist/geoguessr-geogamble.user.js).
4. Save the script and reload GeoGuessr.
5. Start a standard game and click the guess map inside an enabled country.

The script is installed with `@match https://www.geoguessr.com/*`, `@run-at document-start`, `@grant none`, and `@noframes`.

## Usage

- Click inside an enabled country on the guess map. The final native guess is placed inside that country, not at the exact click location.
- Click outside every enabled country and GeoGuessr behaves normally.
- If `activationKey` is set, hold that key while clicking to gamble. Clicks without the key pass through to the game.
- With `autoSubmit: true`, the script clicks `[data-qa="perform-guess"]` after the final pin. This is best-effort and off by default.
- In duels, `duelSubmitPin` records the gamble's final location on the duel WebSocket the moment you click, so a timer expiring mid-gamble cannot void the round. `autoSubmit` still performs the actual guess submit. When the server reports the round ended (`DuelRoundTimedOut`/`DuelFinished`), any active gamble animation is cancelled.
- If `sound` is enabled, the first gamble click also unlocks/resumes the browser audio context.

## Case Opening

A round chest button matching GeoGuessr's native HUD style appears to the right of the game controls during eligible rounds. It offers three free cases per round: Scout, Surveyor, and Relic. Cases are available in standard games, party games, and unranked duel/team-duel games. Ranked duels and ranked team duels never show the feature, and replay, summary, spectate, and broadcast routes are excluded.

The chooser is a single row of three large color-coded case buttons with the case type above each one. Opening uses a Counter-Strike-style horizontal reel: dark item tiles, rarity-colored lower edges, an amber center marker with arrow caps, side fades, a fast start, and a long deceleration. On landing, the marker settles at a random point inside the winning tile and the tile glows while the others dim.

Each case can be opened once per round:

| Case | Rarity odds |
| --- | --- |
| Scout | Common 60% · Uncommon 30% · Rare 9% · Epic 1% |
| Surveyor | Common 10% · Uncommon 40% · Rare 35% · Epic 13% · Legendary 2% |
| Relic | Uncommon 10% · Rare 30% · Epic 35% · Legendary 20% · Mythic 5% |

The hint system is a data-derived [geographic atlas](./HINT_ATLAS.md). It deliberately excludes Google/Street View-dependent visual metas such as driving side, coverage generation, sun position, car details, road-line colors, bollards, poles, signs, plates, and architecture.

| Rarity | Role | Hints |
| --- | --- | --- |
| **Common** | Broad planetary filters | Hemisphere, Longitude Half, Tropical/Non-Tropical, Coastal/Landlocked, Island/Mainland |
| **Uncommon** | Continental and environmental context | Continent, Climate Group, Elevation Band, Population Density |
| **Rare** | Regional and cultural filters | UN Subregion, Script Family, Language Family, Currency, Internet TLD |
| **Epic** | Country identification | Country Name, Flag, Outline, ISO Code |
| **Legendary** | Near-location narrowing | Nearest Major City, 50 km radius, 20 km radius, 1° coordinate cell, 0.05° coordinate cell |
| **Mythic** | Instant solve | Exact location pin |

Crate focus:

- **Scout:** Position and Environment, Common-heavy.
- **Surveyor:** Environment and Society, Uncommon/Rare.
- **Relic:** Society, Identity, and Precision, Rare/Epic with Legendary/Mythic chances.

The picker prefers a different hint family from hints already active in the round, falling back when the data or rarity pool requires it.

Hints stack up to three per round. Spatial hints are drawn directly on the guess map. All active hints also appear in a map-attached drawer on the left whenever the guess map is active (`guess-map_active__`): each card shows its title, location/value detail, and whether it is shown on the map or is text-only. Use the card to toggle a spatial overlay or `×` to remove it. Removed hints stay in the round's used set, so the same hint type cannot be drawn again until the next round.

The reel uses a 5.2-second CS-style fast start and long deceleration. Tick sounds are emitted when the center marker enters a new tile. The winning tile stays highlighted before the reward screen appears. The reward screen stays open until you close it with **Close**, the `×`, or a backdrop click.

Continents, UN subregions, hemispheres, longitude halves, tropical bands, country categories, climate zones, radius circles, coordinate cells, and country outlines all attach to the active guess map (or the largest visible map as a fallback). Radius hints use a randomly offset circle with no center marker, and coordinate hints use the containing coordinate cell, so the target is never drawn at the overlay center.

When two or more area clues are active, their map areas are intersected instead of drawn separately. Country traits, bands, climate cells, country outlines, radius circles, and coordinate cells all participate; the map shows only the common area, and uses one blended composite color. Non-circle intersections are computed once and drawn as native Google Maps polygons, so panning and zooming stay smooth. Radius intersections use a canvas that redraws only on map idle and hides while the map is moving. An empty intersection leaves the map blank. Nearest-city and exact-pin markers remain independent precision indicators. The map fits the intersection bounds and is updated only after the reel marker lands. The hint drawer follows map activation, resizing, and reattachment; when there is no room outside the map it overlays the map's left edge.

The exact round location comes from the Street View panorama's `setPano`/`getPosition` calls in standard and party games, and from the duel WebSocket state in duels. Country-specific hints use a separate all-country lookup, so they still work when the round's country is excluded from the gambling filter. Hints over the ocean fall back to geometry/climate/city clues.

Hint data is generated offline and embedded at build time: Natural Earth country/city data, mledoze/countries country traits, CIA World Factbook mean elevation, and a 2° climate grid derived from the Köppen–Geiger dataset. Source URLs and licenses are recorded in `src/core/hint-data-sources.generated.js`.

Case state is stored only in this tab's `sessionStorage` and resets when the round or panorama changes. The mythic exact-location hint draws a pulsing pin on the guess map but never submits a guess. Case hints are separate from the gamble animation and do not change its target or submission behavior.

## Configuration

Edit `src/config.ts`, or use the shared **Userscripts** settings tab (see below). The effective defaults are:

```js
const CONFIG_DEFAULTS = {
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
  debug: false,
};
```

| Option | Default | Meaning |
| --- | --- | --- |
| `enabledCountries` | `"all"` | `"all"` or an array of ISO 3166-1 alpha-2 codes, such as `["fr", "de", "jp"]`. |
| `excludeCountries` | `[]` | Country codes to remove from the enabled set. |
| `animationMs` | `2800` | Total animation duration in milliseconds. |
| `startIntervalMs` | `45` | Initial delay between pin switches. |
| `endIntervalMs` | `320` | Final delay between pin switches. |
| `finalHoldMs` | `250` | How long the final pin stays before the native guess is placed. |
| `sound` | `true` | Enable synthesized gamble/case ticks and finish sounds. |
| `volume` | `0.35` | Audio volume from `0` to `1`. |
| `autoSubmit` | `false` | Click the guess button after placing the final pin. |
| `submitDelayMs` | `250` | Delay before the first auto-submit attempt. |
| `duelSubmitPin` | `true` | In duels, submit the gamble's final point as a pin (`DuelPinPlaced`) on the duel WebSocket immediately at click time, before the animation finishes. If the round timer expires mid-gamble, the recorded pin stands instead of an empty guess. |
| `duelSubmitHop` | `false` | Additionally submit each animation hop as a pin during duels. The last pin before the timer expires wins. Opponent streams will show the moving pin. |
| `activationKey` | `"none"` | `"none"`, `"shift"`, `"alt"`, `"ctrl"`, or `"meta"`. |
| `allowOtherModes` | `true` | Best-effort generic guess-map discovery outside standard games. |
| `centerBias` | `0` | `0` keeps uniform sampling across all polygons. Above `0`, picks are weighted by a Gaussian heatmap around the country's centre: `weight = exp(-12 × bias × d²)`, where `d` is the distance from the centre in half-bbox units. Near-centre picks become increasingly common and distant picks increasingly rare. For `mainOnly: true` the heatmap is centred and scaled on the largest polygon (remote polygons stay eligible but fade out); for `mainOnly: false` it uses the midpoint of the combined bounding box across all polygons (sea allowed). Values below `1` weight picks continuously; exactly `1` always picks the centre point and skips the animation. |
| `heatmapOverlay` | `false` | Debug: overlay every enabled country with its center-bias probability density at the live `centerBias`, and mark the center used by the sampler. Colors are normalized per country. |
| `debug` | `false` | Log map discovery, attachment, and errors to the console. |

Notes:

- `activationKey: "shift"` consumes shift-clicks inside enabled countries, so the native shift-click deselection is not available there.
- Below `1`, `centerBias` applies a smooth falloff and every polygon remains eligible. `centerBias: 1` always picks the exact centre, places the final pin immediately, and skips the gamble animation.
- Editing the script in Tampermonkey can be overwritten when you update or reinstall it. Keep a copy of your configuration.
- There is an in-page settings UI — see the next section.
- Advanced timing knobs (`startIntervalMs`, `endIntervalMs`, `finalHoldMs`) are CONFIG-only.

## Settings

GeoGamble registers a **GeoGamble** sub-tab in the shared **Userscripts** settings tab in the official in-game settings dialog. The sub-tab contains:

- **Gamble**: animation length, center bias, activation key.
- **Countries**: "All countries" checkbox plus autocomplete multi-select pickers for the enabled and excluded lists (type a name or ISO code, click or press Enter to add, click the chip's `×` to remove).
- **Submit & duels**: auto submit, duel plonk submission, per-hop duel plonk, submit delay.
- **Audio**: sound toggle and volume.
- **Misc**: other modes, performance tweaks, center heatmap, and debug logs, plus section/all reset controls.

Changes apply instantly through the shared config store and `window.GeoGamble.applyConfig`; values persist in the versioned `gg.geogamble.config` key. **Reset all** restores defaults and removes the stored key. `startIntervalMs`, `endIntervalMs`, and `finalHoldMs` remain hidden in the settings UI and configurable only through the config store/API.

Scrolling in GeoGuessr's settings dialogs used to repaint the whole dialog every frame, because the dialog's scroll container was not an isolated paint root. GeoGamble pins that container (`contain: paint`, `will-change: scroll-position`), moving scroll repaints to the compositor. Visually identical, and it fixes the scroll jank on every tab (including General and Keybindings), not just GeoGamble's. The **Performance tweaks** toggle under Misc (on by default) switches this on or off live.

### Debug center heatmap

Enable **Center heatmap** under Misc to draw a debug overlay on the guess map. It uses the current `centerBias` and covers every enabled country:

- The probability field is rasterized in screen space and clipped to each country's land polygons. Colors are normalized per country (blue = low, red = high), so countries whose center lies in the sea still show a readable hotspot.
- At `centerBias: 0` the overlay is a uniform light-blue tint over enabled land.
- At `centerBias: 1` only the center markers are drawn, matching the exact-center sampler.
- A white dot marks the exact center used by the sampler. A cyan ring marks `mainOnly: false` centers, which may lie in the sea. ISO labels appear at zoom level 5 and above for large countries.
- The overlay respects the enabled and excluded country lists, does not intercept map clicks, and disappears when the setting is turned off or the map detaches.

The overlay is a visualization only; it does not change gamble targets or submit anything.

## Supported Modes

- Standard games and challenges are the primary target.
- Case opening is available in standard, party, and unranked duel/team-duel games. Ranked duels and ranked team duels hide it entirely; replay, summary, spectate, and broadcast pages also hide it.
- Duels, team duels, streaks, and battle royale are best-effort. The script looks for a guess map with marker/guess props and falls back to generic map discovery when `allowOtherModes` is enabled.
- Country-streak/region maps are intentionally skipped. They use a different map component and are not guess maps.
- Singleplayer custom map games (started from the `geoguessr.com/maps/{id}/play` screen) are supported; they use the same guess-map component.
- Custom map play pages are supported when they use the same guess-map component; discovery errors are logged by setting `debug: true`.
- In duels and team duels the WebSocket plonk (`duelSubmitPin`/`duelSubmitHop`) activates only when the page's duel socket (`gs2.geoguessr.com`) is detected; other modes are unaffected.
- If the script attaches to the wrong map, set `allowOtherModes: false` and use a standard game.

## How It Works

1. The script finds the guess-map canvas and walks React fiber props to locate the Google Maps instance.
2. It wraps existing click handlers in `map.__e3_.click` and hooks `map.addListener`/`google.maps.event.addListener` for future handlers.
3. A gate suppresses the original handlers while the animation runs.
4. The click location is tested against simplified country polygons. If it is inside an enabled country, a predetermined random point is chosen inside that country (weighted toward its centre when center bias is above `0`).
5. A custom `OverlayView` pin jumps between random points with a decelerating schedule. Each switch plays a short synthesized tick.
6. After the final hold, the script triggers the native Google Maps `click` event with a real `google.maps.LatLng`, the original `domEvent`, and a `stop` function. This lets GeoGuessr's normal validation and pin-placement code run.
7. If `autoSubmit` is enabled, the script waits briefly and clicks the guess button.
8. In duels, when the gamble point is decided the script sends a synthesized pin frame on the page's duel WebSocket (the same binary `PinPosition` sample the client itself sends), mirroring the active round number. Incoming `DuelRoundTimedOut`/`DuelFinished` events cancel a running gamble immediately.
9. Case opening reads the exact panorama position from the wrapped Street View panorama or the duel state event, picks a weighted rarity, and stores the resulting hint under a per-round `sessionStorage` key. Case overlays use Google Maps polygons, circles, and a custom `OverlayView` marker on the largest visible guess map.

The script does not modify country data at runtime and sends no data anywhere except the duel pin frames to the game's own WebSocket when `duelSubmitPin`/`duelSubmitHop` are active.

## Country Data

The embedded data is derived from Natural Earth 1:110m Admin 0 Countries:

- 175 countries and 242 polygons, about 150 KB of inline data.
- Coordinates are rounded to two decimal places.
- Polygons smaller than `0.005` square degrees are dropped.
- Holes are preserved; South Africa's Lesotho hole is handled.
- Antimeridian polygons (Fiji, Russia) are handled by longitude unwrapping.
- Features without an ISO 3166-1 alpha-2 code are skipped. Northern Cyprus and Somaliland are therefore not merged into China or Sierra Leone.
- France's Natural Earth feature includes its overseas polygons.
- Each country carries `mainOnly`. `true` (default) centres and scales the center-bias heatmap on the largest polygon; `false` (currently Greece, Indonesia, and the Philippines) centres it on the midpoint of the combined bounding box of all polygons (sea allowed), so the heatmap reflects the whole archipelago.
- Areas without Google coverage are excluded (see below): Papua, Seram, and Buru in Indonesia; most of the Canadian Arctic Archipelago, Anticosti, and Haida Gwaii; Svalbard; the Russian Arctic islands; and two Alaskan islands. Exclusions are recorded in `scripts/data/polygon-exclusions.json` and applied on every regeneration.

Simplified 110m borders are not exact. Clicks near a border can resolve to a neighbouring country, and random points are inside the simplified polygon rather than on the real border.

### Regenerate the data

```bash
npm run countries
```

Or provide a local Natural Earth GeoJSON file:

```bash
node scripts/generate-countries.mjs --source /path/to/ne_110m_admin_0_countries.geojson
```

The generator tries `/tmp/opencode/ne110b.geojson`, then `.cache/ne_110m_admin_0_countries.geojson`, then downloads the Natural Earth file from GitHub. It replaces the block between:

```js
// ==GEOGAMBLE_COUNTRIES_START==
// ==GEOGAMBLE_COUNTRIES_END==
```

Natural Earth data is public domain. Regeneration requires Node.js 18 or newer for `fetch`. The generator stamps `mainOnly` on every country and keeps the curated exception list (`MAIN_ONLY_EXCEPTIONS`).

### Exclude islands and areas

Some places have no Google Street View coverage, so a gamble there always loses. The local exclusion tool removes whole polygons from the embedded data:

```bash
npm run island-tool
```

Open `http://127.0.0.1:4173`, click the islands to remove (wheel zooms, drag pans, search jumps to a country), then press **Preview** or **Apply**. Applying rewrites `src/core/countries.generated.js` and records each removed polygon's exact bounding box in `scripts/data/polygon-exclusions.json`. The generator matches those rectangles against polygon bounds, so `npm run countries` keeps the exclusions and drops the same polygons from the Natural Earth source.

The tool is a zero-dependency local server bound to `127.0.0.1`; it serves only the page and its own JSON endpoints. Removed areas are no longer gamble targets — clicks there fall through to GeoGuessr's native pin behavior.

## Development

Source lives in `src/`; `dist/geoguessr-geogamble.user.js` is the generated, installable artifact and should not be edited directly.

From the repository root:

```bash
npm install
npm run build -- geogamble        # rebuild dist/geoguessr-geogamble.user.js
npm run build:check               # fail if any committed artifact is stale
npm run dev -- geogamble          # watch sources and serve the userscript
npm run test:geogamble            # Node test suite
npm run verify                    # lint + typecheck + build:check + tests
```

Package-local data generators:

```bash
npm run countries -w geogamble    # regenerate src/core/countries.generated.js
npm run hint-data -w geogamble    # regenerate traits, cities, and climate grid
npm run island-tool -w geogamble  # local island exclusion tool
```

For local Tampermonkey development, run `npm run dev -- geogamble` from the repository root and install/update from `http://127.0.0.1:8787/geoguessr-geogamble.user.js`. The script is rebuilt on source changes; reload the GeoGuessr tab afterward. The release remains a single self-contained file with no runtime imports or external assets.

`npm run test:geogamble` runs the Node test suite against the source core plus a built-bundle contract test:

- Country data integrity and ISO uniqueness
- Point lookup, ocean, enclaves, holes, and antimeridian handling
- Random-point sampling inside country polygons
- Schedule and configuration resolution
- Click-gate suppression, final event, fail-open, cancellation, and re-wrapping
- Animation timing, cancellation, and map-loss handling
- Duel WS protocol: golden-byte pin frame encoding against a captured duel, event classification, config resolution
- Case opening: geographic atlas families, hint eligibility/fallback, family diversity, spatial bounds, crate odds, route gating, round keys, snapshot validation, climate/city/geography traits, duel-state parsing
- Settings storage and helpers: stored-config merging, country filtering, list parsing
- Center-heatmap math: footprint reuse, Gaussian weights, raster clipping, holes, normalization, antimeridian
- Island exclusions: rectangle shape, stripped-polygon integrity, every country keeps a polygon
- Core-source tests, generated country data, and built-bundle metadata/version checks

A Playwright smoke test against a mock Google Maps page was used during development to verify canvas/fiber discovery, existing and future click handlers, overlay creation, final native event delivery, and cleanup. The mock page is not part of the repository.

## Troubleshooting

- **Nothing happens:** Confirm the userscript is enabled and the page was reloaded. Use a standard game, click inside an enabled country, and check the console. Set `debug: true` for `[GeoGamble]` logs.
- **Wrong country or no country:** The data is simplified 110m. Borders and small islands are approximate. Exclude the country or regenerate with a higher-resolution dataset if needed.
- **No sound:** Check `sound` and `volume`. Browsers may keep audio suspended until a user gesture; the gamble click normally resumes it.
- **Auto-submit does not click:** The guess button may still be disabled or the selector may have changed. Leave `autoSubmit` off and click manually.
- **Wrong map in another mode:** Set `allowOtherModes: false`, or report the mode so the map-discovery rules can be extended.
- **Shift-click does not deselect:** If `activationKey` is `"shift"`, shift-click is consumed for gambling inside enabled countries.
- **Cases button is missing:** Cases require an exact panorama position and an eligible route. Ranked duels/team duels, replays, summaries, spectate/broadcast pages, and games where the panorama hook has not fired yet intentionally hide it. Check the console with `debug: true`.

## Data Credits

- **Natural Earth** country geometry, continent attributes, and major-city points: public domain.
- **mledoze/countries** country traits: ODbL 1.0.
- **CIA World Factbook** country mean elevation: public domain.
- **Köppen–Geiger** climate data via `koppen-climate-lookup`: ISC package; cite Kottek et al. 2006 and Rubel et al. 2017.

Generated hint-data provenance is also stored in `src/core/hint-data-sources.generated.js`. No hint data is fetched at runtime.

## Limitations

GeoGamble is unofficial and is not affiliated with GeoGuessr. Synthetic Google Maps events and React internals can change without notice. Use the script at your own risk and follow GeoGuessr's terms and anti-cheat rules. The script is intended for casual play and testing, not for competitive abuse. Cases are unavailable in ranked duels/team duels, but the underlying hints are still an information advantage; use them only where you are comfortable doing so.

## Files

- `src/main.ts` - browser entry, map hooks, audio, and app state.
- `src/config.ts` - config schema/defaults used by the shared settings host.
- `HINT_ATLAS.md` - hint families, rarity, crate focus, and data provenance.
- `src/core/` - pure country, geo, heatmap, sampling, duel, config, case, and gamble modules.
- `src/core/countries.generated.js` - generated Natural Earth country geometry.
- `src/core/country-traits.generated.js` - generated country traits.
- `src/core/climate-grid.generated.js` - generated 2° climate grid.
- `src/core/cities.generated.js` - generated major-city gazetteer.
- `src/core/hint-data-sources.generated.js` - hint-data provenance and licenses.
- `scripts/data/language-traits.json` - language-to-script/family mapping.
- `dist/geoguessr-geogamble.user.js` - generated installable userscript.
- `userscript.config.mjs` - build, budget, and publish configuration.
- `scripts/generate-countries.mjs` - Natural Earth geometry generator.
- `scripts/generate-hint-data.mjs` - country-trait, climate-grid, and city generator.
- `scripts/country-data.mjs` - shared data-block and exclusion helpers.
- `scripts/island-tool.mjs`, `scripts/island-tool.html` - local island exclusion tool.
- `scripts/data/polygon-exclusions.json` - polygons removed from the embedded data.
- `tests/` - Node test suite and helpers.
- `package.json` - package metadata and data-generator scripts.
