import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://www.geoguessr.com/game/abc" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  location: dom.location,
  HTMLElement: dom.HTMLElement,
  Element: dom.Element,
  MutationObserver: dom.MutationObserver,
  getComputedStyle: dom.getComputedStyle.bind(dom),
  localStorage: dom.localStorage,
  sessionStorage: dom.sessionStorage,
});

const kit = await import("../src/index.js");

test("selector registry resolves prefix and data-qa selectors", () => {
  document.body.innerHTML = `
    <div data-qa="game-controls"></div>
    <div class="game-menu_settingsContainer__abc12"></div>
    <div data-qa="guess-map"><div data-qa="guess-map-canvas"></div></div>
    <button data-qa="perform-guess"></button>
  `;
  assert.ok(kit.query("game.controls") instanceof dom.HTMLElement);
  assert.ok(kit.query("game.settingsRoot") instanceof dom.HTMLElement);
  assert.ok(kit.query("guessMap.canvas") instanceof dom.HTMLElement);
  assert.ok(kit.query("guessMap.submit") instanceof dom.HTMLElement);
  assert.equal(kit.health().find((item) => item.key === "game.settingsOptions")?.ok, false);
});

test("classToken returns the full native class", () => {
  document.body.innerHTML = `<div class="button_button__HOmVR other"></div>`;
  assert.equal(kit.classToken("button_button__"), "button_button__HOmVR");
});

test("waitFor resolves a future element", async () => {
  document.body.innerHTML = "";
  const pending = kit.waitFor('[data-qa="game-controls"]', { timeout: 1000 });
  setTimeout(() => {
    document.body.innerHTML = `<div data-qa="game-controls"></div>`;
  }, 10);
  assert.ok(await pending);
});

test("page helpers identify routes", () => {
  assert.equal(kit.pageKind("/duels/abc/summary"), "summary");
  assert.equal(kit.pageKind("/game/abc"), "game");
  assert.equal(kit.gameId("/game/abc"), "abc");
  assert.equal(kit.isDuelPage("/team-duels/abc"), true);
  assert.equal(kit.duelSummaryPath("abc"), "/duels/abc/summary");
  assert.equal(kit.duelSummaryPath("abc", true), "/team-duels/abc/summary");
});

test("currentUserId ignores the viewed profile user", () => {
  document.head.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      accountProps: { account: { user: { userId: "account-user" } } },
      pageProps: { user: { userId: "profile-user" } },
    },
  })}</script>`;
  assert.equal(kit.currentUserId(), "account-user");

  document.head.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { user: { userId: "profile-user" } } },
  })}</script>`;
  assert.equal(kit.currentUserId(), null);
});

test("waitForCurrentUserId resolves once account data appears", async () => {
  document.head.innerHTML = "";
  const pending = kit.waitForCurrentUserId({ timeoutMs: 500, intervalMs: 5 });
  setTimeout(() => {
    document.head.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { accountProps: { account: { user: { userId: "late-user" } } } },
    })}</script>`;
  }, 15);
  assert.equal(await pending, "late-user");
});

test("waitForCurrentUserId can be aborted", async () => {
  document.head.innerHTML = "";
  const controller = new AbortController();
  const pending = kit.waitForCurrentUserId({
    timeoutMs: 500,
    intervalMs: 5,
    signal: controller.signal,
  });
  controller.abort();
  assert.equal(await pending, null);
});

test("siteBuild prefers __NEXT_DATA__ and ignores static chunk folders", () => {
  document.head.innerHTML =
    '<script id="__NEXT_DATA__" type="application/json">{"buildId":"1.9087-481401b"}</script>';
  assert.equal(kit.siteBuild(), "1.9087-481401b");

  document.head.innerHTML = '<script src="/_next/static/chunks/main-26bff4f0ec75d3df.js"></script>';
  assert.equal(kit.siteBuild(), null);

  document.head.innerHTML =
    '<script src="/_next/static/1.9087-481401b/_buildManifest.js"></script>';
  assert.equal(kit.siteBuild(), "1.9087-481401b");
});

test("checkSiteBuild ignores a legacy invalid build value", () => {
  localStorage.setItem("gg-kit.last-site-build", "chunks");
  document.head.innerHTML =
    '<script id="__NEXT_DATA__" type="application/json">{"buildId":"1.9087-481401b"}</script>';
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    const result = kit.checkSiteBuild();
    assert.equal(result.changed, false);
    assert.equal(result.previous, null);
    assert.equal(localStorage.getItem("gg-kit.last-site-build"), "1.9087-481401b");
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = originalWarn;
  }
});

test("checkSiteBuild warns once for a real build change", () => {
  localStorage.setItem("gg-kit.last-site-build", "1.9000-old");
  document.head.innerHTML =
    '<script id="__NEXT_DATA__" type="application/json">{"buildId":"1.9087-481401b"}</script>';
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    assert.equal(kit.checkSiteBuild().changed, true);
    assert.equal(kit.checkSiteBuild().changed, false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /build changed/);
  } finally {
    console.warn = originalWarn;
  }
});
