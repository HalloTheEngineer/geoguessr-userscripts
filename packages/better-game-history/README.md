# Better Game History

Adds a slide-out duel history drawer and rating graphs on non-game pages. It records duel results from the game WebSocket and fills missing details from the feed and duel APIs.

Source: `src/main.ts`. Build with `npm run build -- better-game-history` from the repository root. The generated artifact is `dist/geoguessr-better-game-history.user.js`.

Chart.js is bundled at build time. History is stored in the versioned `gg.better-game-history.history` list store, scoped to the signed-in account, and capped by the configurable history limit (default 2000). The feed backfill targets the latest 200 games by default and keeps older stored records when new games arrive. Settings are available in the shared Userscripts tab in the official in-game settings dialog.
