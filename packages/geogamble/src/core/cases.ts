// @ts-nocheck
import {
  CASE_CRATE_BY_ID,
  CASE_CRATES,
  CASE_HINT_TYPES,
  CASE_MAX_HINTS,
  CASE_RARITY_BY_ID,
} from "./constants.js";
import { mainPolygon } from "./countries.js";
import {
  climateAt,
  climateRegionsFor,
  countryTraits,
  densityBand,
  elevationBand,
  nearestMajorCity,
} from "./environment.js";
import { clamp, normalizeLng, polygonContains, unwrapLng } from "./geo.js";
import { weightedPick } from "./sampling.js";

export function caseRarity(value) {
  return CASE_RARITY_BY_ID.get(String(value || "").toLowerCase()) || null;
}

export function countryFlagEmoji(iso) {
  const code = String(iso || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...Array.from(code, (letter) => 127397 + letter.charCodeAt(0)));
}

export function roundCoordinate(value, decimals = 0) {
  const precision = clamp(Math.trunc(Number(decimals) || 0), 0, 4);
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

export function formatCoordinate(value, axis, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const rounded = Math.abs(roundCoordinate(number, decimals)).toFixed(
    clamp(Math.trunc(Number(decimals) || 0), 0, 4),
  );
  const positive = axis === "lat" ? number >= 0 : number >= 0;
  return `${rounded}°${positive ? (axis === "lat" ? "N" : "E") : axis === "lat" ? "S" : "W"}`;
}

export function formatCoordinates(lat, lng, decimals = 0) {
  return `${formatCoordinate(lat, "lat", decimals)}, ${formatCoordinate(lng, "lng", decimals)}`;
}

export function segmentDistanceKm(lat, lng, aLng, aLat, bLng, bLat) {
  const values = [lat, lng, aLng, aLat, bLng, bLat].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return Infinity;
  const [pointLat, pointLng, aLngValue, aLatValue, bLngValue, bLatValue] = values;
  const reference = pointLng;
  const cosLat = Math.cos((pointLat * Math.PI) / 180);
  const scaleX = 111.32 * Math.max(0.01, cosLat);
  const scaleY = 110.574;
  const ax = (unwrapLng(aLngValue, reference) - reference) * scaleX;
  const ay = (aLatValue - pointLat) * scaleY;
  const bx = (unwrapLng(bLngValue, reference) - reference) * scaleX;
  const by = (bLatValue - pointLat) * scaleY;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return Math.hypot(ax, ay);
  const t = clamp(-(ax * dx + ay * dy) / lengthSquared, 0, 1);
  return Math.hypot(ax + dx * t, ay + dy * t);
}

export function distanceToBorderKm(lat, lng, country) {
  let nearest = Infinity;
  if (!country?.polygons?.length) return nearest;
  for (const polygon of country.polygons) {
    for (const ring of polygon.rings) {
      if (!ring.length) continue;
      for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
        const a = ring[previous];
        const b = ring[index];
        const distance = segmentDistanceKm(lat, lng, a[0], a[1], b[0], b[1]);
        if (distance < nearest) nearest = distance;
      }
    }
  }
  return nearest;
}

export function caseLatitudeBand(lat) {
  const absolute = Math.abs(Number(lat));
  if (!Number.isFinite(absolute)) return null;
  if (absolute <= 23.5)
    return { title: "Tropical Band", detail: "The location lies between the Tropics." };
  if (absolute <= 35)
    return { title: "Subtropical Band", detail: "The location is in the subtropics." };
  if (absolute <= 55)
    return { title: "Temperate Band", detail: "The location is in the mid-latitudes." };
  if (absolute <= 66.5)
    return { title: "Subpolar Band", detail: "The location is close to the polar circle." };
  return { title: "Polar Band", detail: "The location is in a polar region." };
}

export function caseBorderBand(distance) {
  if (!Number.isFinite(distance)) return null;
  if (distance <= 25)
    return { title: "Near a Border", detail: "The location is within 25 km of a border." };
  if (distance <= 75)
    return { title: "Border Country", detail: "The location is roughly 25-75 km from a border." };
  if (distance <= 200)
    return {
      title: "Moderately Inland",
      detail: "The location is roughly 75-200 km from a border.",
    };
  return { title: "Deep Inland", detail: "The location is more than 200 km from a border." };
}

