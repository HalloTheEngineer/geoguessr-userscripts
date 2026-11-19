import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://www.geoguessr.com/user/605cb28fdc80d50001eeca89" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  location: dom.location,
  localStorage: dom.localStorage,
  sessionStorage: dom.sessionStorage,
});

const { createNameStore } = await import("../src/names.js");

test("profile visits populate the persistent player name map", () => {
  localStorage.clear();
  document.head.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        userProfile: {
          user: { userId: "605cb28fdc80d50001eeca89", nick: "VisitedPlayer" },
        },
      },
    },
  })}</script>`;
  const names = createNameStore();
  names.captureVisitedProfile();
  assert.equal(names.nameFor("605cb28fdc80d50001eeca89"), "VisitedPlayer");
  assert.equal(names.nameFor("abcdef1234567890"), "#567890");
  names.dispose();

  const reloaded = createNameStore();
  assert.equal(reloaded.nameFor("605cb28fdc80d50001eeca89"), "VisitedPlayer");
  reloaded.dispose();
});

test("records ignore IDs and keep explicit nicknames", () => {
  localStorage.clear();
  const names = createNameStore();
  names.record("605cb28fdc80d50001eeca89", "605cb28fdc80d50001eeca89");
  assert.equal(names.nameFor("605cb28fdc80d50001eeca89"), "#eeca89");
  names.record("605cb28fdc80d50001eeca89", "RealNick");
  assert.equal(names.nameFor("605cb28fdc80d50001eeca89"), "RealNick");
  assert.equal(names.nameFor("605cb28fdc80d50001eeca89", "FallbackNick"), "FallbackNick");
  names.dispose();
});

test("missing names can be resolved asynchronously without blocking", async () => {
  localStorage.clear();
  dom.window.fetch = (async () =>
    new Response(JSON.stringify({ nick: "AsyncNick" }), {
      status: 200,
    })) as typeof dom.window.fetch;
  const names = createNameStore();
  names.resolve(["abcdef1234567890"]);
  assert.equal(names.nameFor("abcdef1234567890"), "#567890");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(names.nameFor("abcdef1234567890"), "AsyncNick");
  names.dispose();
});
