export const DUEL_SAMPLE_PIN = 0x05;
export const DUEL_FRAME_HEADER_SIZE = 20;
export const DUEL_ROUND_START_CODES = ["DuelStarted", "DuelNewRound", "RoundStarted"];
export const DUEL_ROUND_END_CODES = ["DuelRoundTimedOut", "DuelFinished", "RoundEnded"];

export interface DuelEvent {
  code: string | null;
  kind: "round-start" | "round-end" | "finished" | "other";
  round: number | null;
}

export interface DuelState {
  code: string | null;
  gameId: string | null;
  roundNumber: number | null;
  panoId: string | null;
  lat: number | null;
  lng: number | null;
  hasLocation: boolean;
  isRated: boolean | null;
  isTeamDuels: boolean;
  gameContext: string | null;
}

export function hexToBytes(hex: string): Uint8Array | null {
  if (typeof hex !== "string" || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    if (!Number.isFinite(value)) return null;
    bytes[index] = value;
  }
  return bytes;
}

export function decodePanoId(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) return value;
  try {
    const bytes = hexToBytes(value);
    if (!bytes) return value;
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

export function encodeDuelPinPayload({
  timestampMs,
  lat,
  lng,
}: {
  timestampMs: number;
  lat: number;
  lng: number;
}): Uint8Array {
  const payload = new Uint8Array(17);
  const view = new DataView(payload.buffer);
  view.setFloat64(0, Number(timestampMs), false);
  view.setUint8(8, DUEL_SAMPLE_PIN);
  view.setFloat32(9, Number(lat), false);
  view.setFloat32(13, Number(lng), false);
  return payload;
}

export function encodeDuelPinFrame({
  gameIdHex,
  round = 1,
  timestampMs,
  lat,
  lng,
  headerType = 0x03,
  zeroBlock = null,
}: {
  gameIdHex: string | Uint8Array;
  round?: number;
  timestampMs: number;
  lat: number;
  lng: number;
  headerType?: number;
  zeroBlock?: Uint8Array | null;
}): Uint8Array | null {
  const gameId = typeof gameIdHex === "string" ? hexToBytes(gameIdHex) : gameIdHex;
  if (gameId?.length !== 12) return null;
  const roundNumber = Math.min(255, Math.max(1, Math.trunc(Number(round) || 1)));
  const payload = encodeDuelPinPayload({ timestampMs, lat, lng });
  const frame = new Uint8Array(DUEL_FRAME_HEADER_SIZE + payload.length);
  const view = new DataView(frame.buffer);
  frame[0] = headerType & 0xff;
  frame.set(gameId, 1);
  if (zeroBlock) frame.set(zeroBlock.subarray(0, 4), 13);
  frame[17] = roundNumber;
  view.setUint16(18, payload.length, false);
  frame.set(payload, 20);
  return frame;
}

export function parseDuelJsonEvent(message: string): DuelEvent | null {
  if (typeof message !== "string") return null;
  let data: Record<string, any>;
  try {
    data = JSON.parse(message) as Record<string, any>;
  } catch {
    return null;
  }
  const code = typeof data?.code === "string" ? data.code : null;
  if (!code) return null;
  if (DUEL_ROUND_START_CODES.includes(code)) {
    const round = data?.duel?.state?.currentRoundNumber;
    return {
      code,
      kind: "round-start",
      round: Number.isFinite(Number(round)) && Number(round) > 0 ? Number(round) : null,
    };
  }
  if (DUEL_ROUND_END_CODES.includes(code)) {
    return { code, kind: code === "DuelFinished" ? "finished" : "round-end", round: null };
  }
  return { code, kind: "other", round: null };
}

export function parseDuelStateEvent(message: string): DuelState | null {
  if (typeof message !== "string") return null;
  let data: Record<string, any>;
  try {
    data = JSON.parse(message) as Record<string, any>;
  } catch {
    return null;
  }
  const state = data?.duel?.state;
  if (!state || typeof state !== "object") return null;
  const options = state.options && typeof state.options === "object" ? state.options : {};
  const roundNumberValue = Number(state.currentRoundNumber);
  const roundNumber =
    Number.isFinite(roundNumberValue) && roundNumberValue > 0 ? Math.trunc(roundNumberValue) : null;
  const rounds = Array.isArray(state.rounds) ? state.rounds : [];
  let currentRound =
    rounds.find((round: any) => Number(round?.roundNumber) === roundNumber) || null;
  if (!currentRound && roundNumber && rounds[roundNumber - 1])
    currentRound = rounds[roundNumber - 1];
  const panorama = currentRound?.panorama || state.panorama || data?.duel?.panorama || null;
  const latValue = Number(panorama?.lat ?? currentRound?.lat);
  const lngValue = Number(panorama?.lng ?? currentRound?.lng);
  const panoId = decodePanoId(panorama?.panoId ?? currentRound?.panoId ?? state.panoId);
  const lat = Number.isFinite(latValue) ? latValue : null;
  const lng = Number.isFinite(lngValue) ? lngValue : null;
  const isRated =
    typeof options.isRated === "boolean"
      ? options.isRated
      : typeof state.isRated === "boolean"
        ? state.isRated
        : null;
  const isTeamDuels =
    typeof options.isTeamDuels === "boolean"
      ? options.isTeamDuels
      : typeof state.isTeamDuels === "boolean"
        ? state.isTeamDuels
        : false;
  const gameIdValue = data?.gameId ?? state.gameId;
  return {
    code: typeof data?.code === "string" ? data.code : null,
    gameId: typeof gameIdValue === "string" && gameIdValue ? gameIdValue : null,
    roundNumber,
    panoId,
    lat,
    lng,
    hasLocation: lat !== null && lng !== null && !!panoId,
    isRated,
    isTeamDuels,
    gameContext: typeof options.gameContext === "string" ? options.gameContext : null,
  };
}