export function caseHintEligible(type, context) {
  if (!type || !Number.isFinite(Number(context?.lat)) || !Number.isFinite(Number(context?.lng)))
    return false;
  const lat = Number(context.lat);
  const lng = Number(context.lng);
  const country = context?.country;
  const traits = country ? countryTraits(country.iso) : null;
  if (type.requiresCountry && !country?.name) return false;
  switch (type.id) {
    case "hemisphere":
    case "longitude-half":
    case "tropical-band":
    case "radius-50":
    case "radius-20":
    case "coords-01":
    case "coords-005":
    case "exact":
      return true;
    case "landlocked":
      return !!traits && typeof traits.landlocked === "boolean";
    case "island-nation":
      return !!traits && typeof traits.island === "boolean";
    case "continent":
      return !!traits?.continent;
    case "climate-group":
      return !!climateAt(lat, lng);
    case "elevation-band":
      return Number.isFinite(Number(traits?.elevationMean));
    case "population-density":
      return Number.isFinite(Number(traits?.density));
    case "subregion":
      return !!traits?.subregion;
    case "script-family":
      return !!traits?.script;
    case "language-family":
      return !!traits?.languageFamily;
    case "currency":
      return !!traits?.currency;
    case "tld":
      return !!traits?.tld;
    case "country-name":
    case "country-outline":
      return !!country?.name && typeof country?.iso === "string";
    case "country-flag":
      return !!countryFlagEmoji(country?.iso);
    case "country-iso":
      return typeof country?.iso === "string" && country.iso.length === 2;
    case "nearest-city":
      return !!nearestMajorCity(lat, lng);
    default:
      return false;
  }
}

