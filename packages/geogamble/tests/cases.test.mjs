import assert from "node:assert/strict";
import test from "node:test";
import { loadCore, seededRandom } from "./helpers.mjs";

const { Core, COUNTRY_DATA } = loadCore();
const index = Core.buildCountryIndex(COUNTRY_DATA, {
  enabledCountries: "all",
  excludeCountries: [],
});
const paris = { lat: 48.8566, lng: 2.3522, country: index.byIso.get("fr") };
const ocean = { lat: 0, lng: -140, country: null };

function areaSquare(size = 10) {
  return {
    polygons: [
      {
        rings: [
          [
            [0, 0],
            [size, 0],
            [size, size],
            [0, size],
            [0, 0],
          ],
        ],
      },
    ],
  };
}

test("coordinate formatting and distance helpers are stable", () => {
  assert.equal(Core.formatCoordinate(48.8566, "lat", 0), "49°N");
  assert.equal(Core.formatCoordinate(-33.9, "lat", 1), "33.9°S");
  assert.equal(Core.formatCoordinate(-70.6, "lng", 0), "71°W");
  assert.equal(Core.formatCoordinates(48.8566, 2.3522, 2), "48.86°N, 2.35°E");
  assert.ok(Math.abs(Core.haversineKm(0, 0, 0, 1) - 111.195) < 0.1);
  assert.ok(Math.abs(Core.bearingDeg(0, 0, 0, 1) - 90) < 0.001);
  assert.equal(Core.compassDirection(0), "north");
  assert.equal(Core.compassDirection(90), "east");
  assert.equal(Core.compassDirection(225), "southwest");
});

test("border distance uses polygon rings and handles the interior", () => {
  const square = areaSquare(10);
  const center = Core.distanceToBorderKm(5, 5, square);
  const edge = Core.distanceToBorderKm(1, 5, square);
  const corner = Core.distanceToBorderKm(0, 0, square);
  assert.ok(center > 500 && center < 600, String(center));
  assert.ok(edge < center);
  assert.ok(corner < 1);
  assert.equal(Core.distanceToBorderKm(5, 5, null), Infinity);
});

test("pano ids decode only from printable hex payloads", () => {
  const pano = "ABCDEFGH";
  const encoded = Buffer.from(pano, "ascii").toString("hex");
  assert.equal(Core.decodePanoId(encoded), pano);
  assert.equal(Core.decodePanoId(encoded.toUpperCase()), pano);
  assert.equal(Core.decodePanoId("not-a-pano"), "not-a-pano");
  assert.equal(Core.decodePanoId("abc"), "abc");
  assert.equal(Core.decodePanoId(""), "");
  assert.equal(Core.decodePanoId(null), "");
});

test("hint builders cover every rarity and country requirement", () => {
  const expectedRarities = {
    common: ["hemisphere", "longitude-half", "tropical-band", "landlocked", "island-nation"],
    uncommon: ["continent", "climate-group", "elevation-band", "population-density"],
    rare: ["subregion", "script-family", "language-family", "currency", "tld"],
    epic: ["country-name", "country-flag", "country-outline", "country-iso"],
    legendary: ["nearest-city", "radius-50", "radius-20", "coords-01", "coords-005"],
    mythic: ["exact"],
  };
  for (const [rarity, ids] of Object.entries(expectedRarities)) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const hint = Core.pickCaseHint(rarity, paris, new Set(), seededRandom(attempt + 1));
      assert.ok(hint, `${rarity} produced a hint`);
      assert.equal(hint.rarity, rarity);
      assert.ok(ids.includes(hint.id), `${rarity} returned ${hint.id}`);
      assert.ok(hint.title.length > 0);
      assert.ok(hint.detail.length > 0);
    }
  }
  assert.equal(Core.pickCaseHint("mythic", ocean, new Set(), () => 0).id, "exact");
});

