import assert from "node:assert/strict";
import test from "node:test";
import { loadCore, seededRandom } from "./helpers.mjs";

const { Core, CONFIG, COUNTRY_DATA } = loadCore();
const { settings, index } = Core.resolveConfig(CONFIG, COUNTRY_DATA);

const OFF_CENTRE_COUNTRIES = [
  "ae",
  "cu",
  "gr",
  "gn",
  "ht",
  "hr",
  "il",
  "jp",
  "la",
  "no",
  "ph",
  "vn",
];

function normalizedDistance(point, center, polygon) {
  const halfWidth = (polygon.maxLng - polygon.minLng) / 2 || 1;
  const halfHeight = (polygon.maxLat - polygon.minLat) / 2 || 1;
  const dx = (point.lng - center.lng) / halfWidth;
  const dy = (point.lat - center.lat) / halfHeight;
  return Math.sqrt(dx * dx + dy * dy);
}

function samplePoints(country, count, centerBias, seed = 1234) {
  const rng = seededRandom(seed);
  const points = [];
  for (let sample = 0; sample < count; sample++) {
    const point = Core.randomPointInCountry(country, rng, centerBias);
    if (point) points.push(point);
  }
  return points;
}

test("center bias default and clamping", () => {
  assert.equal(CONFIG.centerBias, 0);
  assert.equal(settings.centerBias, 0);
  const clamped = Core.resolveConfig({ ...CONFIG, centerBias: 5 }, COUNTRY_DATA);
  const negative = Core.resolveConfig({ ...CONFIG, centerBias: -5 }, COUNTRY_DATA);
  const invalid = Core.resolveConfig({ ...CONFIG, centerBias: "bad" }, COUNTRY_DATA);
  assert.equal(clamped.settings.centerBias, 1);
  assert.equal(negative.settings.centerBias, 0);
  assert.equal(invalid.settings.centerBias, 0);
});

test("center bias zero keeps deterministic sampling unchanged", () => {
  for (const iso of ["fr", "us", "no", "ru", "fj"]) {
    const country = index.byIso.get(iso);
    const first = Core.randomPointInCountry(country, seededRandom(77), 0);
    const second = Core.randomPointInCountry(country, seededRandom(77));
    assert.deepEqual(first, second);
  }
});

test("mainOnly heatmap centres stay inside their main polygon", () => {
  for (const iso of ["fr", "us", "no", "ru", "fj", ...OFF_CENTRE_COUNTRIES]) {
    const country = index.byIso.get(iso);
    const main = Core.mainPolygon(country);
    const center = Core.polygonCenter(main);
    assert.ok(center, `${iso} has no center`);
    assert.ok(
      Core.polygonContains(center.lat, center.lng, main.rings),
      `${iso} center outside main polygon`,
    );
  }
});

test("center heat weight is flat at zero and falls off with distance and bias", () => {
  assert.equal(Core.centerHeatWeight(0, 0), 1);
  assert.equal(Core.centerHeatWeight(1, 0), 1);
  assert.equal(Core.centerHeatWeight(0, 0.5), 1);
  assert.ok(Math.abs(Core.centerHeatWeight(1, 1) - Math.exp(-12)) < 1e-12);
  assert.ok(Math.abs(Core.centerHeatWeight(1, 0.5) - Math.exp(-6)) < 1e-12);
  const near = Core.centerHeatWeight(0.2, 0.7);
  const mid = Core.centerHeatWeight(0.6, 0.7);
  const far = Core.centerHeatWeight(1, 0.7);
  assert.ok(near > mid && mid > far);
  assert.ok(Core.centerHeatWeight(0.6, 0.9) < Core.centerHeatWeight(0.6, 0.3));
});