export function buildCaseHint(type, context) {
  if (!caseHintEligible(type, context)) return null;
  const lat = Number(context.lat);
  const lng = Number(context.lng);
  const country = context.country || null;
  const traits = country ? countryTraits(country.iso) : null;
  const rarity = type.rarity;
  const base = {
    id: type.id,
    rarity,
    label: type.label,
    family: type.family,
    scope: type.scope,
    title: "",
    detail: "",
    overlay: null,
    payload: null,
  };
  if (type.id === "hemisphere") {
    const north = lat >= 0;
    base.title = north ? "Northern Hemisphere" : "Southern Hemisphere";
    base.detail = `The location is on the ${north ? "north" : "south"} side of the equator.`;
    base.overlay = "hemisphere";
    base.payload = { kind: "hemisphere", north };
  } else if (type.id === "longitude-half") {
    const east = normalizeLng(lng) >= 0;
    base.title = east ? "Eastern Hemisphere" : "Western Hemisphere";
    base.detail = `The location is in the ${east ? "east" : "west"}ern hemisphere.`;
    base.overlay = "longitude-half";
    base.payload = { kind: "longitude-half", east };
  } else if (type.id === "tropical-band") {
    const tropical = Math.abs(lat) <= 23.436;
    base.title = tropical ? "Within the Tropics" : "Outside the Tropics";
    base.detail = tropical
      ? "The location is between the Tropic of Cancer and the Tropic of Capricorn."
      : "The location is outside the tropics.";
    base.overlay = "tropical-band";
    base.payload = { kind: "tropical-band", tropical };
  } else if (type.id === "landlocked") {
    base.title = traits.landlocked ? "Landlocked Country" : "Coastal Country";
    base.detail = traits.landlocked
      ? "The target is in a country with no ocean coastline."
      : "The target is in a country with an ocean coastline.";
    base.overlay = "category";
    base.payload = { field: "landlocked", value: traits.landlocked, mainOnly: true };
  } else if (type.id === "island-nation") {
    base.title = traits.island ? "No Land Borders" : "Shares Land Borders";
    base.detail = traits.island
      ? "The target is in a country with no land borders."
      : "The target is in a country that shares land borders.";
    base.overlay = "category";
    base.payload = { field: "island", value: traits.island, mainOnly: true };
  } else if (type.id === "continent") {
    base.title = traits.continent;
    base.detail = `The target is in ${traits.continent}.`;
    base.overlay = "region";
    base.payload = { field: "continent", value: traits.continent };
  } else if (type.id === "climate-group") {
    const climate = climateAt(lat, lng);
    if (!climate) return null;
    base.title = climate.label;
    const article = /^[aeiou]/i.test(climate.label) ? "an" : "a";
    base.detail = `The target is in ${article} ${climate.label.toLowerCase()} climate zone.`;
    base.overlay = "climate";
    base.payload = { label: climate.label };
  } else if (type.id === "elevation-band") {
    const band = elevationBand(traits.elevationMean);
    if (!band) return null;
    base.title = `${band.label} Country`;
    base.detail = `The country's mean elevation is about ${Math.round(traits.elevationMean)} m (${band.detail}).`;
    base.overlay = "category";
    base.payload = { band: "elevation", value: band.id, mainOnly: true };
  } else if (type.id === "population-density") {
    const band = densityBand(traits.density);
    if (!band) return null;
    base.title = band.label;
    base.detail = `The country's population density is about ${Math.round(traits.density)} people/km² (${band.detail}).`;
    base.overlay = "category";
    base.payload = { band: "density", value: band.id, mainOnly: true };
  } else if (type.id === "subregion") {
    base.title = traits.subregion;
    base.detail = `The target is in ${traits.subregion}.`;
    base.overlay = "region";
    base.payload = { field: "subregion", value: traits.subregion };
  } else if (type.id === "script-family") {
    base.title = `${traits.script} Script`;
    base.detail = `An official language in this country uses ${traits.script} script.`;
    base.overlay = "category";
    base.payload = { field: "script", value: traits.script, mainOnly: true };
  } else if (type.id === "language-family") {
    base.title = `${traits.languageFamily} Language`;
    base.detail = `An official language in this country belongs to the ${traits.languageFamily} family.`;
    base.overlay = "category";
    base.payload = { field: "languageFamily", value: traits.languageFamily, mainOnly: true };
  } else if (type.id === "currency") {
    base.title = traits.currencyName || traits.currency;
    base.detail = `The country uses ${traits.currencyName || traits.currency} (${traits.currency}).`;
  } else if (type.id === "tld") {
    base.title = traits.tld;
    base.detail = `The country's internet TLD is ${traits.tld}.`;
  } else if (type.id === "country-name") {
    base.title = country.name;
    base.detail = `The location is in ${country.name}.`;
  } else if (type.id === "country-flag") {
    const flag = countryFlagEmoji(country.iso);
    if (!flag) return null;
    base.title = `${flag} ${country.name}`;
    base.detail = `The country flag is ${flag}.`;
  } else if (type.id === "country-outline") {
    base.title = "Country Outline";
    base.detail = "The country outline is highlighted on the guess map.";
    base.overlay = "outline";
    base.payload = { iso: country.iso };
  } else if (type.id === "country-iso") {
    const code = String(country.iso).toUpperCase();
    base.title = code;
    base.detail = `The country code is ${code}.`;
  } else if (type.id === "nearest-city") {
    const city = nearestMajorCity(lat, lng);
    if (!city) return null;
    const distance = Math.round(city.distanceKm);
    base.title = "Nearest Major City";
    base.detail =
      distance <= 5
        ? `The target is in the ${city.name} urban area (${city.iso.toUpperCase()}).`
        : `About ${distance} km ${city.direction} of ${city.name} (${city.iso.toUpperCase()}).`;
    base.overlay = "center";
    base.payload = { lat: city.lat, lng: city.lng };
  } else if (type.id === "radius-50" || type.id === "radius-20") {
    const radiusKm = type.id === "radius-50" ? 50 : 20;
    const center = offsetRadiusCenter(lat, lng, radiusKm);
    if (!center) return null;
    base.title = `${radiusKm} km Radius`;
    base.detail = "The target is somewhere inside this circle.";
    base.overlay = "circle";
    base.payload = { ...center, radiusKm, offset: true };
  } else if (type.id === "coords-01" || type.id === "coords-005") {
    const decimals = type.id === "coords-01" ? 0 : 2;
    const cellLat = roundCoordinate(lat, decimals);
    const cellLng = roundCoordinate(lng, decimals);
    const half = 0.5 / 10 ** decimals;
    base.title = `${decimals === 0 ? "1" : "0.05"}° Coordinate Cell`;
    base.detail = `The target is inside the coordinate cell around ${formatCoordinates(cellLat, cellLng, decimals)}.`;
    base.overlay = "cell";
    base.payload = {
      south: cellLat - half,
      north: cellLat + half,
      west: cellLng - half,
      east: cellLng + half,
    };
  } else if (type.id === "exact") {
    base.title = "Exact Location";
    base.detail = "The exact location is pinned on the guess map.";
    base.overlay = "pin";
    base.payload = { lat, lng };
  }
  return base.title ? base : null;
}

export function pickCaseHint(
  rarity,
  context,
  used = new Set(),
  rng = Math.random,
  familyFocus = null,
) {
  const available = CASE_HINT_TYPES.filter(
    (type) => !used.has(type.id) && caseHintEligible(type, context),
  );
  if (!available.length) return null;
  const requested = CASE_RARITY_BY_ID.get(rarity);
  const requestedRank = requested?.rank ?? 0;
  const matching = available.filter((type) => type.rarity === rarity);
  let pool = matching.length
    ? matching
    : [...available].sort((a, b) => {
        const rankA = CASE_RARITY_BY_ID.get(a.rarity)?.rank ?? 0;
        const rankB = CASE_RARITY_BY_ID.get(b.rarity)?.rank ?? 0;
        return Math.abs(rankA - requestedRank) - Math.abs(rankB - requestedRank);
      });
  if (Array.isArray(familyFocus) && familyFocus.length) {
    const focused = pool.filter((type) => familyFocus.includes(type.family));
    if (focused.length) pool = focused;
  }
  const usedFamilies = new Set(
    [...used].map((id) => CASE_HINT_TYPES.find((type) => type.id === id)?.family).filter(Boolean),
  );
  if (usedFamilies.size) {
    const diverse = pool.filter((type) => !usedFamilies.has(type.family));
    if (diverse.length) pool = diverse;
  }
  let value = Number(rng());
  if (!Number.isFinite(value)) value = 0;
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(value * pool.length)));
  return buildCaseHint(pool[index], context);
}

