# gg-kit

Shared GeoGuessr userscript library. It is bundled into each `dist/*.user.js` artifact with esbuild; there is no runtime `@require` dependency.

## Entry points

```ts
import {
  defineConfig,
  startUserscript,
  registerSettings,
  SELECTORS,
  query,
  queryAll,
  waitFor,
  onDomChange,
  pageKind,
  siteBuild,
  currentUserId,
  feedPage,
  duel,
  onJsonMessage,
  onSendMessage,
  encodeDuelPinFrame,
  createListStore,
  injectStyle,
  registerScript,
  checkSiteBuild,
} from "gg-kit";
```

## Settings

Each script defines a config schema and registers one or more sections. The kit owns the shared **Userscripts** native tab, its script sub-tabs, native class detection, controls, reset, and disposal.

## Safety

- DOM helpers return `null`/empty arrays instead of throwing when the DOM is not ready.
- The fetch and WebSocket hooks are installed once per page window and reused by every bundled script.
- No runtime network requests are made on import.
- No credentials, cookies, or tokens are stored by the library.

## Tests

```bash
npm run test:kit
npm run typecheck
```
