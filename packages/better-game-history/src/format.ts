import { duelSummaryPath } from "gg-kit";
import type { GraphMode } from "./types.js";

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function toFiniteNumber(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatModeName(modeKey?: string, isRated = true): string {
  let base = "Moving";
  if (modeKey === "NmpzDuels") base = "NMPZ";
  else if (modeKey === "NoMoveDuels") base = "No Move";
  else if (
    modeKey === "Duels" ||
    modeKey === "Duel" ||
    modeKey === "StandardDuels" ||
    modeKey === "Standard"
  )
    base = "Moving";
  else if (modeKey) base = modeKey.replace("Duels", "").replace("Duel", "");
  return isRated ? base : `Unranked - ${base}`;
}

export function modeGroup(modeKey?: string): Exclude<GraphMode, "All"> | "Other" {
  if (modeKey === "NmpzDuels") return "NMPZ";
  if (modeKey === "NoMoveDuels") return "NM";
  if (
    modeKey === "Duels" ||
    modeKey === "Duel" ||
    modeKey === "StandardDuels" ||
    modeKey === "Standard"
  )
    return "Moving";
  return "Other";
}

export function recordModeGroup(record: { modeKey: string; mode: string }): string {
  const group = modeGroup(record.modeKey);
  if (group !== "Other") return group;
  const mode = record.mode.replace("Unranked - ", "");
  if (mode === "No Move") return "NM";
  if (mode === "NMPZ" || mode === "Moving") return mode;
  return "Other";
}

export function formatRatingChange(value: number | undefined): string {
  if (!isFiniteNumber(value) || value === 0) return "±0";
  return `${value > 0 ? "+" : ""}${Number.isInteger(value) ? value : value.toFixed(1)}`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString();
}

export function summaryPathFor(record: { gameId: string; isTeamDuel: boolean }): string {
  return duelSummaryPath(record.gameId, record.isTeamDuel);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      if (timeout) clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
  });
}