export function pickCaseCrateOutcome(crateId, context, used = new Set(), rng = Math.random) {
  const crate = CASE_CRATE_BY_ID.get(crateId) || CASE_CRATES[0];
  const weights = Object.entries(crate.weights).map(([rarity, weight]) => ({ rarity, weight }));
  const rolled = weightedPick(weights, rng);
  const hint = pickCaseHint(rolled?.rarity || "common", context, used, rng, crate.families);
  if (!hint) return null;
  return { crateId: crate.id, rolledRarity: rolled?.rarity || "common", hint };
}

export function caseModeAllowed({ pathname = "/", isRated = null, hasLocation = true } = {}) {
  if (hasLocation === false) return false;
  const path = String(pathname || "/").split("?")[0];
  if (/(?:^|\/)(replay|summary|spectate|broadcast)(?:\/|$)/i.test(path)) return false;
  if (/^\/game\/[^/]+\/?$/i.test(path)) return true;
  if (/^\/party(?:\/|$)/i.test(path)) return isRated !== true;
  if (/^\/(?:duels|team-duels)\/[^/]+\/?$/i.test(path)) return isRated === false;
  return false;
}

export function caseRoundKey({
  pathname = "/",
  gameId = null,
  roundNumber = null,
  panoId = null,
} = {}) {
  const pano = typeof panoId === "string" ? panoId.trim() : "";
  const game = typeof gameId === "string" ? gameId.trim() : "";
  const round = Number(roundNumber);
  if (game && Number.isFinite(round) && round > 0 && pano)
    return `duel:${game}:${Math.trunc(round)}:${pano}`;
  if (pano) return `std:${String(pathname || "/").split("?")[0]}:${pano}`;
  return null;
}

export function normalizeCaseSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const roundKey = typeof value.roundKey === "string" && value.roundKey ? value.roundKey : null;
  if (!roundKey) return null;
  const opened = [];
  for (const entry of Array.isArray(value.opened) ? value.opened : []) {
    const id = typeof entry === "string" ? entry : "";
    if (CASE_CRATE_BY_ID.has(id) && !opened.includes(id)) opened.push(id);
  }
  const hints = [];
  for (const entry of Array.isArray(value.hints) ? value.hints : []) {
    if (hints.length >= CASE_MAX_HINTS) break;
    if (!entry || typeof entry !== "object") continue;
    const type = CASE_HINT_TYPES.find((candidate) => candidate.id === entry.id);
    if (!type || hints.some((hint) => hint.id === type.id)) continue;
    if (typeof entry.title !== "string" || typeof entry.detail !== "string") continue;
    const overlay = [
      "outline",
      "region",
      "category",
      "climate",
      "circle",
      "cell",
      "hemisphere",
      "longitude-half",
      "tropical-band",
      "center",
      "pin",
    ].includes(entry.overlay)
      ? entry.overlay
      : null;
    hints.push({
      id: type.id,
      rarity: type.rarity,
      label: type.label,
      family: type.family,
      scope: type.scope,
      title: entry.title,
      detail: entry.detail,
      overlay,
      payload: entry.payload && typeof entry.payload === "object" ? entry.payload : null,
    });
  }
  const used = [];
  for (const entry of Array.isArray(value.used) ? value.used : []) {
    if (
      typeof entry === "string" &&
      CASE_HINT_TYPES.some((type) => type.id === entry) &&
      !used.includes(entry)
    ) {
      used.push(entry);
    }
  }
  for (const hint of hints) {
    if (!used.includes(hint.id)) used.push(hint.id);
  }
  return { roundKey, opened, hints, used };
}

export function caseHintHasOverlay(hint) {
  return (
    !!hint?.payload &&
    (hint.overlay === "outline" ||
      hint.overlay === "region" ||
      hint.overlay === "category" ||
      hint.overlay === "climate" ||
      hint.overlay === "circle" ||
      hint.overlay === "cell" ||
      hint.overlay === "hemisphere" ||
      hint.overlay === "longitude-half" ||
      hint.overlay === "tropical-band" ||
      hint.overlay === "center" ||
      hint.overlay === "pin")
  );
}

