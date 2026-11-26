import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Window } from "happy-dom";

const bundle = fs.readFileSync(
  "packages/better-game-history/dist/geoguessr-better-game-history.user.js",
  "utf8",
);

test("Better Game History mounts without __NEXT_DATA__ by using the profile API", async () => {
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
  const now = Date.now();
  dom.localStorage.setItem(
    "gg.better-game-history.history",
    JSON.stringify({
      v: 2,
      data: [
        {
          gameId: "game-1",
          userId: "account-user",
          time: new Date(now - 3_600_000).toISOString(),
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
          updatedAt: new Date(now - 3_540_000).toISOString(),
          source: "hydration",
        },
      ],
    }),
  );
  dom.HTMLCanvasElement.prototype.getContext = () => null;
  const requests = [];
  dom.window.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    if (url === "/api/v3/profiles/") {
      return new Response(
        JSON.stringify({ payload: { user: { id: "account-user", nick: "Me" } } }),
        { status: 200 },
      );
    }
    if (url.includes("/api/v4/feed/private")) {
      return new Response(JSON.stringify({ entries: [], paginationToken: null }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  new Function(bundle)();
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.ok(requests.includes("/api/v3/profiles/"));
  const drawer = dom.document.getElementById("bgh-history-drawer-root");
  assert.ok(drawer);
  assert.match(dom.document.getElementById("bgh-history-scroll-area")?.textContent || "", /Rival/);
});