test("center bias concentrates picks and only snaps at 1", () => {
  const country = makeCountry([boxRing(0, 0, 10, 10)]);
  const center = Core.polygonCenter(Core.mainPolygon(country));
  const meanDistance = (bias, seed) => {
    const rng = seededRandom(seed);
    let total = 0;
    for (let sample = 0; sample < 600; sample++) {
      const point = Core.randomPointInCountry(country, rng, bias);
      assert.ok(Core.polygonContains(point.lat, point.lng, country.polygons[0].rings));
      total += Math.hypot((point.lat - center.lat) / 5, (point.lng - center.lng) / 5);
    }
    return total / 600;
  };
  const flat = meanDistance(0, 101);
  const low = meanDistance(0.25, 102);
  const mid = meanDistance(0.5, 103);
  const high = meanDistance(0.9, 104);
  assert.ok(flat > low && low > mid && mid > high, `${flat} ${low} ${mid} ${high}`);
  assert.ok(flat > 0.7, `expected broad picks at bias 0, got mean ${flat}`);
  assert.ok(high < 0.5, `expected centered picks at bias 0.9, got mean ${high}`);
  const rng = seededRandom(105);
  const points = Array.from({ length: 80 }, () => Core.randomPointInCountry(country, rng, 1));
  assert.ok(points.every((point) => point.lat === center.lat && point.lng === center.lng));
});

test("bias 1 always returns the exact centre", () => {
  for (const iso of ["fr", "us", "id", "ph", "gr"]) {
    const country = index.byIso.get(iso);
    const center =
      country.mainOnly === false
        ? Core.countryCenter(country)
        : Core.polygonCenter(Core.mainPolygon(country));
    for (const seed of [3, 31, 77, 123456]) {
      assert.deepEqual(
        Core.randomPointInCountry(country, seededRandom(seed), 1),
        center,
        `${iso} should snap at bias 1`,
      );
      assert.deepEqual(
        Core.randomPointInCountry(country, seededRandom(seed), 2),
        center,
        `${iso} should clamp to 1`,
      );
    }
    assert.equal(Core.shouldSkipAnimation(1), true);
  }
});

test("heatmap keeps every polygon eligible", () => {
  const country = Core.countryMeta({
    iso: "zz",
    name: "Testland",
    mainOnly: true,
    polygons: [[boxRing(0, 0, 10, 10)], [boxRing(10, 0, 14, 10)]],
  });
  const rng = seededRandom(4242);
  let outsideMain = 0;
  for (let sample = 0; sample < 400; sample++) {
    const point = Core.randomPointInCountry(country, rng, 0.25);
    assert.ok(
      country.polygons.some((polygon) => Core.polygonContains(point.lat, point.lng, polygon.rings)),
    );
    if (!Core.polygonContains(point.lat, point.lng, country.polygons[0].rings)) outsideMain++;
  }
  assert.ok(outsideMain > 0, "expected some heatmap picks outside the main polygon");
});

test("higher center bias pulls samples toward the center", () => {
  const country = index.byIso.get("us");
  const main = Core.mainPolygon(country);
  const center = Core.polygonCenter(main);
  for (const [lower, higher] of [[0.2, 0.8]]) {
    const lowerMean =
      samplePoints(country, 120, lower).reduce(
        (sum, point) => sum + normalizedDistance(point, center, main),
        0,
      ) / 120;
    const higherMean =
      samplePoints(country, 120, higher).reduce(
        (sum, point) => sum + normalizedDistance(point, center, main),
        0,
      ) / 120;
    assert.ok(
      higherMean < lowerMean,
      `expected higher bias nearer centre: ${higherMean} >= ${lowerMean}`,
    );
  }
});

test("animation points honour center bias", () => {
  const country = index.byIso.get("us");
  const main = Core.mainPolygon(country);
  const center = Core.polygonCenter(main);
  const points = Core.buildAnimationPoints(country, 12, seededRandom(9), 0.5);
  assert.equal(points.length, 12);
  for (const point of points) {
    assert.ok(
      country.polygons.some((polygon) => Core.polygonContains(point.lat, point.lng, polygon.rings)),
    );
  }
  const mean =
    points.reduce((sum, point) => sum + normalizedDistance(point, center, main), 0) / points.length;
  assert.ok(mean < 0.8, `expected clustered animation points, got mean ${mean}`);
});

