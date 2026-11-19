# Persistent Game Summary & History

Adds a slide-out duel history drawer and rating graphs on non-game pages. It records duel results from the game WebSocket and fills missing details from the feed and duel APIs.

Source: `src/main.ts`. Build with `npm run build -- persistent-game-summary` from the repository root. The generated artifact is `dist/geoguessr-persistent-game-summary.user.js`.

Chart.js is bundled at build time. History is stored in the versioned `gg.persistent-game-summary.history` list store and capped by the configurable history limit (default 2000). Settings are available in the shared Userscripts tab in the official in-game settings dialog.
