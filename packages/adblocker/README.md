# AdBlocker & Debloater

Removes ads, analytics scripts, and selected UI clutter on GeoGuessr.

Source: `src/main.ts` with metadata in `src/userscript.meta.txt`. Build with `npm run build -- adblocker` from the repository root. The generated artifact is `dist/geoguessr-adblocker.user.js`.

The script runs in all frames intentionally so it can remove ad iframes. Do not add `@noframes`. Feature toggles are registered in the shared Userscripts settings tab in the official in-game settings dialog. Known ad/analytics domains are also blocked through generated `@webRequest` metadata where the userscript manager supports it; the ads toggle controls DOM cleanup only.
