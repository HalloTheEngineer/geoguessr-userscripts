import assert from "node:assert/strict";
import test from "node:test";
import { createScheduler, loadCore, seededRandom } from "./helpers.mjs";

const { Core, CONFIG, COUNTRY_DATA } = loadCore();
const { settings, index } = Core.resolveConfig(
  { ...CONFIG, animationMs: 500, startIntervalMs: 20, endIntervalMs: 100, finalHoldMs: 50 },
  COUNTRY_DATA,
);
const france = index.byIso.get("fr");
const finalPoint = Core.randomPointInCountry(france, seededRandom(7));

function run(options = {}) {
  const scheduler = createScheduler();
  const state = { ticks: [], errors: [], done: 0, scheduler, animation: null };
  state.animation = Core.runAnimation({
    country: france,
    finalPoint,
    settings,
    onTick: (point, progress, tickIndex) => {
      state.ticks.push({ point, progress, index: tickIndex });
      if (options.onTick) options.onTick(point, progress, tickIndex, state);
    },
    onDone: () => {
      state.done++;
      if (options.onDone) options.onDone(state);
    },
    onError: (error) => {
      state.errors.push(error);
      if (options.onError) options.onError(error, state);
    },
    isAlive: options.isAlive || (() => true),
    setTimeoutFn: scheduler.setTimeout,
    clearTimeoutFn: scheduler.clearTimeout,
  });
  return state;
}

test("animation ticks decelerate and finish with the final point", () => {
  const result = run();
  assert.equal(result.ticks.length, 1);
  assert.equal(result.done, 0);
  assert.ok(result.scheduler.pending > 0);

  result.scheduler.advance(settings.animationMs + settings.finalHoldMs);
  const schedule = Core.buildSchedule(
    settings.animationMs,
    settings.startIntervalMs,
    settings.endIntervalMs,
  );
  assert.equal(result.ticks.length, schedule.length);
  assert.equal(result.done, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.ticks[0].progress, 0);
  assert.equal(result.ticks.at(-1).progress, 1);
  assert.deepEqual(result.ticks.at(-1).point, finalPoint);
  assert.equal(result.ticks.at(-1).index, schedule.length - 1);
  assert.equal(result.scheduler.pending, 0);
});

test("cancel stops future ticks and completion", () => {
  const result = run();
  result.animation.cancel();
  result.scheduler.advance(settings.animationMs + settings.finalHoldMs);
  assert.equal(result.ticks.length, 1);
  assert.equal(result.done, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(result.scheduler.pending, 0);
});

test("an unavailable map fails before the first tick", () => {
  const result = run({ isAlive: () => false });
  assert.equal(result.ticks.length, 0);
  assert.equal(result.done, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /map unavailable/);
  assert.equal(result.scheduler.pending, 0);
});

test("a map that disappears mid-animation fails without completing", () => {
  let alive = true;
  const result = run({
    isAlive: () => alive,
    onTick: () => {
      alive = false;
    },
  });
  result.scheduler.advance(settings.animationMs + settings.finalHoldMs);
  assert.equal(result.ticks.length, 1);
  assert.equal(result.done, 0);
  assert.equal(result.errors.length, 1);
});

test("a map that disappears during the final hold fails without completing", () => {
  let alive = true;
  const result = run({
    isAlive: () => alive,
    onTick: (_point, progress) => {
      if (progress === 1) alive = false;
    },
  });
  result.scheduler.advance(settings.animationMs + settings.finalHoldMs);
  assert.equal(result.done, 0);
  assert.equal(result.errors.length, 1);
});

test("tick errors are reported once", () => {
  let count = 0;
  const result = run({
    onTick: () => {
      count++;
      if (count === 2) throw new Error("tick failed");
    },
  });
  result.scheduler.advance(settings.animationMs + settings.finalHoldMs);
  assert.equal(result.ticks.length, 2);
  assert.equal(result.done, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /tick failed/);
  assert.equal(result.scheduler.pending, 0);
});

test("shouldSkipAnimation only triggers at full center bias", () => {
  assert.equal(Core.shouldSkipAnimation(1), true);
  assert.equal(Core.shouldSkipAnimation("1"), true);
  assert.equal(Core.shouldSkipAnimation(2), true);
  assert.equal(Core.shouldSkipAnimation(0.95), false);
  assert.equal(Core.shouldSkipAnimation(0), false);
  assert.equal(Core.shouldSkipAnimation(undefined), false);
  assert.equal(Core.shouldSkipAnimation("bad"), false);
});
