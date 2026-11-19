export default {
  name: "better-game-history",
  entry: "src/main.ts",
  outfile: "dist/geoguessr-better-game-history.user.js",
  meta: "src/userscript.meta.txt",
  versionDefine: "__BGH_VERSION__",
  noframes: true,
  sizeBudget: 650000,
  site: {
    displayName: "Better Game History",
    summary: "Keeps ranked solo and team history with selectable team rating graphs.",
    features: [
      "Ranked solo and team history",
      "Team composition graph filter",
      "Rating and score graphs",
      "Moving averages",
      "Candlestick views",
      "Live unranked history",
    ],
    accent: "#34d399",
    order: 50,
    anchor: "better-game-history",
    legacyAnchors: ["persistent-game-summary"],
  },
  publish: {
    filename: "geoguessr-better-game-history.user.js",
    compatibilityFilenames: ["geoguessr-persistent-game-summary.user.js"],
  },
  legacyGist: {
    id: "30e6ab630a8a06d5ce16cc54454a4f8b",
    filenames: ["geoguessr-persistent-game-summary.user.js"],
  },
};
