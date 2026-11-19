import fs from "node:fs";

export const START_MARKER = "// ==GEOGAMBLE_COUNTRIES_START==";
export const END_MARKER = "// ==GEOGAMBLE_COUNTRIES_END==";

const LINE_PATTERN = /^\s*(\{"iso":.*\})(,?)$/;

export function unwrapLng(lng, reference) {
  let value = lng;
  while (value - reference > 180) value -= 360;
  while (value - reference < -180) value += 360;
  return value;
}

export function polygonBounds(rings) {
  const outer = rings[0];
  const reference = outer[0][0];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of outer) {
    const x = unwrapLng(lng, reference);
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function polygonCentroid(rings) {
  const bounds = polygonBounds(rings);
  return { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 };
}

export function matchingExclusion(rings, rects) {
  if (!Array.isArray(rects) || !rects.length) return null;
  const bounds = polygonBounds(rings);
  for (const rect of rects) {
    if (
      Math.abs(bounds.minLat - rect.minLat) < 1e-9 &&
      Math.abs(bounds.maxLat - rect.maxLat) < 1e-9 &&
      Math.abs(bounds.minLng - rect.minLng) < 1e-9 &&
      Math.abs(bounds.maxLng - rect.maxLng) < 1e-9
    ) {
      return rect;
    }
  }
  return null;
}

export function readExclusions(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid exclusions file: ${file}`);
  }
  return parsed;
}

export function renderBlock(
  countries,
  { declaration = "const COUNTRY_DATA", declarationIndent = "  ", entryIndent = "    " } = {},
) {
  const lines = countries.map((country) => `${entryIndent}${JSON.stringify(country)}`);
  return [
    START_MARKER,
    `${declarationIndent}${declaration} = [`,
    lines.join(",\n"),
    `${declarationIndent}];`,
    `${declarationIndent}${END_MARKER}`,
  ].join("\n");
}

export function renderModuleBlock(countries) {
  return renderBlock(countries, {
    declaration: "export const COUNTRY_DATA",
    declarationIndent: "",
    entryIndent: "  ",
  });
}

export function writeBlock(text, block) {
  const start = text.indexOf(START_MARKER);
  const end = text.indexOf(END_MARKER);
  if (start < 0 || end < 0 || end < start) {
    throw new Error("Country data markers not found");
  }
  return text.slice(0, start) + block + text.slice(end + END_MARKER.length);
}

export function parseBlock(text) {
  const start = text.indexOf(START_MARKER);
  const end = text.indexOf(END_MARKER);
  if (start < 0 || end < 0 || end < start) {
    throw new Error("Country data markers not found");
  }
  const entries = [];
  for (const line of text.slice(start, end).split("\n")) {
    const match = LINE_PATTERN.exec(line);
    if (match) entries.push(JSON.parse(match[1]));
  }
  return entries;
}

export function blockStats(countries) {
  let polygons = 0;
  for (const country of countries) polygons += country.polygons.length;
  return { countries: countries.length, polygons, bytes: renderModuleBlock(countries).length };
}
