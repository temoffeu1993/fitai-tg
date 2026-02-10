import { EXERCISE_LIBRARY, type Exercise, type Equipment, type Pattern, type MuscleGroup, type Experience } from "./exerciseLibrary.js";

type AlternativesReason =
  | "equipment_busy"
  | "pain"
  | "preference"
  | "coach_suggested"
  | "other";

const isReason = (v: unknown): v is AlternativesReason =>
  typeof v === "string" &&
  (v === "equipment_busy" ||
    v === "pain" ||
    v === "preference" ||
    v === "coach_suggested" ||
    v === "other");

function lvRank(lv: Experience): number {
  return lv === "beginner" ? 1 : lv === "intermediate" ? 2 : 3;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function intersectCount<T>(a: T[] | undefined, b: T[] | undefined): number {
  if (!a?.length || !b?.length) return 0;
  const set = new Set(a as T[]);
  let c = 0;
  for (const x of b) if (set.has(x)) c++;
  return c;
}

function eqAllEquipmentAvailable(ex: Exercise, available: Equipment[] | null): boolean {
  if (!available?.length) return true;
  if (available.includes("gym_full" as any)) return true;
  // Must have all required equipment (bodyweight is always ok)
  return ex.equipment.every((eq) => eq === "bodyweight" || available.includes(eq));
}

export type AlternativesContext = {
  userExperience?: Experience;
  equipmentAvailable?: Equipment[] | null;
  excludedExerciseIds?: string[] | null;
  avoidEquipment?: Equipment[] | null;
  requireEquipment?: Equipment[] | null;
  reason?: AlternativesReason | null;
  limit?: number | null;
  // When provided, only exercises that share at least one of these patterns
  // are allowed. Use this to prevent e.g. leg exercises appearing as
  // alternatives on a push day.
  allowedPatterns?: Pattern[] | null;
};

export type ExerciseAlternative = {
  exerciseId: string;
  name: string;
  equipment: Equipment[];
  patterns: Pattern[];
  primaryMuscles: MuscleGroup[];
  kind: Exercise["kind"];
  hint: string;
  score: number;
};

export function getExerciseById(exerciseId: string): Exercise | null {
  const id = String(exerciseId || "");
  return EXERCISE_LIBRARY.find((e) => e.id === id) ?? null;
}

export function getExerciseAlternatives(args: {
  originalExerciseId: string;
  ctx?: AlternativesContext;
}): { original: Exercise; alternatives: ExerciseAlternative[]; reason?: AlternativesReason } {
  const original = getExerciseById(args.originalExerciseId);
  if (!original) {
    throw new Error("exercise_not_found");
  }

  const ctx = args.ctx ?? {};
  const limit = Math.max(1, Math.min(30, Number(ctx.limit ?? 12) || 12));

  const excluded = new Set<string>([
    original.id,
    ...(Array.isArray(ctx.excludedExerciseIds) ? ctx.excludedExerciseIds : []),
  ]);
  const avoidEq = new Set<Equipment>(Array.isArray(ctx.avoidEquipment) ? ctx.avoidEquipment : []);
  const requireEq = new Set<Equipment>(Array.isArray(ctx.requireEquipment) ? ctx.requireEquipment : []);

  const exp = ctx.userExperience ?? original.minLevel;
  const expRank = lvRank(exp);
  const avail = Array.isArray(ctx.equipmentAvailable) ? ctx.equipmentAvailable : null;
  const allowedPatternsSet: Set<Pattern> | null =
    Array.isArray(ctx.allowedPatterns) && ctx.allowedPatterns.length > 0
      ? new Set(ctx.allowedPatterns)
      : null;

  const scored: ExerciseAlternative[] = [];
  for (const ex of EXERCISE_LIBRARY) {
    if (excluded.has(ex.id)) continue;

    // Experience gate
    if (lvRank(ex.minLevel) > expRank) continue;

    // Equipment gate
    if (!eqAllEquipmentAvailable(ex, avail)) continue;

    // Avoid equipment (e.g. "bench" if occupied)
    if (avoidEq.size > 0 && ex.equipment.some((eq) => avoidEq.has(eq))) continue;

    // Require equipment (optional filter)
    if (requireEq.size > 0 && !ex.equipment.some((eq) => requireEq.has(eq))) continue;

    // Day-type gate: exercise must have at least one pattern from the allowed set
    if (allowedPatternsSet && !ex.patterns.some((p) => allowedPatternsSet.has(p))) continue;

    const sharedPatterns = intersectCount(original.patterns, ex.patterns);
    const sharedPrimary = intersectCount(original.primaryMuscles, ex.primaryMuscles);
    const sharedSecondary = intersectCount(original.secondaryMuscles, ex.secondaryMuscles);

    // Must be reasonably compatible
    if (sharedPatterns === 0 && sharedPrimary === 0) continue;

    let score = 0;
    score += sharedPatterns * 14;
    score += sharedPrimary * 8;
    score += sharedSecondary * 3;

    // Favor same kind (compound/isolation/etc.)
    if (ex.kind === original.kind) score += 6;

    // Favor similar equipment, but still allow different (esp. if equipment_busy)
    const sharedEq = intersectCount(original.equipment, ex.equipment);
    score += Math.min(3, sharedEq) * 2;

    // Penalize high setup/stability a bit by default
    score -= (ex.setupCost - 1) * 1.2;
    score -= (ex.stabilityDemand - 1) * 1.0;

    // Reason-specific tweaks
    const reason = isReason(ctx.reason) ? ctx.reason : null;
    if (reason === "equipment_busy") {
      // Prefer alternatives that use less of the original "unique" equipment
      score -= Math.max(0, 3 - sharedEq) * 2;
      score += ex.setupCost <= original.setupCost ? 2 : 0;
    }
    if (reason === "pain") {
      // Prefer more stable / lower difficulty choices
      score += (6 - ex.difficulty) * 1.2;
      score += (6 - ex.stabilityDemand) * 1.0;
      // Avoid explicitly "shoulder_sensitive" etc is handled elsewhere; keep generic here
    }

    const reasons: string[] = [];
    if (sharedPatterns > 0) reasons.push("тот же паттерн");
    if (sharedPrimary > 0) reasons.push("те же мышцы");
    if (sharedEq > 0) reasons.push("похожее оборудование");
    if (!reasons.length) reasons.push("близкая замена");

    scored.push({
      exerciseId: ex.id,
      name: ex.name,
      equipment: ex.equipment,
      patterns: ex.patterns,
      primaryMuscles: ex.primaryMuscles,
      kind: ex.kind,
      hint: uniq(reasons).join(" • "),
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    original,
    alternatives: scored.slice(0, limit),
    reason: isReason(ctx.reason) ? ctx.reason : undefined,
  };
}

export function isReplacementAllowed(args: {
  fromExerciseId: string;
  toExerciseId: string;
  ctx?: AlternativesContext;
}): boolean {
  if (args.fromExerciseId === args.toExerciseId) return false;
  try {
    const { alternatives } = getExerciseAlternatives({
      originalExerciseId: args.fromExerciseId,
      ctx: { ...(args.ctx ?? {}), limit: 50 },
    });
    return alternatives.some((a) => a.exerciseId === args.toExerciseId);
  } catch {
    return false;
  }
}

