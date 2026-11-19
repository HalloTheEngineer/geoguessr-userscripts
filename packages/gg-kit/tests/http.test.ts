import assert from "node:assert/strict";
import test from "node:test";

let captured = "";
globalThis.fetch = (async (input: RequestInfo | URL) => {
  captured = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new Response(JSON.stringify({ entries: [], paginationToken: null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const { feedPage, mockFetch } = await import("../src/http.js");

test("feedPage URL-encodes pagination tokens", async () => {
  await feedPage("abc+/= xyz");
  assert.match(captured, /paginationToken=abc%2B%2F%3D\+xyz/);
  assert.match(captured, /^\/api\/v4\/feed\/private/);
});

test("mockFetch intercepts matching requests", async () => {
  const remove = mockFetch("/api/duels/ongoing", () => new Response(null, { status: 204 }));
  const response = await fetch("/api/duels/ongoing", { method: "DELETE" });
  assert.equal(response.status, 204);
  remove();
  await feedPage();
  assert.match(captured, /\/api\/v4\/feed\/private/);
});
