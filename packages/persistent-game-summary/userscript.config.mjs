export default {
  name: "persistent-game-summary",
  entry: "src/main.ts",
  outfile: "dist/geoguessr-persistent-game-summary.user.js",
  meta: "src/userscript.meta.txt",
  versionDefine: "__PGS_VERSION__",
  noframes: true,
  sizeBudget: 620000,
  site: {
    displayName: "Persistent Game Summary",
    summary: "Tracks duel history and renders rating, score, and performance graphs.",
    features: [
      "Duel history drawer",
      "Rating and score graphs",
      "Moving averages",
      "Candlestick views",
      "Team duel detection",
    ],
    accent: "#34d399",
    order: 50,
    anchor: "persistent-game-summary",
  },
  publish: { filename: "geoguessr-persistent-game-summary.user.js" },
  legacyGist: {
    id: "30e6ab630a8a06d5ce16cc54454a4f8b",
    filenames: ["geoguessr-persistent-game-summary.user.js"],
  },
};