const CASE_AREA_OVERLAYS = new Set([
  "outline",
  "region",
  "category",
  "climate",
  "hemisphere",
  "longitude-half",
  "tropical-band",
  "circle",
  "cell",
]);

export function caseHintIsAreaHint(hint) {
  return !!hint?.payload && CASE_AREA_OVERLAYS.has(hint.overlay);
}

function splitBandRects(rects) {
  const result = [];
  for (const rect of rects) {
    const west = Number(rect.west);
    const east = Number(rect.east);
    if (!Number.isFinite(west) || !Number.isFinite(east) || east <= west) continue;
    let start = west;
    while (start < east - 1e-9) {
      const end = Math.min(east, start + 90);
      result.push({ ...rect, west: start, east: end });
      start = end;
    }
  }
  return result;
}

export function caseBandRects(hint) {
  const payload = hint?.payload;
  if (hint?.overlay === "hemisphere") {
    return splitBandRects([
      {
        north: payload?.north ? 85 : 0,
        south: payload?.north ? 0 : -85,
        west: -180,
        east: 180,
      },
    ]);
  }
  if (hint?.overlay === "longitude-half") {
    return splitBandRects([
      {
        north: 85,
        south: -85,
        west: payload?.east ? 0 : -180,
        east: payload?.east ? 180 : 0,
      },
    ]);
  }
  if (hint?.overlay === "tropical-band") {
    if (payload?.tropical)
      return splitBandRects([{ north: 23.436, south: -23.436, west: -180, east: 180 }]);
    return splitBandRects([
      { north: 85, south: 23.436, west: -180, east: 180 },
      { north: -23.436, south: -85, west: -180, east: 180 },
    ]);
  }
  return [];
}

function boundsUnion(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return {
    north: Math.max(a.north, b.north),
    south: Math.min(a.south, b.south),
    west: Math.min(a.west, b.west),
    east: Math.max(a.east, b.east),
  };
}

function boundsIntersection(a, b) {
  if (!a || !b) return null;
  const result = {
    north: Math.min(a.north, b.north),
    south: Math.max(a.south, b.south),
    west: Math.max(a.west, b.west),
    east: Math.min(a.east, b.east),
  };
  return result.north >= result.south && result.east >= result.west ? result : null;
}

function countryBounds(countries) {
  let bounds = null;
  for (const country of countries || []) {
    const polygon = mainPolygon(country);
    if (!polygon) continue;
    bounds = boundsUnion(bounds, {
      north: polygon.maxLat,
      south: polygon.minLat,
      west: polygon.minLng,
      east: polygon.maxLng,
    });
  }
  return bounds;
}

function mergeBandRects(rects) {
  const merged = [];
  const sorted = (rects || [])
    .slice()
    .sort((a, b) => a.north - b.north || a.south - b.south || a.west - b.west);
  for (const rect of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last.north - rect.north) < 1e-9 &&
      Math.abs(last.south - rect.south) < 1e-9 &&
      Math.abs(last.east - rect.west) < 1e-9
    ) {
      last.east = rect.east;
    } else {
      merged.push({ ...rect });
    }
  }
  return merged;
}

function splitRectsForRender(rects) {
  const result = [];
  for (const rect of mergeBandRects(rects)) {
    let start = rect.west;
    while (start < rect.east - 1e-9) {
      const end = Math.min(rect.east, start + 90);
      result.push({ ...rect, west: start, east: end });
      start = end;
    }
  }
  return result;
}

function intersectRect(a, b) {
  if (!a || !b) return null;
  const rect = {
    north: Math.min(a.north, b.north),
    south: Math.max(a.south, b.south),
    west: Math.max(a.west, b.west),
    east: Math.min(a.east, b.east),
  };
  return rect.north > rect.south && rect.east > rect.west ? rect : null;
}

function intersectRectLists(a, b) {
  if (!a) return b ? b.map((rect) => ({ ...rect })) : null;
  if (!b) return a.map((rect) => ({ ...rect }));
  const result = [];
  for (const left of a) {
    for (const right of b) {
      const rect = intersectRect(left, right);
      if (rect) result.push(rect);
    }
  }
  return result;
}