test("country hints are omitted over the ocean and geometry hints remain", () => {
  const countryHint = Core.CASE_HINT_TYPES?.find((type) => type.id === "country-name");
  assert.ok(countryHint);
  assert.equal(Core.caseHintEligible(countryHint, ocean), false);
  const hint = Core.pickCaseHint("common", ocean, new Set(), () => 0);
  assert.ok(hint);
  assert.ok(["hemisphere", "longitude-half", "tropical-band"].includes(hint.id));
  const usedCommon = new Set(["hemisphere", "longitude-half"]);
  const fallback = Core.pickCaseHint("common", ocean, usedCommon, () => 0);
  assert.equal(fallback.id, "tropical-band");
});

test("geographic atlas covers every family and excludes visual metas", () => {
  const types = Core.CASE_HINT_TYPES;
  assert.ok(types.length >= 20);
  assert.equal(new Set(types.map((type) => type.id)).size, types.length);
  for (const type of types) {
    assert.ok(
      ["position", "environment", "society", "identity", "precision"].includes(type.family),
    );
    assert.ok(["global", "country", "local", "exact"].includes(type.scope));
    assert.ok(type.source);
  }
  const banned = new Set([
    "driving-side",
    "coverage-generation",
    "sun-direction",
    "camera-generation",
    "bollard",
    "pole",
    "road-lines",
    "license-plate",
  ]);
  for (const type of types) assert.equal(banned.has(type.id), false);
  const families = new Set(types.map((type) => type.family));
  assert.deepEqual([...families].sort(), [
    "environment",
    "identity",
    "position",
    "precision",
    "society",
  ]);
  assert.equal(Core.countryTraits("fr").subregion, "Western Europe");
  assert.equal(Core.countryTraits("fr").script, "Latin");
  assert.equal(Core.countryTraits("fr").currency, "EUR");
  assert.equal(Core.climateAt(48.8566, 2.3522).label, "Oceanic");
  assert.equal(Core.climateAt(0, -140), null);
  assert.equal(Core.nearestMajorCity(48.8566, 2.3522).name, "Paris");
  assert.equal(Core.elevationBand(375).id, "upland");
  assert.equal(Core.densityBand(122).id, "dense");
  assert.ok(Core.HINT_DATA_SOURCES.sources.length >= 3);
  for (const country of COUNTRY_DATA)
    assert.ok(Core.countryTraits(country.iso), `missing traits for ${country.iso}`);
});

test("atlas hints carry family metadata through snapshots", () => {
  const hint = Core.buildCaseHint(
    {
      id: "climate-group",
      family: "environment",
      rarity: "uncommon",
      label: "Climate Group",
      requiresCountry: false,
      scope: "local",
      source: "climateGrid",
    },
    paris,
  );
  assert.ok(hint);
  assert.equal(hint.family, "environment");
  assert.equal(hint.scope, "local");
  const snapshot = Core.normalizeCaseSnapshot({
    roundKey: "std:/game/x:pano",
    hints: [hint],
    opened: [],
    used: [],
  });
  assert.equal(snapshot.hints[0].family, "environment");
});

test("script and language hints stay broad and do not name a specific language", () => {
  const scriptType = Core.CASE_HINT_TYPES.find((type) => type.id === "script-family");
  const languageType = Core.CASE_HINT_TYPES.find((type) => type.id === "language-family");
  const scriptHint = Core.buildCaseHint(scriptType, paris);
  const languageHint = Core.buildCaseHint(languageType, paris);
  assert.ok(scriptHint);
  assert.ok(languageHint);
  assert.doesNotMatch(scriptHint.detail, /French/i);
  assert.doesNotMatch(languageHint.detail, /French/i);
  assert.equal(Core.countryTraits("bo").script, "Latin");
  assert.equal(Core.countryTraits("bo").languageFamily, "Romance");
  assert.equal(Core.countryTraits("am").script, null);
  assert.equal(Core.countryTraits("am").languageFamily, null);
});

