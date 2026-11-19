export default {
  name: "geosurfer",
  entry: "src/main.ts",
  outfile: "dist/geoguessr-geosurfer.user.js",
  meta: "src/userscript.meta.txt",
  versionDefine: "__GEOSURFER_VERSION__",
  resource: {
    name: "gg-geosurfer-video",
    url: "https://github.com/HalloTheEngineer/geoguessr-userscripts/releases/download/userscripts-assets/brainrot.mp4",
  },
  resourceUrlDefine: "__GEOSURFER_RESOURCE_URL__",
  noframes: true,
  sizeBudget: 120000,
  site: {
    displayName: "GeoSurfer",
    summary: "Adds an optional lightweight video overlay to the in-game stats panel.",
    features: [
      "External video resource",
      "Lazy visibility-based playback",
      "Muted by default",
      "Route-aware cleanup",
    ],
    accent: "#38bdf8",
    order: 30,
    anchor: "geosurfer",
    poster: "geosurfer-poster.webp",
  },
  publish: { filename: "geoguessr-geosurfer.user.js" },
};
