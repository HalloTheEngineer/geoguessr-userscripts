import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://www.geoguessr.com/" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  location: dom.location,
  localStorage: dom.localStorage,
});

const { checkSiteBuild } = await import("../src/diagnostics.js");

function entry(hash: string): void {
  dom.document.head.innerHTML = `<script src="/static/_start/index-${hash}.js"></script>`;
}

test("legacy build ids do not trigger a change warning", () => {
  dom.localStorage.setItem("gg-kit.last-site-build", "1.9112-cd3b819");
  entry("BGzclomL");
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    const result = checkSiteBuild();
    assert.equal(result.build, "BGzclomL");
    assert.equal(result.changed, false);
    assert.deepEqual(warnings, []);
    assert.equal(dom.localStorage.getItem("gg-kit.last-site-build"), "spa:BGzclomL");
  } finally {
    console.warn = original;
  }
});

test("a changed build within the same scheme warns once", () => {
  entry("NewHash1");
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    const first = checkSiteBuild();
    assert.equal(first.changed, true);
    assert.equal(first.previous, "BGzclomL");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /BGzclomL -> NewHash1/);

    const second = checkSiteBuild();
    assert.equal(second.changed, false);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = original;
  }
});
