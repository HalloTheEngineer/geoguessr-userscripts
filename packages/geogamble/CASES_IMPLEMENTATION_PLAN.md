# Case Opening Feature Plan

## Locked Decisions

- Use custom location-derived hints; native GeoGuessr clues are not used.
- Each of the three free crates can be opened once per round.
- Pulled hints stack; up to three active hints per round.
- Mythic reveals the exact pin only; no automatic submit.
- Ranked duels and ranked team duels hide the feature entirely.
- Only standard games, party games, and unranked duels are eligible.

## Game Design

### Crates

| Crate | Common | Uncommon | Rare | Epic | Legendary | Mythic |
|---|---:|---:|---:|---:|---:|---:|
| Scout Case | 60% | 30% | 9% | 1% | - | - |
| Surveyor Case | 10% | 40% | 35% | 13% | 2% | - |
| Relic Case | - | 10% | 30% | 35% | 20% | 5% |

Each crate is free and independently once-per-round. All three can be opened in one round, producing up to three stacked hints.

### Hint Catalog

| Rarity | Hints |
|---|---|
| Common | Hemisphere, climate/latitude band, eastern/western hemisphere, country-name initial |
| Uncommon | Quadrant of country, distance-to-border band, distance-to-country-center band, country-center marker |
| Rare | Country name, country outline highlight, ISO code/flag, coordinates rounded to 1 degree with broad circle |
| Epic | Coordinates rounded to 0.1 degree with ~25 km circle; distance + compass direction from country center |
| Legendary | Coordinates rounded to 0.01 degree with ~3 km circle |
| Mythic | Exact location pin and "Exact location" label |

Rules:

- All country-specific hints use `COUNTRY_DATA` and `findCountryAt`; no external API or new dataset.
- Build a separate all-country index so hints still work when the heatmap/gambling country filter excludes the current country.
- If the point is outside a known polygon, omit country-only hints and fall back to coordinate/hemisphere/radius hints.
- Do not repeat the same hint type within a round; if a rarity pool is exhausted, fall back to an unused coordinate hint.
- Coordinate hints use N/S/E/W formatting and circles large enough to cover their rounding error.

## Runtime Integration

### Location Provider

- Add `installPanoHook()` after `google.maps` loads:
  - Wrap `StreetViewPanorama.prototype.setPano` and `setPosition`.
  - Track `{lat, lng, panoId, roundKey}` from `getPosition()`, `getPano()`, `pano_changed`, `position_changed`, and `status_changed`.
  - Decode hex pano IDs with a new `Core.decodePanoId()` helper; the round payload uses the hex-encoded `panorama.panoId`.
- For standard games, use the panorama position as the exact target.
- For duels, prefer `duel.state.rounds[].panorama` from the WebSocket:
  - `panoId`
  - `lat` / `lng`
  - `currentRoundNumber`
  - `duel.state.gameId`
- Do not show the case button until a valid location/round is known.

### Ranked Gate

- Extend `onDuelMessage` to read `data.duel.state`:
  - `options.isRated` is the authoritative ranked flag; keep `state.isRated` as a fallback.
  - Also read `options.isTeamDuels`, `options.gameContext`, `currentRoundNumber`, and current-round panorama.
- Route handling:
  - `/game/[token]` -> allowed.
  - `/party/...` -> allowed unless `isRated === true`.
  - `/duels/[token]` and `/team-duels/[token]` -> allowed only when `isRated === false`; while unknown, hide.
  - Replays, summaries, spectate routes, broadcasts -> hidden.
- Add an initial-state fallback by scanning `__NEXT_DATA__` and, if needed, the React fiber tree for `duel.state`/`gameState`; if no state is found on a duel route, fail closed until a `DuelStarted`/`DuelNewRound` message arrives.
- Call `syncCaseVisibility()` from `scan()`, the WebSocket handler, and panorama changes so the button disappears immediately if ranked state becomes known.

### Round Lifecycle

- Define `caseRoundKey`:
  - Duel: `gameId:roundNumber:panoId`
  - Standard: `pathname:panoId`
- On round-key change:
  - Close any open case dialog.
  - Remove all hint layers/chips.
  - Reset crate-opened state.
- Persist the current round's opened crates and hint data in `sessionStorage` keyed by `caseRoundKey`; rehydrate overlays once the map/location is available. Remove stale keys when the round changes.
- Hints are capped at three per round and cleared on the next round.

## UI and Visuals

### Controls Button

- Add `ensureCaseButton()` to the existing `scan()` flow.
- Target the native bottom-left controls:
  - Prefer `[class*="game_controls__"] [class*="styles_columnOne__"]`.
  - Fall back to `[class*="game_controls__"]`.
