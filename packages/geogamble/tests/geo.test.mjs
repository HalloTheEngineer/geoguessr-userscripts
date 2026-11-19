import assert from "node:assert/strict";
import test from "node:test";
import { loadCore, seededRandom } from "./helpers.mjs";

const { Core, CONFIG, COUNTRY_DATA } = loadCore();
const { index } = Core.resolveConfig(CONFIG, COUNTRY_DATA);

test("country data is complete and valid", () => {
  assert.ok(COUNTRY_DATA.length >= 170);
  const seen = new Set();
  for (const country of COUNTRY_DATA) {
    assert.match(country.iso, /^[a-z]{2}$/);
    assert.ok(country.name.length > 0);
    assert.ok(!seen.has(country.iso), `duplicate ISO ${country.iso}`);
    seen.add(country.iso);
    assert.ok(country.polygons.length > 0, `${country.iso} has no polygons`);
    for (const polygon of country.polygons) {
      assert.ok(polygon.length > 0);
      for (const ring of polygon) {
        assert.ok(ring.length >= 4);
        for (const [lng, lat] of ring) {
          assert.ok(Number.isFinite(lng) && lng >= -180 && lng <= 180);
          assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90);
        }
      }
    }
  }
  for (const iso of ["fr", "no", "xk", "us", "ru", "fj"]) {
    assert.ok(index.byIso.has(iso), `missing ${iso}`);
  }
  assert.equal(index.selected.length, COUNTRY_DATA.length);
  assert.deepEqual(index.unknown, []);
});

test("point lookup handles countries, ocean, enclaves, and holes", () => {
  assert.equal(Core.findCountryAt(48.8566, 2.3522, index)?.country.iso, "fr");
  assert.equal(Core.findCountryAt(0, -30, index), null);
  assert.equal(Core.findCountryAt(-29.6, 28.2, index)?.country.iso, "ls");
  assert.equal(Core.findCountryAt(-26.2, 28.0, index)?.country.iso, "za");

  const southAfrica = index.byIso.get("za");
  assert.equal(southAfrica.polygons[0].rings.length, 2);
  assert.equal(Core.polygonContains(-29.6, 28.2, southAfrica.polygons[0].rings), false);
});

test("disputed territories without ISO codes are not merged into neighbours", () => {
  assert.notEqual(Core.findCountryAt(35.2, 33.3, index)?.country.iso, "cn");
  assert.notEqual(Core.findCountryAt(9.5, 46.0, index)?.country.iso, "sl");
  assert.equal(index.byIso.get("cn").polygons.length, 2);
  assert.equal(index.byIso.get("sl").polygons.length, 1);
});

test("ring area unwraps the antimeridian", () => {
  const ring = [
    [179, 0],
    [-179, 0],
    [-179, 1],
    [179, 1],
    [179, 0],
  ];
  const area = Core.ringArea(ring);
  assert.ok(area > 1.9 && area < 2.1, `unexpected area ${area}`);
});

test("point lookup handles antimeridian longitudes", () => {
  const fiji = index.byIso.get("fj");
  const polygon = fiji.polygons.find((item) => item.maxLng > 170 || item.minLng < -170);
  assert.ok(polygon, "expected a Fiji polygon near the antimeridian");
  const rng = seededRandom(42);
  let point = null;
  for (let attempt = 0; attempt < 500 && !point; attempt++) {
    const lat = polygon.minLat + rng() * (polygon.maxLat - polygon.minLat);
    const lng = Core.normalizeLng(polygon.minLng + rng() * (polygon.maxLng - polygon.minLng));
    if (Core.polygonContains(lat, lng, polygon.rings)) point = { lat, lng };
  }
  assert.ok(point, "could not sample Fiji polygon");
  assert.equal(Core.findCountryAt(point.lat, point.lng, index)?.country.iso, "fj");
  assert.equal(Core.findCountryAt(point.lat, point.lng + 360, index)?.country.iso, "fj");
  assert.equal(Core.findCountryAt(point.lat, point.lng - 360, index)?.country.iso, "fj");
});

test("random points stay inside their country", () => {
  const rng = seededRandom(1234);
  for (const iso of ["fr", "no", "ru", "fj", "za", "us", "br", "cl", "id", "ca"]) {
    const country = index.byIso.get(iso);
    assert.ok(country, `missing ${iso}`);
    for (let sample = 0; sample < 25; sample++) {
      const point = Core.randomPointInCountry(country, rng);
      assert.ok(point);
      const inside = country.polygons.some((polygon) =>
        Core.polygonContains(point.lat, point.lng, polygon.rings),
      );
      assert.ok(inside, `${iso} sample ${sample} outside: ${JSON.stringify(point)}`);
    }
  }
});

test("animation points and schedules are deterministic", () => {
  const france = index.byIso.get("fr");
  const points = Core.buildAnimationPoints(france, 12, seededRandom(9));
  assert.equal(points.length, 12);
  for (const point of points) {
    assert.ok(
      france.polygons.some((polygon) => Core.polygonContains(point.lat, point.lng, polygon.rings)),
    );
  }

  const schedule = Core.buildSchedule(2800, 45, 320);
  assert.equal(schedule[0].at, 0);
  assert.equal(schedule[0].progress, 0);
  assert.equal(schedule[schedule.length - 1].at, 2800);
  assert.equal(schedule[schedule.length - 1].progress, 1);
  assert.ok(schedule.length > 5);
  for (let i = 1; i < schedule.length; i++) {
    assert.ok(schedule[i].at >= schedule[i - 1].at);
    if (i > 1 && i < schedule.length - 1) {
      const previousDelay = schedule[i - 1].at - schedule[i - 2].at;
      const delay = schedule[i].at - schedule[i - 1].at;
      assert.ok(delay >= previousDelay - 1e-9, "animation should decelerate");
    }
  }
});

test("configuration resolves enabled, excluded, and invalid values", () => {
  const selected = Core.resolveConfig(
    {
      ...CONFIG,
      enabledCountries: ["fr", "DE", "xx"],
      excludeCountries: ["de"],
      animationMs: 1,
      startIntervalMs: 5,
      endIntervalMs: 1,
      volume: 5,
      activationKey: "bogus",
    },
    COUNTRY_DATA,
  );
  assert.deepEqual(
    selected.index.selected.map((country) => country.iso),
    ["fr"],
  );
  assert.deepEqual(selected.index.unknown, ["xx"]);
  assert.equal(selected.settings.animationMs, 200);
  assert.equal(selected.settings.startIntervalMs, 10);
  assert.equal(selected.settings.endIntervalMs, 10);
  assert.equal(selected.settings.volume, 1);
  assert.equal(selected.settings.activationKey, "none");

  const none = Core.resolveConfig({ ...CONFIG, enabledCountries: [] }, COUNTRY_DATA);
  assert.equal(none.index.selected.length, 0);
});