function clipRingToRect(ring, rect) {
  let points = ring.map(([lng, lat]) => ({ lng, lat }));
  const edges = [
    {
      inside: (p) => p.lng >= rect.west,
      intersect: (a, b) => ({
        lng: rect.west,
        lat: a.lat + ((b.lat - a.lat) * (rect.west - a.lng)) / (b.lng - a.lng),
      }),
    },
    {
      inside: (p) => p.lng <= rect.east,
      intersect: (a, b) => ({
        lng: rect.east,
        lat: a.lat + ((b.lat - a.lat) * (rect.east - a.lng)) / (b.lng - a.lng),
      }),
    },
    {
      inside: (p) => p.lat >= rect.south,
      intersect: (a, b) => ({
        lng: a.lng + ((b.lng - a.lng) * (rect.south - a.lat)) / (b.lat - a.lat),
        lat: rect.south,
      }),
    },
    {
      inside: (p) => p.lat <= rect.north,
      intersect: (a, b) => ({
        lng: a.lng + ((b.lng - a.lng) * (rect.north - a.lat)) / (b.lat - a.lat),
        lat: rect.north,
      }),
    },
  ];
  for (const edge of edges) {
    if (!points.length) break;
    const output = [];
    for (let index = 0; index < points.length; index++) {
      const current = points[index];
      const previous = points[(index + points.length - 1) % points.length];
      const currentInside = edge.inside(current);
      const previousInside = edge.inside(previous);
      if (currentInside) {
        if (!previousInside) output.push(edge.intersect(previous, current));
        output.push(current);
      } else if (previousInside) {
        output.push(edge.intersect(previous, current));
      }
    }
    points = output;
  }
  return points
    .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat))
    .map((point) => [point.lng, point.lat]);
}

function clipPolygonToRect(polygon, rect) {
  const rings = [];
  for (const ring of polygon.rings) {
    const clipped = clipRingToRect(ring, rect);
    if (clipped.length >= 3) rings.push(clipped);
  }
  return rings.length ? { rings } : null;
}

function rectRings(rect) {
  return [
    [
      [rect.west, rect.south],
      [rect.east, rect.south],
      [rect.east, rect.north],
      [rect.west, rect.north],
      [rect.west, rect.south],
    ],
  ];
}

function ringsBounds(rings) {
  let north = -85;
  let south = 85;
  let west = Infinity;
  let east = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lat > north) north = lat;
      if (lat < south) south = lat;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
    }
  }
  return [north, south, west, east].every(Number.isFinite) ? { north, south, west, east } : null;
}

function countryContainsPoint(country, lat, lng) {
  const polygon = mainPolygon(country);
  return !!polygon && polygonContains(lat, lng, polygon.rings);
}

export function caseCompositeGeometry(hints, countryIndex) {
  const areaHints = (hints || []).filter(caseHintIsAreaHint);
  const labels = areaHints.map((hint) => hint.title);
  const composite = areaHints.length > 1;
  const base = {
    areaHints,
    labels,
    composite,
    mode: "native",
    empty: true,
    bounds: null,
    polygons: [],
  };
  if (!areaHints.length) return base;
  if (areaHints.some((hint) => hint.overlay === "circle")) {
    return { ...base, mode: "canvas" };
  }

  const countryPredicates = [];
  let climateHint = null;
  let rects = null;
  let hasRects = false;
  for (const hint of areaHints) {
    if (hint.overlay === "outline") {
      if (hint.payload?.iso) countryPredicates.push({ iso: hint.payload.iso });
    } else if (hint.overlay === "region" || hint.overlay === "category") {
      countryPredicates.push(hint.payload);
    } else if (
      hint.overlay === "hemisphere" ||
      hint.overlay === "longitude-half" ||
      hint.overlay === "tropical-band"
    ) {
      hasRects = true;
      rects = intersectRectLists(rects, mergeBandRects(caseBandRects(hint)));
    } else if (hint.overlay === "cell") {
      hasRects = true;
      rects = intersectRectLists(rects, [
        {
          north: Number(hint.payload?.north),
          south: Number(hint.payload?.south),
          west: Number(hint.payload?.west),
          east: Number(hint.payload?.east),
        },
      ]);
    } else if (hint.overlay === "climate") {
      climateHint = hint;
    }
  }

  let countries = [];
  if (countryPredicates.length) {
    countries = (countryIndex?.all || []).filter((country) =>
      countryPredicates.every((predicate) => caseHintCountryMatches(country, predicate)),
    );
    if (!countries.length) return base;
  }
  if (hasRects && !rects?.length) return base;

  const polygons = [];
  if (climateHint) {
    const regions = climateRegionsFor(climateHint.payload?.label);
    if (!regions.length) return base;
    for (const region of regions) {
      const lat = (region.north + region.south) / 2;
      const lng = (region.west + region.east) / 2;
      if (countries.length && !countries.some((country) => countryContainsPoint(country, lat, lng)))
        continue;
      const pieces = rects
        ? rects.map((rect) => intersectRect(region, rect)).filter(Boolean)
        : [region];
      for (const piece of pieces) polygons.push(rectRings(piece));
    }
  } else if (countries.length) {
    const source = countries.map((country) => mainPolygon(country)).filter(Boolean);
    for (const polygon of source) {
      if (hasRects) {
        for (const rect of rects) {
          const clipped = clipPolygonToRect(polygon, rect);
          if (clipped) polygons.push(clipped.rings);
        }
      } else {
        polygons.push(polygon.rings);
      }
    }
  } else if (hasRects) {
    for (const rect of splitRectsForRender(rects)) polygons.push(rectRings(rect));
  }

  if (!polygons.length) return base;
  let bounds = null;
  for (const rings of polygons) {
    const next = ringsBounds(rings);
    if (!next) continue;
    bounds = bounds
      ? {
          north: Math.max(bounds.north, next.north),
          south: Math.min(bounds.south, next.south),
          west: Math.min(bounds.west, next.west),
          east: Math.max(bounds.east, next.east),
        }
      : next;
  }
  if (!bounds) return base;
  return { ...base, empty: false, bounds, polygons };
}

