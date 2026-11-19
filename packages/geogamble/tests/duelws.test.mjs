import assert from "node:assert/strict";
import test from "node:test";
import { loadCore } from "./helpers.mjs";

const { Core, CONFIG, COUNTRY_DATA } = loadCore();

// Ground truth bytes from the captured duel (www.geoguessr.com.har).
// Example gameId: 6adb565aec0f96a4c98a464f.
const DUEL_GAME_ID = "6adb565aec0f96a4c98a464f";
// First 37 bytes of the real client's round-2 pin frame (header + one pin sample).
const GOLDEN_FRAME_37 = Buffer.from(
  "056adb565aec0f96a4c98a464f0000000002002a427a168ca0f764cd05414a648bc17b6033",
  "hex",
);
const GOLDEN_ROUND = 2;
const GOLDEN_TIMESTAMP = 1792759435126.3;
const GOLDEN_LAT = 12.64954662322998;
const GOLDEN_LNG = -15.710986137390137;
// Round-1 and round-3 pin sample payloads sent by the client.
const GOLDEN_R1_SAMPLE = "427a168c98ac64000540a6b67b42e762c3";
const GOLDEN_R3_SAMPLE = "427a168ca6ecde6605c1c83848c281d411";

test("encodeDuelPinFrame reproduces the real client pin frame byte for byte", () => {
  const frame = Core.encodeDuelPinFrame({
    gameIdHex: DUEL_GAME_ID,
    round: GOLDEN_ROUND,
    timestampMs: GOLDEN_TIMESTAMP,
    lat: GOLDEN_LAT,
    lng: GOLDEN_LNG,
    headerType: 0x05,
  });
  assert.ok(frame instanceof Uint8Array);
  assert.equal(frame.length, 37);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  assert.equal(view.getUint8(0), 0x05);
  assert.equal(frame[17], GOLDEN_ROUND);
  assert.equal(view.getUint16(18, false), 17); // single-sample payload
  assert.equal(view.getFloat64(20, false), GOLDEN_TIMESTAMP);
  assert.equal(view.getUint8(28), 0x05); // pin sample type
  // The real frame batched a second sample (payload length 42), so everything
  // before the length field and the pin sample bytes must match exactly.
  for (let i = 0; i < 18; i++) {
    assert.equal(frame[i], GOLDEN_FRAME_37[i], `header byte ${i} mismatch`);
  }
  for (let i = 0; i < 17; i++) {
    assert.equal(frame[20 + i], GOLDEN_FRAME_37[20 + i], `sample byte ${i} mismatch`);
  }
});

test("encodeDuelPinPayload matches the captured round 1 and round 3 pins", () => {
  const payload = Core.encodeDuelPinPayload({
    timestampMs: GOLDEN_TIMESTAMP,
    lat: GOLDEN_LAT,
    lng: GOLDEN_LNG,
  });
  assert.equal(payload.length, 17);
  assert.equal(
    Buffer.from(payload).toString("hex"),
    Buffer.from(GOLDEN_FRAME_37.subarray(20)).toString("hex"),
  );

  const round1 = Core.encodeDuelPinPayload({
    timestampMs: 1792759401158.25,
    lat: 5.209775447845459,
    lng: 115.6928939819336,
  });
  assert.equal(Buffer.from(round1).toString("hex"), GOLDEN_R1_SAMPLE);

  const round3 = Core.encodeDuelPinPayload({
    timestampMs: 1792759459533.9,
    lat: -25.027481079101562,
    lng: -64.91419219970703,
  });
  assert.equal(Buffer.from(round3).toString("hex"), GOLDEN_R3_SAMPLE);
});

test("encodeDuelPinFrame clamps rounds and validates the gameId", () => {
  const frame = Core.encodeDuelPinFrame({
    gameIdHex: DUEL_GAME_ID,
    round: 999,
    timestampMs: 0,
    lat: 0,
    lng: 0,
  });
  assert.equal(frame.length, 37);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  assert.equal(view.getUint8(17), 255);
  assert.equal(view.getUint8(0), 0x03);

  assert.equal(
    Core.encodeDuelPinFrame({ gameIdHex: "0a2b", timestampMs: 0, lat: 0, lng: 0 }),
    null,
  );
  assert.equal(Core.encodeDuelPinFrame({ gameIdHex: "zz", timestampMs: 0, lat: 0, lng: 0 }), null);
  assert.equal(
    Core.encodeDuelPinFrame({ gameIdHex: undefined, timestampMs: 0, lat: 0, lng: 0 }),
    null,
  );
  assert.equal(Core.hexToBytes("abc"), null);
  assert.equal(Core.hexToBytes("zz"), null);
  assert.equal(Core.hexToBytes("6adb565aec0f96a4c98a46g"), null);
  assert.deepEqual(Array.from(Core.hexToBytes(DUEL_GAME_ID).slice(0, 4)), [0x6a, 0xdb, 0x56, 0x5a]);
});

