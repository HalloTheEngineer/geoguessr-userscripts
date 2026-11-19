import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Window } from "happy-dom";

const bundle = fs.readFileSync(
  "packages/better-game-history/dist/geoguessr-better-game-history.user.js",
  "utf8",
);

test("Better Game History mounts account-scoped history and graph access", async () => {
  const dom = new Window({ url: "https://www.geoguessr.com/" });
  Object.assign(globalThis, {
    window: dom,
    document: dom.document,
    location: dom.location,
    history: dom.history,
    localStorage: dom.localStorage,
    sessionStorage: dom.sessionStorage,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    Node: dom.Node,
    MutationObserver: dom.MutationObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
  });
  dom.localStorage.setItem("gg.persistent-game-summary.history", "old");
  dom.localStorage.setItem(
    "gg.better-game-history.history",
    JSON.stringify({
      v: 2,
      data: [
        {
          gameId: "game-1",
          userId: "account-user",
          time: "2026-11-19T12:00:00.000Z",
          modeKey: "Duels",
          mode: "Moving",
          isRated: true,
          isTeamDuel: false,
          opponent: "Rival",
          opponentId: "rival-user",
          win: true,
          ratingBefore: 1000,
          ratingAfter: 1020,
          ratingChange: 20,
          hydration: { state: "ok", attempts: 1 },
          updatedAt: "2026-11-19T12:01:00.000Z",
          source: "hydration",
        },
      ],
    }),
  );
  dom.document.head.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    {
      props: { accountProps: { account: { user: { userId: "account-user" } } } },
    },
  )}</script>`;
  dom.document.body.innerHTML = `
    <dialog open data-settings-panel>
      <div><div role="tablist"><button role="tab">General</button></div></div>
      <div><div role="tabpanel">Native</div></div>
    </dialog>`;
  dom.HTMLCanvasElement.prototype.getContext = () => null;
  dom.window.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/api/v4/feed/private")) {
      return new Response(JSON.stringify({ entries: [], paginationToken: null }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  new Function(bundle)();
  await new Promise((resolve) => setTimeout(resolve, 180));

  assert.equal(dom.localStorage.getItem("gg.persistent-game-summary.history"), null);
  assert.ok(dom.document.getElementById("bgh-history-drawer-root"));
  assert.match(dom.document.getElementById("bgh-history-scroll-area")?.textContent || "", /Rival/);
  assert.ok(dom.window.__GG_KIT_SETTINGS__.registrations.has("better-game-history"));

  dom.window.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "g", altKey: true }));
  assert.ok(dom.document.getElementById("bgh-history-graph"));
});