test("crate outcomes are deterministic, valid, and non-repeating", () => {
  const used = new Set();
  for (const crateId of ["scout", "surveyor", "relic"]) {
    const outcome = Core.pickCaseCrateOutcome(crateId, paris, used, seededRandom(42));
    assert.ok(outcome);
    assert.equal(outcome.crateId, crateId);
    assert.ok(Core.caseRarity(outcome.rolledRarity));
    assert.ok(Core.caseRarity(outcome.hint.rarity));
    assert.ok(!used.has(outcome.hint.id));
    used.add(outcome.hint.id);
  }
  const repeatA = Core.pickCaseCrateOutcome("relic", paris, new Set(), seededRandom(42));
  const repeatB = Core.pickCaseCrateOutcome("relic", paris, new Set(), seededRandom(42));
  assert.equal(repeatA.rolledRarity, repeatB.rolledRarity);
  assert.equal(repeatA.hint.id, repeatB.hint.id);
});

test("routes allow only standard, party, and unranked duel games", () => {
  assert.equal(Core.caseModeAllowed({ pathname: "/game/abc" }), true);
  assert.equal(Core.caseModeAllowed({ pathname: "/game/abc/" }), true);
  assert.equal(Core.caseModeAllowed({ pathname: "/game/abc/replay" }), false);
  assert.equal(Core.caseModeAllowed({ pathname: "/game/abc/summary" }), false);
  assert.equal(Core.caseModeAllowed({ pathname: "/duels/x", isRated: false }), true);
  assert.equal(Core.caseModeAllowed({ pathname: "/duels/x", isRated: true }), false);
  assert.equal(Core.caseModeAllowed({ pathname: "/duels/x", isRated: null }), false);
  assert.equal(Core.caseModeAllowed({ pathname: "/team-duels/x", isRated: false }), true);
  assert.equal(Core.caseModeAllowed({ pathname: "/party/x", isRated: null }), true);
  assert.equal(Core.caseModeAllowed({ pathname: "/party/x", isRated: false }), true);
  assert.equal(Core.caseModeAllowed({ pathname: "/party/x", isRated: true }), false);
  assert.equal(Core.caseModeAllowed({ pathname: "/game/abc", hasLocation: false }), false);
  assert.equal(Core.caseModeAllowed({ pathname: "/" }), false);
  assert.equal(Core.caseModeAllowed({ pathname: "/duels/x/spectate", isRated: false }), false);
});

test("round keys distinguish duel and standard rounds", () => {
  assert.equal(
    Core.caseRoundKey({ pathname: "/duels/x", gameId: "abc", roundNumber: 3, panoId: "pano" }),
    "duel:abc:3:pano",
  );
  assert.equal(
    Core.caseRoundKey({
      pathname: "/game/x?ref=1",
      gameId: null,
      roundNumber: null,
      panoId: "pano",
    }),
    "std:/game/x:pano",
  );
  assert.equal(Core.caseRoundKey({ pathname: "/game/x" }), null);
  assert.equal(
    Core.caseRoundKey({ pathname: "/duels/x", gameId: "abc", roundNumber: 0, panoId: "p" }),
    "std:/duels/x:p",
  );
});

test("stored case snapshots are validated and bounded", () => {
  const hint = Core.buildCaseHint(
    {
      id: "hemisphere",
      rarity: "common",
      label: "Hemisphere",
      requiresCountry: false,
    },
    paris,
  );
  const snapshot = Core.normalizeCaseSnapshot({
    roundKey: "duel:abc:1:pano",
    opened: ["scout", "scout", "bogus"],
    hints: [hint, hint, { ...hint, id: "exact" }, { ...hint, id: "coords-01" }, hint],
  });
  assert.deepEqual(snapshot.opened, ["scout"]);
  assert.equal(snapshot.hints.length, 3);
  assert.deepEqual(
    snapshot.hints.map((entry) => entry.id),
    ["hemisphere", "exact", "coords-01"],
  );
  assert.equal(snapshot.hints[1].rarity, "mythic");
  assert.equal(Core.normalizeCaseSnapshot(null), null);
  assert.equal(Core.normalizeCaseSnapshot({ hints: [] }), null);
  assert.equal(Core.countryFlagEmoji("fr"), "🇫🇷");
  assert.equal(Core.normalizeCaseSnapshot({ roundKey: "x", hints: [{}] }).hints.length, 0);
});

