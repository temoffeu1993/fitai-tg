import type { TimeBucket } from "./normalizedSchemes.js";

export const DEFAULT_WARMUP_MIN = 8;
export const DEFAULT_COOLDOWN_MIN = 5;

type RepsRangeLike = [number, number] | number | string | null | undefined;

function parseRepsRangeAvg(reps: RepsRangeLike): number {
  if (Array.isArray(reps) && reps.length >= 2) {
    const a = Number(reps[0]);
    const b = Number(reps[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(1, (a + b) / 2);
  }
  if (typeof reps === "number" && Number.isFinite(reps)) return Math.max(1, reps);
  if (typeof reps === "string") {
    const m = reps.trim().match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(1, (a + b) / 2);
    }
    const single = Number(reps.trim());
    if (Number.isFinite(single) && single > 0) return single;
  }
  return 10;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function equipmentSetupSec(equipment: unknown): number {
  const eq = Array.isArray(equipment) ? equipment.map((x) => String(x).toLowerCase()) : [];
  if (eq.includes("barbell")) return 140;
  if (eq.includes("smith")) return 120;
  if (eq.includes("machine")) return 110;
  if (eq.includes("cable")) return 105;
  if (eq.includes("dumbbell") || eq.includes("kettlebell") || eq.includes("landmine")) return 85;
  if (eq.includes("pullup_bar") || eq.includes("trx")) return 55;
  if (eq.includes("bodyweight")) return 35;
  return 75;
}

function loadOverheadSecPerSet(loadType: unknown): number {
  const lt = String(loadType || "").toLowerCase();
  if (lt === "external" || lt === "assisted") return 12;
  return 0;
}

function workSecPerRep(kind: unknown, role: unknown): number {
  const k = String(kind || "").toLowerCase();
  if (k === "compound") return 2.7;
  if (k === "core") return 2.3;
  if (k === "conditioning") return 2.2;
  if (k === "isolation") return 2.4;
  const r = String(role || "").toLowerCase();
  if (r === "main") return 2.7;
  if (r === "secondary") return 2.6;
  if (r === "conditioning") return 2.2;
  if (r === "pump") return 2.3;
  if (r === "accessory") return 2.4;
  return 2.5;
}

function estimateExerciseSeconds(args: {
  sets: number;
  restSec: number;
  repsRange?: RepsRangeLike;
  role?: unknown;
  kind?: unknown;
  equipment?: unknown;
  setupCost?: unknown;
  loadType?: unknown;
}): number {
  const sets = Number.isFinite(Number(args.sets)) ? Math.max(1, Math.round(Number(args.sets))) : 1;
  const restSec = Number.isFinite(Number(args.restSec)) ? Math.max(0, Math.round(Number(args.restSec))) : 90;
  const avgReps = parseRepsRangeAvg(args.repsRange);

  const perRep = workSecPerRep(args.kind, args.role);
  const workSec = clamp(Math.round(avgReps * perRep + 10), 25, 75);
  const perSetOverhead = loadOverheadSecPerSet(args.loadType);

  const setupCost = Number(args.setupCost);
  const setupFromCostSec = Number.isFinite(setupCost) ? clamp(Math.round(setupCost * 25), 25, 120) : 0;
  const setupSec = Math.max(equipmentSetupSec(args.equipment), setupFromCostSec);

  const totalWork = sets * (workSec + perSetOverhead);
  const totalRest = Math.max(0, sets - 1) * restSec;
  return setupSec + totalWork + totalRest;
}

export function estimateMainMinutesFromGeneratedExercises(
  exercises: Array<{
    sets: number;
    restSec: number;
    repsRange?: RepsRangeLike;
    role?: unknown;
    loadType?: unknown;
    exercise?: { kind?: unknown; equipment?: unknown; setupCost?: unknown } | null;
  }>,
  opts: { transitionSec?: number } = {}
): number {
  const transitionSec = Number.isFinite(Number(opts.transitionSec)) ? Math.max(0, Math.round(Number(opts.transitionSec))) : 60;
  const list = Array.isArray(exercises) ? exercises : [];
  let totalSec = 0;
  for (const ex of list) {
    totalSec += estimateExerciseSeconds({
      sets: ex?.sets,
      restSec: ex?.restSec,
      repsRange: (ex as any)?.repsRange,
      role: (ex as any)?.role,
      kind: ex?.exercise?.kind,
      equipment: ex?.exercise?.equipment,
      setupCost: ex?.exercise?.setupCost,
      loadType: (ex as any)?.loadType,
    });
  }
  if (list.length >= 2) totalSec += (list.length - 1) * transitionSec;
  return Math.max(0, Math.ceil(totalSec / 60));
}

export function estimateTotalMinutesFromGeneratedExercises(
  exercises: Array<{
    sets: number;
    restSec: number;
    repsRange?: RepsRangeLike;
    role?: unknown;
    loadType?: unknown;
    exercise?: { kind?: unknown; equipment?: unknown; setupCost?: unknown } | null;
  }>,
  opts: { warmupMin?: number; cooldownMin?: number; transitionSec?: number } = {}
): number {
  const warmupMin = Number.isFinite(Number(opts.warmupMin)) ? Math.max(0, Math.round(Number(opts.warmupMin))) : DEFAULT_WARMUP_MIN;
  const cooldownMin = Number.isFinite(Number(opts.cooldownMin)) ? Math.max(0, Math.round(Number(opts.cooldownMin))) : DEFAULT_COOLDOWN_MIN;
  const mainMin = estimateMainMinutesFromGeneratedExercises(exercises, { transitionSec: opts.transitionSec });
  return warmupMin + mainMin + cooldownMin;
}

export function estimateTotalMinutesFromStoredPlanExercises(
  exercises: any[],
  opts: { warmupMin?: number; cooldownMin?: number; transitionSec?: number } = {}
): number | null {
  const list = Array.isArray(exercises) ? exercises : [];
  if (!list.length) return null;

  const warmupMin = Number.isFinite(Number(opts.warmupMin)) ? Math.max(0, Math.round(Number(opts.warmupMin))) : DEFAULT_WARMUP_MIN;
  const cooldownMin = Number.isFinite(Number(opts.cooldownMin)) ? Math.max(0, Math.round(Number(opts.cooldownMin))) : DEFAULT_COOLDOWN_MIN;
  const transitionSec = Number.isFinite(Number(opts.transitionSec)) ? Math.max(0, Math.round(Number(opts.transitionSec))) : 60;

  let totalSec = 0;
  let counted = 0;
  for (const ex of list) {
    const setsRaw = Array.isArray(ex?.sets) ? ex.sets.length : Number(ex?.sets ?? ex?.totalSets);
    const restSec = Number(ex?.restSec ?? ex?.rest ?? 90);
    const repsRange = ex?.repsRange ?? ex?.reps ?? ex?.repsRangeText ?? null;
    const loadType = ex?.loadType ?? ex?.load_type ?? null;

    const sets = Number.isFinite(setsRaw) ? Math.max(1, Math.round(setsRaw)) : 0;
    if (sets <= 0) continue;

    totalSec += estimateExerciseSeconds({
      sets,
      restSec,
      repsRange,
      role: ex?.role,
      kind: ex?.kind ?? ex?.exerciseKind,
      equipment: ex?.equipment ?? ex?.exercise?.equipment,
      setupCost: ex?.setupCost ?? ex?.exercise?.setupCost,
      loadType,
    });
    counted++;
  }
  if (counted === 0) return null;
  if (counted >= 2) totalSec += (counted - 1) * transitionSec;
  return warmupMin + Math.max(0, Math.ceil(totalSec / 60)) + cooldownMin;
}

export function timeBucketFromMinutes(minutes: number): TimeBucket {
  const m = Math.max(0, Math.round(minutes));
  if (m < 50) return 45;
  if (m < 75) return 60;
  return 90;
}

export function estimateWarmupCooldownMinutes(timeBucket: TimeBucket | null | undefined): { warmupMin: number; cooldownMin: number } {
  if (timeBucket === 45) return { warmupMin: 6, cooldownMin: 4 };
  if (timeBucket === 90) return { warmupMin: 10, cooldownMin: 6 };
  if (timeBucket === 60) return { warmupMin: 7, cooldownMin: 5 };
  return { warmupMin: DEFAULT_WARMUP_MIN, cooldownMin: DEFAULT_COOLDOWN_MIN };
}
