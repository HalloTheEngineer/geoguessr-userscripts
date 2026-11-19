# Geographic Hint Atlas

GeoGamble cases use a data-derived geographic hint atlas. It deliberately avoids Google/Street View-dependent visual metas: no driving side, coverage generation, sun direction, camera/car details, road-line colors, bollards, poles, signs, plates, or architecture.

## Families

```text
Position
├─ Hemisphere
├─ Longitude Half
└─ Tropical / Non-Tropical

Environment
├─ Coastal / Landlocked
├─ Island / Mainland
├─ Continent
├─ Climate Group
├─ Elevation Band
└─ Population Density Band

Society
├─ UN Subregion
├─ Script Family
├─ Language Family
├─ Currency
└─ Internet TLD

Identity
├─ Country Name
├─ Country Flag
├─ Country Outline
└─ Country ISO Code

Precision
├─ Nearest Major City
├─ 50 km Radius
├─ 20 km Radius
├─ 1° Coordinate Cell
├─ 0.05° Coordinate Cell
└─ Exact Pin
```

## Rarity

| Rarity | Role |
| --- | --- |
| Common | Broad planetary filters |
| Uncommon | Continental and environmental context |
| Rare | Regional and cultural filters |
| Epic | Country identification |
| Legendary | Near-location narrowing |
| Mythic | Exact location |

Continent and UN-subregion hints are visualized by highlighting their member countries on the map. Country identity intentionally lives at Epic. Driving side and coverage-generation hints are excluded even though they are powerful, because they are trivially visible in the panorama.

Script Family and Language Family never name a specific language. They are emitted only when the script or family is shared by at least four countries in the dataset; otherwise that trait is omitted so a unique script/family cannot identify the country.

## Map Visualizations

- **Hemisphere** fills the northern or southern half of the map.
- **Longitude Half** fills the eastern or western half.
- **Tropical or Not** fills the tropical band, or both exact non-tropical bands. Bands are drawn as longitude segments so they render reliably on Google Maps.
- **Climate Group** fills matching climate-grid regions.
- **Landlocked/Coastal** and **Island/Mainland** highlight every matching country in either state. Coastal and mainland are broad by nature and become more useful in composite intersections.
- **Elevation Band**, **Population Density**, **Script Family**, and **Language Family** highlight all countries sharing the trait.
- **50 km / 20 km Radius** uses a randomly offset circle with no center marker. The target is 55–78% of the radius from the circle center, so it is never marked at the center.
- **1° / 0.05° Coordinate Cells** draw the coordinate cell containing the target instead of centering on it.

## Area Intersections

When more than one area clue is active, the map shows only the intersection. Country traits (continent, subregion, script, language, elevation, density, landlocked, island, country outline), global bands, climate cells, radius circles, and coordinate cells all participate. The result uses one blended composite color. If no area satisfies every active clue, the map is blank. Nearest-city markers and exact pins remain independent.

Country, band, climate-cell, outline, and coordinate-cell intersections are computed once in geographic coordinates and rendered as native Google Maps polygons. Only composites that include a radius circle use a canvas; that canvas redraws on map `idle`, hides during zoom or drag, uses a reduced pixel ratio, and never reads back the full canvas. Bands are split into 90° longitude segments so world-spanning and antimeridian rectangles render reliably.

Country identity remains text-only so a highlight cannot reveal the exact country. TLD and currency remain text-only because those values can be unique to one country.

## Crate Focus

| Crate | Families | Rarity bias |
| --- | --- | --- |
| Scout | Position, Environment | Common-heavy |
| Surveyor | Environment, Society | Uncommon/Rare |
| Relic | Society, Identity, Precision | Rare/Epic, small Legendary/Mythic chance |

The picker prefers a family not already present in the active hint set, then falls back to the normal rarity pool.

## Data

- **Natural Earth** — country geometry, continent, and major-city points. Public domain.
- **mledoze/countries** — subregion, landlocked/borders, languages, currencies, and TLDs. ODbL 1.0.
- **CIA World Factbook** — mean country elevation. Public domain.
- **Köppen–Geiger** — 2° climate grid derived from the `koppen-climate-lookup` dataset. ISC package; data citation: Kottek et al. 2006 and Rubel et al. 2017.
- **Language trait mapping** — local language-to-script/family table in `scripts/data/language-traits.json`.

Generated files are committed so the release build is offline and self-contained:

- `src/core/country-traits.generated.js`
- `src/core/climate-grid.generated.js`
- `src/core/cities.generated.js`
- `src/core/hint-data-sources.generated.js`

Regenerate with:

```bash
npm run hint-data
```

No hint data is fetched at runtime.
