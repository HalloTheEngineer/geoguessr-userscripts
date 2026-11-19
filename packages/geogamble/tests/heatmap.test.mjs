import assert from "node:assert/strict";
import test from "node:test";
import { loadCore } from "./helpers.mjs";

const { Core, COUNTRY_DATA } = loadCore();
const index = Core.buildCountryIndex(COUNTRY_DATA);

function squareFeature(mainOnly = true) {
  return Core.countryMeta({
    iso: "zz",
    name: "Testland",
    mainOnly,
    polygons: [
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    ],
  });
}

test("heatmapFootprint uses the same centre and scale as the sampler", () => {
  const mainOnly = squareFeature(true);
  const footprint = Core.heatmapFootprint(mainOnly);
  assert.deepEqual(footprint.center, { lat: 5, lng: 5 });
  assert.equal(footprint.halfLat, 5);
  assert.equal(footprint.halfLng, 5);

  const spanning = Core.countryMeta({
    iso: "yy",
    name: "Two Islands",
    mainOnly: false,
    polygons: [
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
      [
        [
          [10, 10],
          [14, 10],
          [14, 14],
          [10, 14],
          [10, 10],
        ],
      ],
    ],
  });
  const spanningFootprint = Core.heatmapFootprint(spanning);
  assert.deepEqual(spanningFootprint.center, { lat: 7, lng: 7 });
  assert.equal(spanningFootprint.halfLat, 7);
  assert.equal(spanningFootprint.halfLng, 7);

  for (const iso of ["id", "ph", "gr"]) {
    const country = index.byIso.get(iso);
    assert.equal(country.mainOnly, false);
    assert.deepEqual(Core.heatmapFootprint(country).center, Core.countryCenter(country));
  }
  assert.equal(Core.heatmapFootprint(null), null);
});

test("heatmapWeightAt matches the Gaussian falloff", () => {
  const footprint = Core.heatmapFootprint(squareFeature());
  assert.equal(Core.heatmapWeightAt(footprint, 5, 5, 0), 1);
  assert.equal(Core.heatmapWeightAt(footprint, 5, 5, 0.75), 1);
  assert.equal(Core.heatmapWeightAt(footprint, 5, 10, 0), 1);
  const expected = Math.exp(-12 * 0.5 * 0.5 * 0.5);
  assert.ok(Math.abs(Core.heatmapWeightAt(footprint, 5, 7.5, 0.5) - expected) < 1e-12);
  assert.equal(Core.heatmapWeightAt(null, 5, 5, 1), 0);
});

test("heatmapColor is transparent at zero and monotonic", () => {
  assert.equal(Core.heatmapColor(0)[3], 0);
  assert.equal(Core.heatmapColor(-1)[3], 0);
  assert.ok(Core.heatmapColor(1)[3] > 0.5);
  let previous = -1;
  for (let i = 0; i <= 20; i++) {
    const alpha = Core.heatmapColor(i / 20)[3];
    assert.ok(alpha >= previous);
    previous = alpha;
  }
});

test("buildHeatmapRaster keeps only land cells and normalizes by land maximum", () => {
  const feature = Core.countryMeta({
    iso: "zz",
    name: "Holed Square",
    mainOnly: true,
    polygons: [
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
          [4, 4],
        ],
      ],
    ],
  });
  const polygon = feature.polygons[0];
  const footprint = Core.heatmapFootprint(feature);
  const size = 12;
  const pointAt = (column, row) => ({
    lng: -1 + (column + 0.5) * (12 / size),
    lat: -1 + (row + 0.5) * (12 / size),
  });
  const raster = Core.buildHeatmapRaster({
    polygon,
    footprint,
    bias: 0.6,
    width: size,
    height: size,
    pointAt,
  });
  assert.equal(raster.data.length, size * size);
  assert.ok(raster.max > 0);
  assert.ok(raster.data.some((weight) => weight === 0));
  const center = Math.floor(size / 2) * size + Math.floor(size / 2);
  assert.equal(raster.data[center], 0);
  let landMax = 0;
  for (const weight of raster.data) landMax = Math.max(landMax, weight);
  assert.ok(Math.abs(landMax - raster.max) < 1e-6);
  assert.ok(landMax <= 1);

  const flat = Core.buildHeatmapRaster({
    polygon,
    footprint,
    bias: 0,
    width: size,
    height: size,
    pointAt,
  });
  for (const weight of flat.data) assert.ok(weight === 0 || weight === 1);
});

test("buildHeatmapRaster handles antimeridian polygons", () => {
  const feature = Core.countryMeta({
    iso: "zz",
    name: "Dateline",
    mainOnly: true,
    polygons: [
      [
        [
          [179, 0],
          [-179, 0],
          [-179, -2],
          [179, -2],
          [179, 0],
        ],
      ],
    ],
  });
  const polygon = feature.polygons[0];
  const footprint = Core.heatmapFootprint(feature);
  assert.ok(Math.abs(Math.abs(footprint.center.lng) - 180) < 1e-9);
  const size = 6;
  const pointAt = (column, row) => ({
    lng: 179 + (column + 0.5) * (2 / size),
    lat: -0.2 - (row + 0.5) * (1.6 / size),
  });
  const raster = Core.buildHeatmapRaster({
    polygon,
    footprint,
    bias: 0.5,
    width: size,
    height: size,
    pointAt,
  });
  assert.ok(raster.data.every((weight) => weight > 0));
  assert.ok(raster.max > 0);
});
