import type { SessionItem, SetEntry } from "./types";

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function formatRepsLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value));
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length >= 2) {
    const a = Number(value[0]);
    const b = Number(value[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return `${Math.round(a)}-${Math.round(b)}`;
  }
  return "";
}

export function parseWeightNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
  const raw = String(value).replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

export function normalizeRepsForPayload(reps: unknown): string | number | undefined {
  if (reps == null) return undefined;
  if (typeof reps === "number" && Number.isFinite(reps) && reps > 0) return Math.round(reps);
  if (typeof reps === "string" && reps.trim()) return reps.trim();
  return undefined;
}

export function defaultRepsFromTarget(targetReps: unknown): number | undefined {
  if (typeof targetReps === "number" && Number.isFinite(targetReps) && targetReps > 0) {
    return Math.max(1, Math.round(targetReps));
  }

  if (typeof targetReps === "string" && targetReps.trim()) {
    const matches = targetReps.match(/\d+(?:[.,]\d+)?/g);
    if (!matches?.length) return undefined;
    const parsed = Number(matches[0].replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.max(1, Math.round(parsed));
  }

  return undefined;
}

export function requiresWeightInput(item: SessionItem): boolean {
  if (typeof item.requiresWeightInput === "boolean") return item.requiresWeightInput;
  return item.loadType === "external";
}

export function canMarkSetDone(set: SetEntry, weightRequired: boolean): boolean {
  const hasReps = set.reps != null && Number.isFinite(Number(set.reps));
  const hasWeight = !weightRequired || (set.weight != null && Number.isFinite(Number(set.weight)));
  return hasReps && hasWeight;
}

export function nextUndoneSetIndex(item: SessionItem): number {
  const idx = item.sets.findIndex((s) => !s.done);
  return idx >= 0 ? idx : Math.max(0, item.sets.length - 1);
}

export function setsSummary(item: SessionItem): { done: number; total: number } {
  const total = item.sets.length;
  const done = item.sets.filter((s) => s.done).length;
  return { done, total };
}

export function estimateSessionDurationMin(items: SessionItem[], fallbackMin: number): number {
  const sets = items.reduce((sum, it) => sum + it.sets.length, 0);
  const estimated = Math.ceil(sets * 3.25);
  return Math.max(20, Math.max(fallbackMin, estimated));
}
