import {
  DUEL_FRAME_HEADER_SIZE,
  DUEL_ROUND_END_CODES,
  DUEL_ROUND_START_CODES,
  DUEL_SAMPLE_PIN,
  encodeDuelPinFrame,
  encodeDuelPinPayload,
  parseDuelJsonEvent as kitParseDuelJsonEvent,
  parseDuelStateEvent as kitParseDuelStateEvent,
} from "gg-kit";

export {
  DUEL_FRAME_HEADER_SIZE,
  DUEL_ROUND_END_CODES,
  DUEL_ROUND_START_CODES,
  DUEL_SAMPLE_PIN,
  encodeDuelPinFrame,
  encodeDuelPinPayload,
};

export function parseDuelJsonEvent(message: string) {
  const event = kitParseDuelJsonEvent(message);
  if (!event) return null;
  if (event.kind === "round-start") {
    return { code: event.code, kind: "round-start", round: event.round };
  }
  return { code: event.code, kind: event.kind === "finished" ? "round-end" : event.kind };
}

export function parseDuelStateEvent(message: string) {
  const state = kitParseDuelStateEvent(message);
  if (!state) return null;
  return { ...state, panoId: state.panoId ?? "" };
}