export function caseAreaFilterPlan(hints, countryIndex) {
  const areaHints = (hints || []).filter(caseHintIsAreaHint);
  const layers = [];
  const countryPredicates = [];
  for (const hint of areaHints) {
    if (hint.overlay === "outline") {
      if (hint.payload?.iso) countryPredicates.push({ iso: hint.payload.iso });
    } else if (hint.overlay === "region" || hint.overlay === "category") {
      countryPredicates.push(hint.payload);
    }
  }
  let countries = [];
  if (countryPredicates.length) {
    countries = (countryIndex?.all || []).filter((country) =>
      countryPredicates.every((predicate) => caseHintCountryMatches(country, predicate)),
    );
    if (!countries.length) {
      return {
        areaHints,
        layers: [],
        countries,
        bounds: null,
        labels: areaHints.map((hint) => hint.title),
        composite: areaHints.length > 1,
        empty: true,
      };
    }
    layers.push({ kind: "countries", countries, mainOnly: true });
  }
  for (const hint of areaHints) {
    if (
      hint.overlay === "hemisphere" ||
      hint.overlay === "longitude-half" ||
      hint.overlay === "tropical-band"
    ) {
      const rects = caseBandRects(hint);
      if (rects.length) layers.push({ kind: "bands", rects });
    } else if (hint.overlay === "climate") {
      const regions = climateRegionsFor(hint.payload?.label);
      if (regions.length) layers.push({ kind: "climate", regions });
    } else if (hint.overlay === "circle") {
      layers.push({
        kind: "circle",
        lat: Number(hint.payload?.lat),
        lng: Number(hint.payload?.lng),
        radiusKm: Number(hint.payload?.radiusKm),
      });
    } else if (hint.overlay === "cell") {
      layers.push({
        kind: "cell",
        north: Number(hint.payload?.north),
        south: Number(hint.payload?.south),
        west: Number(hint.payload?.west),
        east: Number(hint.payload?.east),
      });
    }
  }
  let bounds = { north: 85, south: -85, west: -180, east: 180 };
  for (const layer of layers) {
    let layerBounds = null;
    if (layer.kind === "countries") layerBounds = countryBounds(layer.countries);
    else if (layer.kind === "bands") {
      for (const rect of layer.rects) layerBounds = boundsUnion(layerBounds, rect);
    } else if (layer.kind === "climate") {
      for (const region of layer.regions) layerBounds = boundsUnion(layerBounds, region);
    } else if (layer.kind === "circle") {
      layerBounds = coordinateHintBounds(layer.lat, layer.lng, layer.radiusKm);
    } else if (layer.kind === "cell") {
      layerBounds = { north: layer.north, south: layer.south, west: layer.west, east: layer.east };
    }
    bounds = boundsIntersection(bounds, layerBounds);
    if (!bounds) break;
  }
  return {
    areaHints,
    layers,
    countries,
    bounds,
    labels: areaHints.map((hint) => hint.title),
    composite: areaHints.length > 1,
    empty: !layers.length || !bounds,
  };
}

export function coordinateHintBounds(lat, lng, radiusKm = 0) {
  const latitude = clamp(Number(lat), -85, 85);
  const longitude = Number(lng);
  const radius = Math.max(0, Number(radiusKm) || 0);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radius))
    return null;
  const latDelta = radius / 111.195;
  const cosLat = Math.max(0.05, Math.cos((latitude * Math.PI) / 180));
  const lngDelta = radius / (111.195 * cosLat);
  return {
    north: clamp(latitude + latDelta, -85, 85),
    south: clamp(latitude - latDelta, -85, 85),
    west: longitude - lngDelta,
    east: longitude + lngDelta,
  };
}

