// @ts-nocheck
import { findCountryAt } from "./countries.js";
import { buildAnimationPoints, buildSchedule, randomPointInCountry } from "./sampling.js";

export function isActivationPressed(domEvent, activationKey) {
  if (!domEvent) return false;
  switch (activationKey) {
    case "shift":
      return domEvent.shiftKey === true;
    case "alt":
      return domEvent.altKey === true;
    case "ctrl":
      return domEvent.ctrlKey === true;
    case "meta":
      return domEvent.metaKey === true;
    default:
      return true;
  }
}

export function makeFinalEvent(original, latLng, pixel = null, jj = null) {
  const finalEvent = Object.create(Object.getPrototypeOf(original));
  for (const key of Object.keys(original)) finalEvent[key] = original[key];
  finalEvent.latLng = latLng;
  if (pixel) finalEvent.pixel = pixel;
  if (jj) finalEvent.jj = jj;
  if (typeof finalEvent.stop !== "function") finalEvent.stop = () => {};
  return finalEvent;
}

export function createClickGate({
  map,
  settings,
  index,
  onStart,
  onFinish,
  trigger,
  canStart,
  onGamblePoint,
  debug,
}) {
  let active = false;
  let bypass = false;
  let current = null;
  let generation = 0;
  let gate = null;
  const handlers = new Set();

  function wrap(handler) {
    if (typeof handler !== "function") return handler;
    if (handler.__geogambleWrapped) {
      if (handler.__geogambleGate === gate) return handler;
      handler = unwrapClickHandler(handler);
    }
    const wrapped = function (event) {
      if (bypass) return handler.call(this, event);
      if (active) return;
      if (!event?.latLng || !event.domEvent) return handler.call(this, event);
      if (!isActivationPressed(event.domEvent, settings.activationKey))
        return handler.call(this, event);
      if (canStart && !canStart()) return handler.call(this, event);
      const lat = typeof event.latLng.lat === "function" ? event.latLng.lat() : event.latLng.lat;
      const lng = typeof event.latLng.lng === "function" ? event.latLng.lng() : event.latLng.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return handler.call(this, event);
      const hit = findCountryAt(lat, lng, index);
      if (!hit) return handler.call(this, event);
      const finalPoint = randomPointInCountry(hit.country, Math.random, settings.centerBias);
      if (!finalPoint) return handler.call(this, event);
      try {
        if (onGamblePoint) onGamblePoint(finalPoint);
      } catch (error) {
        if (debug) debug("gamble point callback failed", error);
      }
      active = true;
      const nextGeneration = ++generation;
      current = { originalEvent: event, hit, finalPoint, generation: nextGeneration };
      if (debug) debug("gamble start", hit.country.iso, hit.country.name, finalPoint);
      try {
        onStart({ map, event, hit, finalPoint, generation: nextGeneration });
      } catch (error) {
        active = false;
        current = null;
        if (debug) debug("gamble start failed", error);
        return handler.call(this, event);
      }
    };
    wrapped.__geogambleWrapped = true;
    wrapped.__geogambleOriginal = handler;
    wrapped.__geogambleGate = gate;
    handlers.add(handler);
    return wrapped;
  }

  function finish(finalEvent) {
    if (!active) return false;
    active = false;
    const info = current;
    current = null;
    bypass = true;
    try {
      trigger(map, finalEvent);
    } catch (error) {
      if (debug) debug("final click failed", error);
      try {
        for (const handler of handlers) handler.call(map, finalEvent);
      } catch (fallbackError) {
        if (debug) debug("final fallback failed", fallbackError);
      }
    } finally {
      bypass = false;
    }
    if (onFinish) {
      try {
        onFinish(info);
      } catch (error) {
        if (debug) debug("finish callback failed", error);
      }
    }
    return true;
  }

  function failOpen(event) {
    if (!active) return;
    active = false;
    current = null;
    bypass = true;
    try {
      trigger(map, event);
    } catch (error) {
      if (debug) debug("fail-open trigger failed", error);
    } finally {
      bypass = false;
    }
  }

  function cancel() {
    if (!active) return;
    active = false;
    current = null;
    generation++;
  }

  gate = {
    wrap,
    finish,
    failOpen,
    cancel,
    isActive: () => active,
    isBypassing: () => bypass,
    handlers,
    getCurrent: () => current,
    getGeneration: () => generation,
  };
  return gate;
}

export function runAnimation({
  country,
  finalPoint,
  settings,
  onTick,
  onDone,
  onError,
  isAlive = () => true,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  const schedule = buildSchedule(
    settings.animationMs,
    settings.startIntervalMs,
    settings.endIntervalMs,
  );
  const points = buildAnimationPoints(
    country,
    Math.max(1, schedule.length - 1),
    Math.random,
    settings.centerBias,
  );
  while (points.length < schedule.length - 1) points.push(finalPoint);
  const ticks = schedule.map((tick, index) => ({
    ...tick,
    point: index === schedule.length - 1 ? finalPoint : points[index] || finalPoint,
  }));
  let index = 0;
  let timer = null;
  let canceled = false;

  function step() {
    if (canceled) return;
    if (!isAlive()) {
      canceled = true;
      if (onError) onError(new Error("map unavailable"));
      return;
    }
    const tick = ticks[index];
    try {
      onTick(tick.point, tick.progress, index);
    } catch (error) {
      canceled = true;
      if (onError) onError(error);
      return;
    }
    index++;
    if (index >= ticks.length) {
      timer = setTimeoutFn(() => {
        if (canceled) return;
        if (!isAlive()) {
          canceled = true;
          if (onError) onError(new Error("map unavailable"));
          return;
        }
        try {
          if (onDone) onDone();
        } catch (error) {
          if (onError) onError(error);
        }
      }, settings.finalHoldMs);
      return;
    }
    timer = setTimeoutFn(step, Math.max(0, ticks[index].at - tick.at));
  }

  step();

  return {
    cancel() {
      canceled = true;
      if (timer !== null) clearTimeoutFn(timer);
    },
  };
}

export function unwrapClickHandler(handler) {
  let current = handler;
  const seen = new Set();
  while (current?.__geogambleWrapped && current.__geogambleOriginal && !seen.has(current)) {
    seen.add(current);
    current = current.__geogambleOriginal;
  }
  return current;
}
