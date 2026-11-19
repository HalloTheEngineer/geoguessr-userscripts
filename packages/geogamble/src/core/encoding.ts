import { decodePanoId as kitDecodePanoId, hexToBytes as kitHexToBytes } from "gg-kit";

export const hexToBytes = kitHexToBytes;

export function decodePanoId(value: unknown) {
  return kitDecodePanoId(value) ?? "";
}
