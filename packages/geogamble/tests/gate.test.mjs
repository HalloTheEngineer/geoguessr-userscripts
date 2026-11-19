import assert from "node:assert/strict";
import test from "node:test";
import { loadCore } from "./helpers.mjs";

const { Core, CONFIG, COUNTRY_DATA } = loadCore();
const { settings, index } = Core.resolveConfig(CONFIG, COUNTRY_DATA);

function makeEvent(lat, lng, domEvent = {}) {
  return {
    latLng: { lat: () => lat, lng: () => lng },
    domEvent: {
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      ...domEvent,
    },
    pixel: { x: 1, y: 2 },
    jj: { x: 1, y: 2 },
    stop() {
      this.stopped = true;
    },
  };
}

function makeMap() {
  const calls = [];
  const handlers = {
    a(event) {
      calls.push({ handler: "a", lat: event.latLng.lat(), lng: event.latLng.lng(), event });
    },
    b(event) {
      calls.push({ handler: "b", lat: event.latLng.lat(), lng: event.latLng.lng(), event });
    },
  };
  const map = {
    __e3_: {
      click: {
        a: { zo: handlers.a },
        b: { zo: handlers.b },
      },
    },
  };
  return { map, calls, handlers };
}

function trigger(map, event) {
  for (const entry of Object.values(map.__e3_.click)) entry.zo(event);
}

function makeGate(map, options = {}) {
  const starts = [];
  const finishes = [];
  const gate = Core.createClickGate({
    map,
    settings,
    index,
    onStart: (info) => starts.push(info),
    onFinish: (info) => finishes.push(info),
    trigger,
    canStart: () => true,
    ...options,
  });
  for (const entry of Object.values(map.__e3_.click)) entry.zo = gate.wrap(entry.zo);
  return { gate, starts, finishes };
}

test("gate suppresses the original click and places one final click", () => {
  const { map, calls } = makeMap();
  const { gate, starts, finishes } = makeGate(map);
  const original = makeEvent(48.8566, 2.3522);

  trigger(map, original);
  assert.equal(calls.length, 0);
  assert.equal(starts.length, 1);
  assert.equal(gate.isActive(), true);
  assert.equal(starts[0].hit.country.iso, "fr");
  assert.ok(
    starts[0].hit.country.polygons.some((polygon) =>
      Core.polygonContains(starts[0].finalPoint.lat, starts[0].finalPoint.lng, polygon.rings),
    ),
  );

  trigger(map, makeEvent(48.8566, 2.3522));
  assert.equal(calls.length, 0);
  assert.equal(starts.length, 1);

  const finalLatLng = { lat: () => 41.9, lng: () => 12.5 };
  const finalEvent = Core.makeFinalEvent(original, finalLatLng, { x: 10, y: 20 }, { x: 10, y: 20 });
  assert.equal(gate.finish(finalEvent), true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.handler).sort(), ["a", "b"]);
  for (const call of calls) {
    assert.equal(call.lat, 41.9);
    assert.equal(call.lng, 12.5);
    assert.equal(call.event, finalEvent);
  }
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].originalEvent, original);
  assert.equal(gate.isActive(), false);
  assert.equal(gate.finish(finalEvent), false);
});

test("clicks outside enabled countries pass through", () => {
  const { map, calls } = makeMap();
  const { gate, starts } = makeGate(map);
  trigger(map, makeEvent(0, -30));
  assert.equal(calls.length, 2);
  assert.equal(starts.length, 0);
  assert.equal(gate.isActive(), false);
});

test("gate can be cancelled and started again", () => {
  const { map, calls } = makeMap();
  const { gate, starts } = makeGate(map);
  trigger(map, makeEvent(48.8566, 2.3522));
  assert.equal(gate.isActive(), true);
  gate.cancel();
  assert.equal(gate.isActive(), false);
  trigger(map, makeEvent(48.8566, 2.3522));
  assert.equal(starts.length, 2);
  assert.equal(gate.isActive(), true);
  gate.finish(
    Core.makeFinalEvent(makeEvent(48.8566, 2.3522), { lat: () => 41.9, lng: () => 12.5 }),
  );
  assert.equal(calls.length, 2);
});

test("fail-open releases the original event", () => {
  const { map, calls } = makeMap();
  const { gate } = makeGate(map);
  const original = makeEvent(48.8566, 2.3522);
  trigger(map, original);
  assert.equal(calls.length, 0);
  gate.failOpen(original);
  assert.equal(calls.length, 2);
  assert.equal(gate.isActive(), false);
});

test("activation key can require shift", () => {
  const { map, calls } = makeMap();
  const { gate, starts } = makeGate(map, { settings: { ...settings, activationKey: "shift" } });
  trigger(map, makeEvent(48.8566, 2.3522, { shiftKey: false }));
  assert.equal(calls.length, 2);
  assert.equal(starts.length, 0);

  trigger(map, makeEvent(48.8566, 2.3522, { shiftKey: true }));
  assert.equal(calls.length, 2);
  assert.equal(starts.length, 1);
  assert.equal(gate.isActive(), true);
  gate.cancel();
});

test("gate passes through malformed or disallowed starts", () => {
  const { map, calls } = makeMap();
  const { starts } = makeGate(map, { canStart: () => false });
  trigger(map, makeEvent(48.8566, 2.3522));
  assert.equal(calls.length, 2);
  assert.equal(starts.length, 0);

  const withoutDom = makeEvent(48.8566, 2.3522);
  delete withoutDom.domEvent;
  trigger(map, withoutDom);
  assert.equal(calls.length, 4);
  assert.equal(starts.length, 0);
});

test("a new gate can replace an old gate's wrappers", () => {
  const { map, calls } = makeMap();
  const first = makeGate(map);
  trigger(map, makeEvent(48.8566, 2.3522));
  assert.equal(first.gate.isActive(), true);
  first.gate.cancel();

  const second = makeGate(map);
  trigger(map, makeEvent(48.8566, 2.3522));
  assert.equal(second.starts.length, 1);
  assert.equal(second.gate.isActive(), true);
  assert.equal(calls.length, 0);

  second.gate.finish(
    Core.makeFinalEvent(makeEvent(48.8566, 2.3522), { lat: () => 41.9, lng: () => 12.5 }),
  );
  assert.equal(calls.length, 2);
  assert.equal(second.finishes.length, 1);
});

test("makeFinalEvent replaces the position and preserves the original event", () => {
  const original = makeEvent(48.8566, 2.3522);
  original.extra = "kept";
  const latLng = { lat: () => 41.9, lng: () => 12.5 };
  const finalEvent = Core.makeFinalEvent(original, latLng, { x: 10, y: 20 }, { x: 10, y: 20 });
  assert.notEqual(finalEvent, original);
  assert.equal(finalEvent.latLng, latLng);
  assert.equal(finalEvent.domEvent, original.domEvent);
  assert.equal(finalEvent.stop, original.stop);
  assert.deepEqual(finalEvent.pixel, { x: 10, y: 20 });
  assert.deepEqual(finalEvent.jj, { x: 10, y: 20 });
  assert.equal(finalEvent.extra, "kept");
  assert.equal(Object.getPrototypeOf(finalEvent), Object.getPrototypeOf(original));

  const withoutStop = { latLng: original.latLng, domEvent: original.domEvent };
  const withStop = Core.makeFinalEvent(withoutStop, latLng);
  assert.equal(typeof withStop.stop, "function");
});