test("every country declares a boolean mainOnly flag", () => {
  for (const country of COUNTRY_DATA) {
    assert.equal(typeof country.mainOnly, "boolean", `${country.iso} is missing mainOnly`);
  }
  assert.equal(COUNTRY_DATA.find((country) => country.iso === "id").mainOnly, false);
  assert.equal(COUNTRY_DATA.find((country) => country.iso === "ph").mainOnly, false);
  assert.equal(COUNTRY_DATA.find((country) => country.iso === "gr").mainOnly, false);
});

function boxRing(minLng, minLat, maxLng, maxLat) {
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
}

function makeCountry(rings, mainOnly = true) {
  return Core.countryMeta({
    iso: "zz",
    name: "Testland",
    mainOnly,
    polygons: rings.map((ring) => [ring]),
  });
}

test("countryCenter is the midpoint of the combined bounding box", () => {
  const country = makeCountry([boxRing(0, 0, 10, 10), boxRing(20, 40, 30, 50)], false);
  assert.deepEqual(Core.countryCenter(country), { lat: 25, lng: 15 });
  assert.deepEqual(country.span, { minLat: 0, maxLat: 50, minLng: 0, maxLng: 30 });
});

test("countryCenter stays mid-sea when the midpoint misses land", () => {
  const country = makeCountry([boxRing(0, 0, 10, 10), boxRing(20, 40, 30, 50)], false);
  const center = Core.countryCenter(country);
  assert.ok(
    !country.polygons.some((polygon) =>
      Core.polygonContains(center.lat, center.lng, polygon.rings),
    ),
  );
});

test("countryCenter spans the antimeridian", () => {
  const country = makeCountry([boxRing(177, 0, 180, 2), boxRing(-180, 0, -178, 1)], false);
  assert.deepEqual(Core.countryCenter(country), { lat: 1, lng: 179.5 });
});

test("mainOnly false uses the spanning centre as a heatmap", () => {
  const country = index.byIso.get("id");
  const center = Core.countryCenter(country);
  assert.equal(country.mainOnly, false);
  assert.equal(Math.round(center.lat * 100) / 100, -2.44);
  assert.equal(Math.round(center.lng * 100) / 100, 115.01);
  assert.ok(
    country.polygons.some((polygon) => Core.polygonContains(center.lat, center.lng, polygon.rings)),
    "Indonesia's post-exclusion spanning centre should land on a remaining polygon",
  );
  const halfLat = (country.span.maxLat - country.span.minLat) / 2;
  const halfLng = (country.span.maxLng - country.span.minLng) / 2;
  const meanDistance = (bias, seed) => {
    const rng = seededRandom(seed);
    let total = 0;
    for (let sample = 0; sample < 300; sample++) {
      const point = Core.randomPointInCountry(country, rng, bias);
      assert.ok(
        country.polygons.some((polygon) =>
          Core.polygonContains(point.lat, point.lng, polygon.rings),
        ),
      );
      total += Math.hypot((point.lat - center.lat) / halfLat, (point.lng - center.lng) / halfLng);
    }
    return total / 300;
  };
  assert.ok(meanDistance(1, 22) < meanDistance(0.5, 21));
  const rng = seededRandom(23);
  const points = Array.from({ length: 60 }, () => Core.randomPointInCountry(country, rng, 1));
  assert.ok(points.every((point) => point.lat === center.lat && point.lng === center.lng));
});

test("mainOnly false samples every island at low bias", () => {
  const country = index.byIso.get("id");
  const main = Core.mainPolygon(country);
  const points = samplePoints(country, 300, 0.1, 4242);
  let outsideMain = 0;
  for (const point of points) {
    assert.ok(
      country.polygons.some((polygon) => Core.polygonContains(point.lat, point.lng, polygon.rings)),
      `point outside Indonesia ${JSON.stringify(point)}`,
    );
    if (!Core.polygonContains(point.lat, point.lng, main.rings)) outsideMain++;
  }
  assert.ok(outsideMain > 0, "expected some samples outside the main polygon");
});
