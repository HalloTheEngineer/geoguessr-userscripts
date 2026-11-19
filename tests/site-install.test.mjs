import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Window } from "happy-dom";

const app = fs.readFileSync("site/app.js", "utf8");

function render(markerVersion, currentVersion = "2026.11.19.7") {
  const dom = new Window({ url: "https://hallotheengineer.github.io/geoguessr-userscripts/" });
  Object.assign(globalThis, {
    window: dom,
    document: dom.document,
    localStorage: dom.localStorage,
  });
  if (markerVersion) {
    dom.localStorage.setItem(
      "gg-toolkit.installed.v1.better-game-history",
      JSON.stringify({ version: markerVersion }),
    );
  }
  dom.document.body.innerHTML = `
    <article data-script="better-game-history" data-script-version="${currentVersion}">
      <a data-install-button href="geoguessr-better-game-history.user.js">Install</a>
    </article>`;
  new Function(app)();
  return dom.document.querySelector("[data-install-button]");
}

test("site install button shows INSTALLED for current versions", () => {
  const button = render("2026.11.19.7");
  assert.equal(button.textContent, "INSTALLED");
  assert.equal(button.getAttribute("href"), null);
  assert.equal(button.getAttribute("aria-disabled"), "true");
});

test("site install button shows UPDATE for outdated versions", () => {
  const button = render("2026.11.18.1");
  assert.equal(button.textContent, "UPDATE");
  assert.equal(button.getAttribute("href"), "geoguessr-better-game-history.user.js");
});

test("site install button shows Install without a marker", () => {
  const button = render(null);
  assert.equal(button.textContent, "Install");
});

test("site install status updates when a marker appears after load", async () => {
  const dom = new Window({ url: "https://hallotheengineer.github.io/geoguessr-userscripts/" });
  Object.assign(globalThis, {
    window: dom,
    document: dom.document,
    localStorage: dom.localStorage,
  });
  dom.document.body.innerHTML = `
    <article data-script="better-game-history" data-script-version="2026.11.19.10">
      <a data-install-button href="geoguessr-better-game-history.user.js">Install</a>
    </article>`;
  new Function(app)();
  const button = dom.document.querySelector("[data-install-button]");
  assert.equal(button.textContent, "Install");
  dom.localStorage.setItem(
    "gg-toolkit.installed.v1.better-game-history",
    JSON.stringify({ version: "2026.11.19.10" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(button.textContent, "INSTALLED");
});