- Create an idempotent wrapper using `.styles_control__Pa4Ta` and a button using `.styles_hudButton__kzfFK`, with `gg-case-button` as a fallback/own class.
- Use an inline chest/box SVG, inherited `currentColor`, `aria-label="Open cases"`, and a remaining-count badge.
- Re-add the button if React replaces the controls; existing MutationObserver/scan loop can handle this.
- Hide the button on ranked/replay/summary/spectate routes or when no active location exists.

### Case Dialog

- Fixed full-screen overlay with `role="dialog"`, `aria-modal`, focus trap, Escape handling, backdrop click, and focus restoration.
- Header: "Cases", remaining count, close button.
- Three crate cards in one row:
  - Rarity color, inline icon, name, odds summary, Open button.
  - Opened crates show a disabled "Opened" state.
- Active-hints section inside the dialog; the same tray is visible outside the dialog after pulls.
- Responsive layout: three columns on desktop, horizontally scrollable/stacked cards on narrow screens.

### Pull Animation

- On crate click, preselect the result using weighted rarity selection, then build a long band of cards containing the winning hint near the target index.
- Animate with Web Animations API or CSS transforms:
  - Fixed-width cards, center marker.
  - `translate3d` from 0 to the computed offset.
  - ~4-5 seconds with a strong deceleration curve.
  - No layout animation; no `filter`, `backdrop-filter`, or `mask`.
- Add a skip path for reduced-motion users; when `prefers-reduced-motion: reduce`, show the result immediately.
- On landing:
  - Enlarge the winning card.
  - Apply rarity-colored glow, radial/conic ray background, particles, scale/pop, and a short title/detail reveal.
  - Auto-close after ~1.8 seconds and apply the hint.
- Optionally add subtle tick/reveal sounds only when `settings.sound` is enabled; reuse the existing audio-context helper.

### Hint Tray and Map Overlays

- Add a small hint tray above the bottom-left controls:
  - One chip per active hint, colored by rarity.
  - Clicking a chip toggles its map overlay; `x` removes it.
  - Include "Clear all" when more than one hint is active.
- Apply overlays to the tracked guess map:
  - Country outline: `google.maps.Polygon` with low-opacity fill.
  - Radius: `google.maps.Circle`.
  - Country-center marker: small custom dot/marker.
  - Exact location: custom pulsing pin via `OverlayView`.
  - Text-only hints: chip only.
- Set `clickable: false` / `pointer-events: none` on hint layers so they never block guessing.
- Reattach layers after map re-render; remove them in `cleanupEntry()` and on round reset.
- Never use CSS filters or masks for glow effects; use gradients, box-shadows, opacity, and transforms.

## Implementation Steps

1. Add case constants, rarity definitions, hint pools, coordinate formatting, distance/bearing helpers, `decodePanoId`, weighted crate selection, and round-state helpers to the pure core.
2. Export the new pure helpers through `Core` and add `tests/cases.test.mjs`.
3. Extend `parseDuelJsonEvent`/`onDuelMessage` to update `isRated`, round number, pano, and exact duel location.
4. Add `installPanoHook()` and the case visibility/lifecycle state.
5. Add `ensureCaseButton()` and inject the chest button into the native controls.
6. Build the case dialog, crate cards, band animation, rarity reveal, and hint tray.
7. Add map overlay creation/removal and map re-render rehydration.
8. Integrate reset/visibility checks into `scan()`, map attach/detach, and WebSocket updates.
9. Update README with feature behavior, crate odds, hint tiers, and ranked exclusion.
10. Bump version to `0.11.0` in the header, `VERSION`, and `package.json`.
11. Run `npm run verify`; manually verify standard, party, unranked duel, and ranked duel states.

## Verification Checklist

- Pure tests:
  - Crate odds sum to 100%.
  - Weighted selection respects rarity probabilities and deterministic RNG.
  - Hint pools skip ineligible country hints.
  - Duplicate hint types are avoided.
  - Coordinate rounding/N/S/E/W formatting.
  - Haversine distance and bearing.
  - Distance-to-border on simple square polygons.
  - Round-key reset/sessionStorage behavior.
  - Route/rank gate: standard allowed, party allowed, unranked duel allowed, ranked duel hidden, unknown duel state hidden, replay/summary hidden.
- Manual UI:
  - Chest button appears only when eligible.
  - All three crates show correct opened state.
  - Band decelerates and lands on the preselected card.
  - Every rarity has a distinct reveal.
  - Hints stack, toggle, remove, and clear correctly.
  - The mythic pin remains visible without auto-submitting.
  - New round clears crates, chips, and overlays.
  - No console errors; no forbidden CSS effects.

## Risks / Notes

- The current environment has no live ranked/party session, so live gating must be verified by the user. The captured unranked-duel HAR confirms `duel.state.options.isRated`, exact round panoramas, and round numbers.
- `getPosition()` can be delayed; keep the button hidden until a valid position exists and use `StreetViewService` only as a fallback.
- Native controls may be re-rendered; injection must remain idempotent.
- If Google Maps overlays do not render correctly on the custom guess map, fall back to `OverlayView` for all hint layers.