test("radius and coordinate hints do not center the target", () => {
  const radiusType = Core.CASE_HINT_TYPES.find((type) => type.id === "radius-50");
  const radiusHint = Core.buildCaseHint(radiusType, paris);
  assert.equal(radiusHint.overlay, "circle");
  assert.equal(radiusHint.payload.offset, true);
  const offsetKm = Core.haversineKm(
    paris.lat,
    paris.lng,
    radiusHint.payload.lat,
    radiusHint.payload.lng,
  );
  assert.ok(offsetKm > 24 && offsetKm < 40, String(offsetKm));
  const radiusBounds = Core.caseHintBounds(radiusHint, index);
  assert.ok(radiusBounds.north > paris.lat && radiusBounds.south < paris.lat);
  assert.ok(radiusBounds.west < paris.lng && radiusBounds.east > paris.lng);

  const coordType = Core.CASE_HINT_TYPES.find((type) => type.id === "coords-01");
  const coordHint = Core.buildCaseHint(coordType, paris);
  assert.equal(coordHint.overlay, "cell");
  assert.ok(coordHint.payload.north > paris.lat && coordHint.payload.south < paris.lat);
  assert.ok(coordHint.payload.east > paris.lng && coordHint.payload.west < paris.lng);
  assert.ok(Math.abs(coordHint.payload.north - coordHint.payload.south - 1) < 1e-9);
  assert.equal(coordHint.title, "1° Coordinate Cell");
});

test("case snapshots use a new storage generation and ignore old centered hints", () => {
  assert.equal(Core.CASE_STORAGE_PREFIX, "geogamble.cases.v3:");
  assert.ok(Core.CASE_LEGACY_STORAGE_PREFIXES.includes("geogamble.cases.v2:"));
});

test("multiple area clues are intersected by country and band", () => {
  const types = Object.fromEntries(Core.CASE_HINT_TYPES.map((type) => [type.id, type]));
  const europe = Core.buildCaseHint(types.continent, paris);
  const latin = Core.buildCaseHint(types["script-family"], paris);
  const combined = Core.caseAreaFilterPlan([europe, latin], index);
  assert.equal(combined.composite, true);
  assert.equal(combined.empty, false);
  assert.equal(combined.layers.length, 1);
  assert.ok(combined.countries.some((country) => country.iso === "fr"));
  assert.ok(combined.countries.some((country) => country.iso === "de"));
  assert.ok(!combined.countries.some((country) => country.iso === "gr"));
  assert.ok(
    combined.countries.every((country) => Core.countryTraits(country.iso).continent === "Europe"),
  );
  assert.ok(
    combined.countries.every((country) => Core.countryTraits(country.iso).script === "Latin"),
  );

  const northern = Core.buildCaseHint(types.hemisphere, paris);
  const banded = Core.caseAreaFilterPlan([europe, latin, northern], index);
  assert.equal(banded.layers.length, 2);
  assert.ok(banded.bounds.south >= 0);

  const antarctica = Core.buildCaseHint(types.continent, {
    lat: -80,
    lng: 0,
    country: index.byIso.get("aq"),
  });
  const empty = Core.caseAreaFilterPlan([antarctica, latin], index);
  assert.equal(empty.composite, true);
  assert.equal(empty.empty, true);
  assert.equal(empty.layers.length, 0);
  assert.equal(empty.bounds, null);
});

