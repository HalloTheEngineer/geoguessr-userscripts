import fs from "node:fs";

const networkRules = JSON.parse(
  fs.readFileSync(new URL("./network-rules.json", import.meta.url), "utf8"),
);

export default {
  name: "adblocker",
  entry: "src/main.ts",
  outfile: "dist/geoguessr-adblocker.user.js",
  meta: "src/userscript.meta.txt",
  versionDefine: "__ADBLOCKER_VERSION__",
  sizeBudget: 90000,
  site: {
    displayName: "AdBlocker",
    summary: "Best-effort ad and analytics blocking plus targeted UI cleanup.",
    features: [
      "Best-effort network blocking",
      "DOM ad cleanup",
      "Homepage cleanup",
      "In-game cleanup",
      "Multiplayer cleanup",
    ],
    accent: "#a78bfa",
    order: 10,
    anchor: "adblocker",
  },
  publish: { filename: "geoguessr-adblocker.user.js" },
  webRequest: networkRules.webRequest,
  legacyGist: {
    id: "5359dc6c14186c8abcc4e262ac9d5276",
    filenames: ["geoguessr-adblocker.user.js"],
  },
};
