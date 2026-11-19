import assert from "node:assert/strict";
import test from "node:test";
import { makeDevVersion } from "../tooling/build-userscript.mjs";

test("dev versions sort above the current release", () => {
  const stamp = new Date("2026-11-18T21:05:06Z");
  assert.equal(makeDevVersion("0.15.1", stamp), "0.15.2-dev.20261118210506");
  assert.equal(makeDevVersion("2026.11.18", stamp), "2026.11.19-dev.20261118210506");
});

function compareVersions(left, right) {
  const parse = (value) => {
    const [core, prerelease = ""] = value.split("-");
    return { core: core.split(".").map(Number), prerelease };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index++) {
    const delta = (a.core[index] || 0) - (b.core[index] || 0);
    if (delta) return delta;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

test("the following stable patch sorts above its dev prerelease", () => {
  const stamp = new Date("2026-11-18T21:05:06Z");
  const dev = makeDevVersion("1.4.9", stamp);
  assert.equal(dev, "1.4.10-dev.20261118210506");
  assert.ok(compareVersions("1.4.10", dev) > 0);
  assert.ok(compareVersions(dev, "1.4.9") > 0);
});