test("bands split into render-safe longitude segments", () => {
  const types = Object.fromEntries(Core.CASE_HINT_TYPES.map((type) => [type.id, type]));
  const tropical = Core.buildCaseHint(types["tropical-band"], {
    lat: 0,
    lng: 2.3522,
    country: paris.country,
  });
  const outside = Core.buildCaseHint(types["tropical-band"], paris);
  const northern = Core.buildCaseHint(types.hemisphere, paris);
  const east = Core.buildCaseHint(types["longitude-half"], paris);
  assert.equal(Core.caseBandRects(tropical).length, 4);
  assert.equal(Core.caseBandRects(outside).length, 8);
  assert.equal(Core.caseBandRects(northern).length, 4);
  assert.equal(Core.caseBandRects(east).length, 2);
  assert.equal(
    Core.caseBandRects(tropical).every((rect) => rect.east - rect.west <= 90),
    true,
  );
  const coastal = Core.buildCaseHint(types.landlocked, paris);
  const plan = Core.caseAreaFilterPlan([tropical, coastal], index);
  assert.equal(plan.composite, true);
  assert.equal(plan.layers.length, 2);
  assert.ok(plan.bounds);
  assert.ok(plan.bounds.north <= 23.436 + 1e-9);
  assert.ok(plan.bounds.south >= -23.436 - 1e-9);
});

test("native composite geometry clips countries to bands", () => {
  const types = Object.fromEntries(Core.CASE_HINT_TYPES.map((type) => [type.id, type]));
  const tropical = Core.buildCaseHint(types["tropical-band"], {
    lat: 0,
    lng: 2.3522,
    country: paris.country,
  });
  const coastal = Core.buildCaseHint(types.landlocked, paris);
  const geometry = Core.caseCompositeGeometry([tropical, coastal], index);
  assert.equal(geometry.mode, "native");
  assert.equal(geometry.empty, false);
  assert.ok(geometry.polygons.length > 0);
  assert.ok(geometry.bounds.north <= 23.436 + 1e-9);
  assert.ok(geometry.bounds.south >= -23.436 - 1e-9);
  for (const rings of geometry.polygons) {
    for (const [lng, lat] of rings[0]) {
      assert.ok(lat <= 23.436 + 1e-6);
      assert.ok(lat >= -23.436 - 1e-6);
      assert.ok(lng >= -180 && lng <= 180);
    }
  }

  const europe = Core.buildCaseHint(types.continent, paris);
  const latin = Core.buildCaseHint(types["script-family"], paris);
  const native = Core.caseCompositeGeometry([europe, latin], index);
  assert.equal(native.mode, "native");
  assert.ok(native.polygons.length > 0);
  assert.equal(native.empty, false);

  const circle = Core.buildCaseHint(types["radius-50"], paris);
  const canvas = Core.caseCompositeGeometry([europe, circle], index);
  assert.equal(canvas.mode, "canvas");
  assert.equal(canvas.composite, true);

  const antarctica = Core.buildCaseHint(types.continent, {
    lat: -80,
    lng: 0,
    country: index.byIso.get("aq"),
  });
  const empty = Core.caseCompositeGeometry([antarctica, latin], index);
  assert.equal(empty.mode, "native");
  assert.equal(empty.empty, true);
  assert.equal(empty.polygons.length, 0);
});

test("coastal and mainland branches expose category overlays", () => {
  const types = Object.fromEntries(Core.CASE_HINT_TYPES.map((type) => [type.id, type]));
  const coastal = Core.buildCaseHint(types.landlocked, paris);
  const landlocked = Core.buildCaseHint(types.landlocked, {
    lat: 47.5,
    lng: 14.5,
    country: index.byIso.get("at"),
  });
  const mainland = Core.buildCaseHint(types["island-nation"], paris);
  const island = Core.buildCaseHint(types["island-nation"], {
    lat: -18.9,
    lng: 47.5,
    country: index.byIso.get("mg"),
  });
  for (const hint of [coastal, landlocked, mainland, island]) {
    assert.equal(hint.overlay, "category");
    assert.equal(Core.caseHintHasOverlay(hint), true);
  }
  assert.equal(coastal.payload.value, false);
  assert.equal(landlocked.payload.value, true);
  assert.equal(mainland.payload.value, false);
  assert.equal(island.payload.value, true);

  const europe = Core.buildCaseHint(types.continent, paris);
  const coastalEurope = Core.caseAreaFilterPlan([europe, coastal], index);
  assert.ok(coastalEurope.countries.some((country) => country.iso === "fr"));
  assert.ok(!coastalEurope.countries.some((country) => country.iso === "ch"));
  assert.ok(!coastalEurope.countries.some((country) => country.iso === "at"));

  const mainlandEurope = Core.caseAreaFilterPlan([europe, mainland], index);
  assert.ok(mainlandEurope.countries.some((country) => country.iso === "fr"));
  assert.ok(!mainlandEurope.countries.some((country) => country.iso === "is"));
});

