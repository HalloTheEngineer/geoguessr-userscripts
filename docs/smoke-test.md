# Live smoke test

Run this before publishing a release. It covers the shared WS/fetch/DOM changes and the UI migrations.

## Preparation

1. Remove or disable the old gist versions of all five scripts.
2. Start the dev server:

   ```bash
   npm run dev
   ```

3. Install all five scripts from `http://127.0.0.1:8787/`.
4. Open DevTools Console and filter on `gg-kit`, `GeoGamble`, `GeoGuessr Alert`, and `error`.
5. Reload the GeoGuessr tab after each source rebuild.

Dev versions use the next patch version with a `-dev` prerelease, for example `2026.11.19-dev.20261119121909`.

## Matrix

| Page or action | Expected result | Scripts |
| --- | --- | --- |
| Home `/` | Homepage cleanup, history drawer | adblocker, PGS |
| Multiplayer | Footer/how-to-play blocks removed, no layout damage | adblocker |
| Standard game | Case button, gamble, settings tab | GeoGamble, adblocker |
| In-game settings | Shared **Userscripts** tab shows AdBlocker, GeoGamble, GeoSurfer, Match Notifier, and Game Summary sub-tabs; only the active script renders; section cards have clear spacing | all |
| Reopen settings | No duplicate tab, sub-tabs, sections, or controls; active sub-tab is retained | all |
| Switch back to General/Keybindings | Native tab panels become visible again; Userscripts content hides without blanking the dialog | all |
| Duel start | Alert plays once | match-notifier |
| Duel round | Gamble places/sends pin; timeout cancels; case UI works | GeoGamble, match-notifier |
| Duel finish | History entry is recorded and hydrated | PGS, match-notifier |
| Profile | Drawer and graph render; filters and trends work | PGS |
| Stats overlay | GeoSurfer inserts one video card, loads the resource lazily, pauses when hidden, and removes it on route change | GeoSurfer |
| Native controls | Toggles, ranges, selects, reset/custom buttons, number fields (no spinner), and GeoGamble country toggles visually match GeoGuessr controls | all |
| All five installed | One WS/fetch/DOM hook, no duplicate UI | all |

## Console checks

```js
__GG_DIAGNOSTICS__.report()
Boolean(window.__GG_KIT_WS__)
Boolean(window.__GG_KIT_HTTP__)
Boolean(window.__GG_KIT_DOM__)
```

The report should show the site build ID, the loaded scripts, and an empty or explainable `missingSelectors` list.

## Report

Include:

- Browser and userscript manager.
- Passed/failed checks.
- Full console errors.
- `__GG_DIAGNOSTICS__.report()` output.
- Screenshots for layout issues.
- Whether a failure occurs with one script or all five.
