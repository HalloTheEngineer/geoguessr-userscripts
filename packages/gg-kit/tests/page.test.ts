import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://www.geoguessr.com/" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  location: dom.location,
});

const { currentUserId, fetchCurrentUserId, siteBuild, waitForCurrentUserId } = await import(
  "../src/page.js"
);

test("waitForCurrentUserId falls back to the profile API when __NEXT_DATA__ is gone", async () => {
  const calls: string[] = [];
  dom.window.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url === "/api/v3/profiles/") {
      return new Response(
        JSON.stringify({ payload: { user: { id: "user-42", nick: "Tester" } } }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  }) as typeof dom.window.fetch;

  const id = await waitForCurrentUserId({ timeoutMs: 2000 });
  assert.equal(id, "user-42");
  assert.ok(calls.includes("/api/v3/profiles/"));
  assert.equal(currentUserId(), "user-42");
});

test("the fetched account id is cached for synchronous lookups", async () => {
  const id = await fetchCurrentUserId();
  assert.equal(id, "user-42");
  assert.equal(currentUserId(), "user-42");
});

test("siteBuild falls back to the SPA entry bundle hash", () => {
  dom.document.head.innerHTML = '<script src="/static/_start/index-BGzclomL.js"></script>';
  assert.equal(siteBuild(), "BGzclomL");
});