test("country outline participates in area intersections", () => {
  const types = Object.fromEntries(Core.CASE_HINT_TYPES.map((type) => [type.id, type]));
  const outline = Core.buildCaseHint(types["country-outline"], paris);
  const europe = Core.buildCaseHint(types.continent, paris);
  const plan = Core.caseAreaFilterPlan([outline, europe], index);
  assert.equal(plan.composite, true);
  assert.deepEqual(
    plan.countries.map((country) => country.iso),
    ["fr"],
  );
});

test("global bands and country categories expose map overlays", () => {
  const ids = [
    "hemisphere",
    "longitude-half",
    "tropical-band",
    "climate-group",
    "elevation-band",
    "population-density",
    "script-family",
    "language-family",
  ];
  for (const id of ids) {
    const type = Core.CASE_HINT_TYPES.find((candidate) => candidate.id === id);
    const hint = Core.buildCaseHint(type, paris);
    assert.ok(hint, id);
    assert.ok(hint.overlay, id);
    assert.ok(Core.caseHintHasOverlay(hint), id);
    assert.ok(Core.caseHintBounds(hint, index), id);
  }
  const hemisphere = Core.buildCaseHint(
    Core.CASE_HINT_TYPES.find((type) => type.id === "hemisphere"),
    paris,
  );
  const bounds = Core.caseHintBounds(hemisphere, index);
  assert.equal(bounds.north, 85);
  assert.equal(bounds.south, 0);
  assert.ok(Core.climateRegionsFor("Tropical").length > 0);
  const climate = Core.buildCaseHint(
    Core.CASE_HINT_TYPES.find((type) => type.id === "climate-group"),
    paris,
  );
  assert.equal(climate.overlay, "climate");
  assert.ok(Core.caseHintBounds(climate, index));
});

test("spatial hint bounds cover pins, circles, and country outlines", () => {
  const exact = Core.buildCaseHint(
    { id: "exact", rarity: "mythic", label: "Exact Location", requiresCountry: false },
    paris,
  );
  const exactBounds = Core.caseHintBounds(exact, index);
  assert.ok(exactBounds);
  assert.ok(Math.abs(exactBounds.north - paris.lat) < 0.0001);
  assert.ok(Math.abs(exactBounds.south - paris.lat) < 0.0001);
  assert.ok(Math.abs(exactBounds.east - paris.lng) < 0.0001);
  assert.ok(Math.abs(exactBounds.west - paris.lng) < 0.0001);
  assert.equal(Core.caseHintHasOverlay(exact), true);

  const circle = Core.buildCaseHint(
    { id: "radius-50", rarity: "legendary", label: "50 km Radius", requiresCountry: false },
    paris,
  );
  const circleBounds = Core.caseHintBounds(circle, index);
  assert.ok(circleBounds);
  assert.ok(circleBounds.north - circleBounds.south > 0.8);
  assert.ok(circleBounds.east - circleBounds.west > 0.8);

  const outline = Core.buildCaseHint(
    { id: "country-outline", rarity: "epic", label: "Country Outline", requiresCountry: true },
    paris,
  );
  const outlineBounds = Core.caseHintBounds(outline, index);
  assert.ok(outlineBounds);
  assert.ok(outlineBounds.north > 50 && outlineBounds.south < 43);
  assert.ok(outlineBounds.west < 0 && outlineBounds.east > 7);

  const region = Core.buildCaseHint(
    {
      id: "continent",
      family: "environment",
      rarity: "uncommon",
      label: "Continent",
      requiresCountry: true,
    },
    paris,
  );
  assert.equal(region.overlay, "region");
  const regionBounds = Core.caseHintBounds(region, index);
  assert.ok(regionBounds);
  assert.ok(regionBounds.north > 50 && regionBounds.south < 43);

  const textHint = Core.buildCaseHint(
    { id: "tld", family: "society", rarity: "rare", label: "Internet TLD", requiresCountry: true },
    paris,
  );
  assert.equal(Core.caseHintHasOverlay(textHint), false);
  assert.equal(Core.caseHintBounds(textHint, index), null);
});

