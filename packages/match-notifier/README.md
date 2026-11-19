# Match Notifier

Plays an alert sound when a duel starts and optionally when a new round starts. Settings are registered in the shared **Userscripts** settings tab in the official in-game settings dialog.

Source: `src/main.ts`. Build with `npm run build -- match-notifier` from the repository root. The generated artifact is `dist/geoguessr-match-notifier.user.js`.

The alert sound is embedded as a data URL so the userscript has no runtime asset dependency. Uploaded sounds are stored in the versioned config store and may hit the storage quota for large files.
