// @ts-nocheck

export * from "./cases.js";
export * from "./config.js";
export * from "./constants.js";
export { COUNTRY_DATA } from "./countries.generated.js";
export * from "./countries.js";
export * from "./duel.js";
export * from "./encoding.js";
export * from "./environment.js";
export * from "./gamble.js";
export * from "./geo.js";
export * from "./heatmap.js";
export { HINT_DATA_SOURCES } from "./hint-data-sources.generated.js";
export * from "./sampling.js";

import * as cases from "./cases.js";
import * as config from "./config.js";
import * as constants from "./constants.js";
import { COUNTRY_DATA } from "./countries.generated.js";
import * as countries from "./countries.js";
import * as duel from "./duel.js";
import * as encoding from "./encoding.js";
import * as environment from "./environment.js";
import * as gamble from "./gamble.js";
import * as geo from "./geo.js";
import * as heatmap from "./heatmap.js";
import { HINT_DATA_SOURCES } from "./hint-data-sources.generated.js";
import * as sampling from "./sampling.js";

export const Core = {
  COUNTRY_DATA,
  HINT_DATA_SOURCES,
  ...constants,
  ...geo,
  ...countries,
  ...heatmap,
  ...sampling,
  ...encoding,
  ...duel,
  ...config,
  ...gamble,
  ...cases,
  ...environment,
};