test("duel state event exposes ranked mode and exact current round", () => {
  const event = {
    code: "DuelNewRound",
    gameId: "6adb565aec0f96a4c98a464f",
    duel: {
      state: {
        currentRoundNumber: 2,
        rounds: [
          { roundNumber: 1, panorama: { panoId: "4142434445464748", lat: 1, lng: 2 } },
          { roundNumber: 2, panorama: { panoId: "494a4b4c4d4e4f50", lat: 12.5, lng: -15.5 } },
        ],
        options: { isRated: false, isTeamDuels: true, gameContext: "party" },
      },
    },
  };
  const parsed = Core.parseDuelStateEvent(JSON.stringify(event));
  assert.equal(parsed.code, "DuelNewRound");
  assert.equal(parsed.gameId, "6adb565aec0f96a4c98a464f");
  assert.equal(parsed.roundNumber, 2);
  assert.equal(parsed.panoId, "IJKLMNOP");
  assert.equal(parsed.lat, 12.5);
  assert.equal(parsed.lng, -15.5);
  assert.equal(parsed.isRated, false);
  assert.equal(parsed.isTeamDuels, true);
  assert.equal(parsed.gameContext, "party");
  assert.equal(parsed.hasLocation, true);

  const fallback = Core.parseDuelStateEvent(
    JSON.stringify({
      code: "DuelStarted",
      duel: { state: { currentRoundNumber: 1, options: { isRated: true } } },
    }),
  );
  assert.equal(fallback.isRated, true);
  assert.equal(fallback.hasLocation, false);
  assert.equal(Core.parseDuelStateEvent(JSON.stringify({ code: "HeartBeat" })), null);
  assert.equal(Core.parseDuelStateEvent("bad"), null);
});

test("crate weights are complete and outcomes follow their odds", () => {
  for (const crate of Core.CASE_CRATES) {
    const total = Object.values(crate.weights).reduce((sum, weight) => sum + weight, 0);
    assert.equal(total, 100, `${crate.id} weights total 100`);
  }
  const counts = new Map();
  const rng = seededRandom(20261024);
  const draws = 4000;
  for (let index = 0; index < draws; index++) {
    const outcome = Core.pickCaseCrateOutcome("scout", paris, new Set(), rng);
    counts.set(outcome.rolledRarity, (counts.get(outcome.rolledRarity) || 0) + 1);
  }
  assert.ok(Math.abs((counts.get("common") || 0) / draws - 0.6) < 0.035);
  assert.ok(Math.abs((counts.get("uncommon") || 0) / draws - 0.3) < 0.035);
  assert.ok(Math.abs((counts.get("rare") || 0) / draws - 0.09) < 0.025);
  assert.ok(Math.abs((counts.get("epic") || 0) / draws - 0.01) < 0.01);
  assert.equal(counts.get("legendary") || 0, 0);
});

test("removed hints stay in the used set", () => {
  const snapshot = Core.normalizeCaseSnapshot({
    roundKey: "std:/game/x:pano",
    opened: ["scout"],
    hints: [],
    used: ["hemisphere", "exact", "hemisphere", "invalid"],
  });
  assert.deepEqual(snapshot.used, ["hemisphere", "exact"]);
  const hint = Core.buildCaseHint(
    { id: "exact", rarity: "mythic", label: "Exact Location", requiresCountry: false },
    paris,
  );
  const withHint = Core.normalizeCaseSnapshot({
    roundKey: "std:/game/x:pano",
    hints: [hint],
  });
  assert.deepEqual(withHint.used, ["exact"]);
});