export function offsetRadiusCenter(lat, lng, radiusKm) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  const radius = Number(radiusKm);
  if (![latitude, longitude, radius].every(Number.isFinite) || radius <= 0) return null;
  const angle = Math.random() * Math.PI * 2;
  const distance = radius * (0.55 + Math.random() * 0.23);
  const cosLat = Math.max(0.08, Math.cos((latitude * Math.PI) / 180));
  const centerLat = clamp(latitude + (distance / 111.195) * Math.cos(angle), -84, 84);
  const centerLng = normalizeLng(longitude + (distance / (111.32 * cosLat)) * Math.sin(angle));
  return { lat: centerLat, lng: centerLng };
}

export function caseHintCountryMatches(country, payload) {
  const traits = country ? countryTraits(country.iso) : null;
  if (!traits || !payload) return false;
  if (payload.iso) return String(country.iso).toLowerCase() === String(payload.iso).toLowerCase();
  if (payload.band === "elevation") {
    return elevationBand(traits.elevationMean)?.id === payload.value;
  }
  if (payload.band === "density") {
    return densityBand(traits.density)?.id === payload.value;
  }
  const field = payload.field;
  const value = payload.value;
  if (!field || value === undefined || value === null) return false;
  return traits[field] === value;
}

function caseHintBandBounds(payload) {
  if (!payload) return null;
  if (payload.kind === "hemisphere") {
    return {
      north: 85,
      south: payload.north ? 0 : -85,
      west: -180,
      east: 180,
    };
  }
  if (payload.kind === "longitude-half") {
    return {
      north: 85,
      south: -85,
      west: payload.east ? 0 : -180,
      east: payload.east ? 180 : 0,
    };
  }
  if (payload.kind === "tropical-band") {
    if (payload.tropical) return { north: 23.436, south: -23.436, west: -180, east: 180 };
    return { north: 85, south: -85, west: -180, east: 180 };
  }
  return null;
}

export function caseHintBounds(hint, countryIndex) {
  if (!caseHintHasOverlay(hint)) return null;
  const payload = hint.payload;
  if (hint.overlay === "outline") {
    const iso = typeof payload.iso === "string" ? payload.iso.toLowerCase() : "";
    const country = countryIndex?.byIso?.get(iso);
    const polygon = mainPolygon(country);
    if (!polygon) return null;
    let north = -85;
    let south = 85;
    let west = Infinity;
    let east = -Infinity;
    for (const ring of polygon.rings) {
      for (const [lng, lat] of ring) {
        if (lat > north) north = lat;
        if (lat < south) south = lat;
        if (lng < west) west = lng;
        if (lng > east) east = lng;
      }
    }
    if (![north, south, west, east].every(Number.isFinite)) return null;
    return { north, south, west, east };
  }
  if (hint.overlay === "circle") {
    return coordinateHintBounds(payload.lat, payload.lng, payload.radiusKm);
  }
  if (hint.overlay === "cell") {
    const north = Number(payload?.north);
    const south = Number(payload?.south);
    const west = Number(payload?.west);
    const east = Number(payload?.east);
    if (![north, south, west, east].every(Number.isFinite)) return null;
    return { north, south, west, east };
  }
  if (["hemisphere", "longitude-half", "tropical-band"].includes(hint.overlay)) {
    return caseHintBandBounds(payload);
  }
  if (hint.overlay === "climate") {
    const label = payload?.label;
    if (!label) return null;
    const regions = climateRegionsFor(label);
    if (!regions.length) return null;
    let north = -85;
    let south = 85;
    let west = Infinity;
    let east = -Infinity;
    for (const region of regions) {
      if (region.north > north) north = region.north;
      if (region.south < south) south = region.south;
      if (region.west < west) west = region.west;
      if (region.east > east) east = region.east;
    }
    return { north, south, west, east };
  }
  if (hint.overlay === "region" || hint.overlay === "category") {
    if (!countryIndex?.all) return null;
    let north = -85;
    let south = 85;
    let west = Infinity;
    let east = -Infinity;
    let count = 0;
    for (const country of countryIndex.all) {
      if (!caseHintCountryMatches(country, payload)) continue;
      const polygons = payload?.mainOnly
        ? [mainPolygon(country)].filter(Boolean)
        : country.polygons;
      for (const polygon of polygons) {
        for (const ring of polygon.rings) {
          for (const [lng, lat] of ring) {
            if (lat > north) north = lat;
            if (lat < south) south = lat;
            if (lng < west) west = lng;
            if (lng > east) east = lng;
          }
        }
      }
      count++;
    }
    if (!count || ![north, south, west, east].every(Number.isFinite)) return null;
    return { north, south, west, east };
  }
  return coordinateHintBounds(payload.lat, payload.lng, 0);
}
