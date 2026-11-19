export default {
  name: "geogamble",
  entry: "src/main.ts",
  outfile: "dist/geoguessr-geogamble.user.js",
  meta: "src/userscript.meta.txt",
  versionDefine: "__GEOGAMBLE_VERSION__",
  sizeBudget: 650000,
  noframes: true,
  site: {
    displayName: "GeoGamble",
    summary: "Gambles random country points and adds per-round location cases.",
    features: [
      "Country-targeted guesses",
      "Animated gamble",
      "Location cases",
      "Duel pin support",
      "Custom country filters",
    ],
    accent: "#c084fc",
    order: 20,
    anchor: "geogamble",
  },
  publish: { filename: "geoguessr-geogamble.user.js" },
};
