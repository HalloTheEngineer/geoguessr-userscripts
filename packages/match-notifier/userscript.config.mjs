export default {
  name: "match-notifier",
  entry: "src/main.ts",
  outfile: "dist/geoguessr-match-notifier.user.js",
  meta: "src/userscript.meta.txt",
  versionDefine: "__MATCH_NOTIFIER_VERSION__",
  noframes: true,
  sizeBudget: 600000,
  site: {
    displayName: "Match Notifier",
    summary: "Plays configurable sounds for duel starts and new rounds.",
    features: [
      "Duel-start alert",
      "Optional round alert",
      "Custom sound upload",
      "Volume control",
      "Focus-aware playback",
    ],
    accent: "#f472b6",
    order: 40,
    anchor: "match-notifier",
  },
  publish: { filename: "geoguessr-match-notifier.user.js" },
  legacyGist: {
    id: "c3adcee6d281d12199e7b3ebc6c489c9",
    filenames: ["geoguessr-match-notifier.user.js"],
  },
};
