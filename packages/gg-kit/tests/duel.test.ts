import assert from "node:assert/strict";
import test from "node:test";
import {
  decodePanoId,
  encodeDuelPinFrame,
  encodeDuelPinPayload,
  hexToBytes,
  parseDuelJsonEvent,
  parseDuelStateEvent,
} from "../src/duel.js";

const GAME_ID = "6adb565aec0f96a4c98a464f";
const GOLDEN_FRAME_37 = Buffer.from(
  "056adb565aec0f96a4c98a464f0000000002002a427a168ca0f764cd05414a648bc17b6033",
  "hex",
);

test("hexToBytes validates input", () => {
  assert.deepEqual(Array.from(hexToBytes(GAME_ID)!.slice(0, 4)), [0x6a, 0xdb, 0x56, 0x5a]);
  assert.equal(hexToBytes("abc"), null);
  assert.equal(hexToBytes("zz"), null);
});

test("encodeDuelPinFrame reproduces captured client bytes", () => {
  const frame = encodeDuelPinFrame({
    gameIdHex: GAME_ID,
    round: 2,
    timestampMs: 1792759435126.3,
    lat: 12.64954662322998,
    lng: -15.710986137390137,
    headerType: 0x05,
  })!;
  assert.equal(frame.length, 37);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  assert.equal(view.getUint8(0), 0x05);
  assert.equal(frame[17], 2);
  assert.equal(view.getUint16(18, false), 17);
  for (let index = 0; index < 18; index++) assert.equal(frame[index], GOLDEN_FRAME_37[index]);
  for (let index = 0; index < 17; index++)
    assert.equal(frame[20 + index], GOLDEN_FRAME_37[20 + index]);
});

test("encodeDuelPinPayload matches captured round payload", () => {
  const payload = encodeDuelPinPayload({
    timestampMs: 1792759435126.3,
    lat: 12.64954662322998,
    lng: -15.710986137390137,
  });
  assert.equal(
    Buffer.from(payload).toString("hex"),
    Buffer.from(GOLDEN_FRAME_37.subarray(20)).toString("hex"),
  );
});

test("parseDuelJsonEvent classifies lifecycle events", () => {
  assert.deepEqual(
    parseDuelJsonEvent(
      JSON.stringify({ code: "DuelStarted", duel: { state: { currentRoundNumber: 1 } } }),
    ),
    {
      code: "DuelStarted",
      kind: "round-start",
      round: 1,
    },
  );
  assert.deepEqual(parseDuelJsonEvent(JSON.stringify({ code: "DuelFinished" })), {
    code: "DuelFinished",
    kind: "finished",
    round: null,
  });
  assert.deepEqual(parseDuelJsonEvent(JSON.stringify({ code: "RoundStarted" })), {
    code: "RoundStarted",
    kind: "round-start",
    round: null,
  });
  assert.equal(parseDuelJsonEvent("not json"), null);
});

test("parseDuelStateEvent normalizes location and options", () => {
  const message = JSON.stringify({
    code: "DuelNewRound",
    gameId: GAME_ID,
    duel: {
      state: {
        currentRoundNumber: 2,
        options: { isRated: true, isTeamDuels: false, gameContext: "duel" },
        rounds: [{}, { roundNumber: 2, panorama: { panoId: "616263", lat: 1.5, lng: -2.5 } }],
      },
    },
  });
  const state = parseDuelStateEvent(message)!;
  assert.equal(state.roundNumber, 2);
  assert.equal(state.lat, 1.5);
  assert.equal(state.lng, -2.5);
  assert.equal(state.panoId, "abc");
  assert.equal(state.isRated, true);
  assert.equal(state.hasLocation, true);
});

test("decodePanoId handles hex and plain ids", () => {
  assert.equal(decodePanoId("616263"), "abc");
  assert.equal(decodePanoId("abc"), "abc");
  assert.equal(decodePanoId(null), null);
});
