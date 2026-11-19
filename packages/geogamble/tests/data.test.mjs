import assert from "node:assert/strict";
import test from "node:test";
import { polygonBounds, readExclusions } from "../scripts/country-data.mjs";
import { loadCore } from "./helpers.mjs";

const { COUNTRY_DATA } = loadCore();
const exclusions = readExclusions(
  new URL("../scripts/data/polygon-exclusions.json", import.meta.url),
);

function sameRect(a, b) {
  return (
    Math.abs(a.minLat - b.minLat) < 1e-9 &&
    Math.abs(a.maxLat - b.maxLat) < 1e-9 &&
    Math.abs(a.minLng - b.minLng) < 1e-9 &&
    Math.abs(a.maxLng - b.maxLng) < 1e-9
  );
}

test("exclusions file is an object of rectangle lists", () => {
  assert.ok(exclusions && typeof exclusions === "object" && !Array.isArray(exclusions));
  for (const [iso, rects] of Object.entries(exclusions)) {
    assert.match(iso, /^[a-z]{2}$/);
    assert.ok(Array.isArray(rects) && rects.length > 0, `${iso} must list at least one rectangle`);
    for (const rect of rects) {
      assert.equal(typeof rect.name, "string");
      assert.ok(rect.name.length > 0, `${iso} rectangle is missing a name`);
      for (const key of ["minLat", "maxLat", "minLng", "maxLng"]) {
        assert.equal(typeof rect[key], "number", `${iso} ${key} must be a number`);
        assert.ok(Number.isFinite(rect[key]), `${iso} ${key} must be finite`);
      }
      assert.ok(rect.minLat <= rect.maxLat, `${iso} rectangle has inverted latitudes`);
      assert.ok(rect.minLng <= rect.maxLng, `${iso} rectangle has inverted longitudes`);
    }
  }
});

test("every country keeps at least one polygon", () => {
  assert.ok(COUNTRY_DATA.length > 0);
  for (const country of COUNTRY_DATA) {
    assert.ok(
      Array.isArray(country.polygons) && country.polygons.length > 0,
      `${country.iso} has no polygons`,
    );
  }
});

test("excluded rectangles are absent from the embedded polygons", () => {
  const byIso = new Map(COUNTRY_DATA.map((country) => [country.iso, country]));
  for (const [iso, rects] of Object.entries(exclusions)) {
    const country = byIso.get(iso);
    assert.ok(country, `${iso} is excluded but missing from COUNTRY_DATA`);
    for (const rect of rects) {
      for (const polygon of country.polygons) {
        assert.ok(
          !sameRect(polygonBounds(polygon), rect),
          `${country.name} still contains ${rect.name}`,
        );
      }
    }
  }
});
