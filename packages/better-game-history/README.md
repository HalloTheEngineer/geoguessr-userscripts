# Better Game History

Adds a slide-out duel history drawer and rating graphs on non-game pages. It records duel results from the game WebSocket and fills missing details from the feed and duel APIs.

Source: `src/main.ts`. Build with `npm run build -- better-game-history` from the repository root. The generated artifact is `dist/geoguessr-better-game-history.user.js`.

Chart.js is bundled at build time. History is stored in the versioned `gg.better-game-history.history` list store, scoped to the signed-in account, and capped by the configurable history limit (default 2000). The feed backfill targets the latest 300 ranked solo and 300 ranked team duels by default, skips unranked feed entries, and keeps older stored records when new games arrive. The graph can switch between solo rating history and a selected team composition. Player names are learned from duel payloads and visited profile pages; the selected team can trigger a rate-limited async lookup. Unresolved names use shortened player IDs. Settings are available in the shared Userscripts tab in the official in-game settings dialog.