test("parseDuelJsonEvent classifies duel lifecycle events", () => {
  const started = Core.parseDuelJsonEvent(
    JSON.stringify({ code: "DuelStarted", duel: { state: { currentRoundNumber: 1 } } }),
  );
  assert.deepEqual(started, { code: "DuelStarted", kind: "round-start", round: 1 });

  const newRound = Core.parseDuelJsonEvent(
    JSON.stringify({ code: "DuelNewRound", duel: { state: { currentRoundNumber: 3 } } }),
  );
  assert.deepEqual(newRound, { code: "DuelNewRound", kind: "round-start", round: 3 });

  const timedOut = Core.parseDuelJsonEvent(JSON.stringify({ code: "DuelRoundTimedOut" }));
  assert.deepEqual(timedOut, { code: "DuelRoundTimedOut", kind: "round-end" });

  const finished = Core.parseDuelJsonEvent(JSON.stringify({ code: "DuelFinished" }));
  assert.deepEqual(finished, { code: "DuelFinished", kind: "round-end" });

  const other = Core.parseDuelJsonEvent(JSON.stringify({ code: "HeartBeat" }));
  assert.deepEqual(other, { code: "HeartBeat", kind: "other" });
  assert.equal(Core.parseDuelJsonEvent("not json"), null);
  assert.equal(Core.parseDuelJsonEvent(JSON.stringify({ noCode: true })), null);
  assert.equal(Core.parseDuelJsonEvent(null), null);
  assert.equal(Core.parseDuelJsonEvent(42), null);
});

test("duel submit configuration resolves the documented defaults", () => {
  const defaults = Core.resolveConfig(CONFIG, COUNTRY_DATA).settings;
  assert.equal(defaults.duelSubmitPin, true);
  assert.equal(defaults.duelSubmitHop, false);

  assert.equal(
    Core.resolveConfig({ ...CONFIG, duelSubmitPin: false }, COUNTRY_DATA).settings.duelSubmitPin,
    false,
  );
  assert.equal(
    Core.resolveConfig({ ...CONFIG, duelSubmitHop: true }, COUNTRY_DATA).settings.duelSubmitHop,
    true,
  );
  assert.equal(
    Core.resolveConfig({ ...CONFIG, duelSubmitPin: 0 }, COUNTRY_DATA).settings.duelSubmitPin,
    false,
  );
  assert.equal(
    Core.resolveConfig({ ...CONFIG, duelSubmitHop: "yes" }, COUNTRY_DATA).settings.duelSubmitHop,
    false,
  );
});

test("gate exposes the final gamble point before the gamble starts", () => {
  const { settings, index } = Core.resolveConfig(CONFIG, COUNTRY_DATA);
  const points = [];
  const starts = [];
  const original = {
    latLng: { lat: () => 48.8566, lng: () => 2.3522 },
    domEvent: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
    pixel: { x: 1, y: 2 },
    jj: { x: 1, y: 2 },
    stop() {},
  };
  const map = { __e3_: { click: { a: { zo() {} } } } };
  function trigger(mapArg, event) {
    for (const entry of Object.values(mapArg.__e3_.click)) entry.zo(event);
  }
  const gate = Core.createClickGate({
    map,
    settings,
    index,
    onStart: (info) => starts.push(info),
    onGamblePoint: (point) => points.push(point),
    trigger,
    canStart: () => true,
  });
  for (const entry of Object.values(map.__e3_.click)) entry.zo = gate.wrap(entry.zo);

  trigger(map, original);
  assert.equal(points.length, 1);
  assert.equal(starts.length, 1);
  assert.equal(points[0], starts[0].finalPoint);
  assert.equal(starts[0].hit.country.iso, "fr");

  gate.finish(Core.makeFinalEvent(original, { lat: () => 41.9, lng: () => 12.5 }));
  assert.equal(gate.isActive(), false);

  trigger(map, original);
  assert.equal(points.length, 2);
  assert.equal(starts.length, 2);
});

test("gate survives a throwing onGamblePoint callback", () => {
  const { settings, index } = Core.resolveConfig(CONFIG, COUNTRY_DATA);
  const starts = [];
  const original = {
    latLng: { lat: () => 48.8566, lng: () => 2.3522 },
    domEvent: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
    pixel: { x: 1, y: 2 },
    jj: { x: 1, y: 2 },
    stop() {},
  };
  const map = { __e3_: { click: { a: { zo() {} } } } };
  function trigger(mapArg, event) {
    for (const entry of Object.values(mapArg.__e3_.click)) entry.zo(event);
  }
  const gate = Core.createClickGate({
    map,
    settings,
    index,
    onStart: (info) => starts.push(info),
    onGamblePoint: () => {
      throw new Error("bridge down");
    },
    trigger,
    canStart: () => true,
  });
  for (const entry of Object.values(map.__e3_.click)) entry.zo = gate.wrap(entry.zo);

  assert.doesNotThrow(() => trigger(map, original));
  assert.equal(starts.length, 1);
  assert.equal(gate.isActive(), true);
});
