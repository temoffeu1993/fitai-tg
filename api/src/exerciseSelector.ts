// exerciseSelector.ts
// ============================================================================
// УЛУЧШЕННЫЙ СКОРИНГ И ПОДБОР УПРАЖНЕНИЙ
// 
// Improvements over original:
// - Diversity tracking (patterns & muscles across session)
// - Role-based scoring (main/secondary/accessory)
// - Better goal alignment
// - Advanced tag-based heuristics
// - Muscle fatigue awareness
// ============================================================================

import {
  EXERCISE_LIBRARY,
  type Exercise,
  type Pattern,
  type MuscleGroup,
  type Equipment,
  type Experience,
  type JointFlag,
} from "./exerciseLibrary.js";

// ============================================================================
// TYPES
// ============================================================================

export type Goal = 
  | "build_muscle"  // hypertrophy
  | "strength" 
  | "lose_weight"   // fat loss
  | "athletic_body" 
  | "health_wellness"
  | "lower_body_focus";

export type Intent = "light" | "normal" | "hard";
export type TimeBucket = 45 | 60 | 90;

export type SlotRole = "main" | "secondary" | "accessory" | "pump" | "conditioning";

export type UserConstraints = {
  experience: Experience;
  equipmentAvailable?: Equipment[];
  avoid?: JointFlag[];
};

export type CheckinContext = {
  intent: Intent;
  timeBucket: TimeBucket;
  goal: Goal;
  preferCircuits?: boolean;
  avoidHighSetupWhenTired?: boolean;
  muscleBias?: Partial<Record<MuscleGroup, number>>; // -1..1
  historyAvoidance?: {
    recentExerciseIds: string[];
    mode: "soft" | "hard";
  };
};

export type Slot = {
  pattern: Pattern;
  count: number;
  role?: SlotRole; // если не указано, считаем "secondary"
};

// ============================================================================
// UTILITIES
// ============================================================================

function lvRank(lv: Experience): number {
  return lv === "beginner" ? 1 : lv === "intermediate" ? 2 : 3;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hasAnyTag(ex: Exercise, tags: string[]): boolean {
  if (!ex.tags?.length) return false;
  return tags.some(t => ex.tags!.includes(t));
}

// ============================================================================
// 1) HARD FILTERING (must-pass)
// ============================================================================

export function filterExercisesForPattern(args: {
  pattern: Pattern;
  constraints: UserConstraints;
}): Exercise[] {
  const { pattern, constraints } = args;

  const filtered = EXERCISE_LIBRARY.filter(ex => {
    // Pattern match
    if (!ex.patterns.includes(pattern)) return false;

    // Experience gate
    if (lvRank(ex.minLevel) > lvRank(constraints.experience)) return false;

    // Equipment gate
    if (constraints.equipmentAvailable?.length) {
      // "gym_full" means all equipment is available
      const hasGymFull = constraints.equipmentAvailable.some((eq: any) => eq === "gym_full");
      
      if (!hasGymFull) {
        // Only specific equipment - check if exercise matches
        const ok = ex.equipment.some(eq => constraints.equipmentAvailable!.includes(eq as any));
        if (!ok) return false;
      }
      // If gym_full, all exercises pass equipment check
    }

    // Injury / pain avoidance
    if (constraints.avoid?.length && ex.jointFlags?.length) {
      if (ex.jointFlags.some(f => constraints.avoid!.includes(f))) return false;
    }

    return true;
  });

  return filtered;
}

// ============================================================================
// 2) ADVANCED SCORING (soft preferences)
// ============================================================================

export function scoreExerciseAdvanced(args: {
  ex: Exercise;
  pattern: Pattern;
  role: SlotRole;
  ctx: CheckinContext;
  constraints: UserConstraints;
  
  // Diversity controls across the session
  usedIds: Set<string>;
  usedPatterns: Map<Pattern, number>;
  usedPrimaryMuscles: Map<MuscleGroup, number>;
}): number {
  const { ex, pattern, role, ctx, usedIds, usedPatterns, usedPrimaryMuscles } = args;

  let s = 0;

  // -------------------------------------------------------------------------
  // A) HARD PENALTIES
  // -------------------------------------------------------------------------
  
  // Already used in this workout
  if (usedIds.has(ex.id)) s -= 100;

  // History avoidance across sessions
  const hist = ctx.historyAvoidance;
  if (hist?.recentExerciseIds?.length) {
    const recent = new Set(hist.recentExerciseIds);
    if (recent.has(ex.id)) {
      if (hist.mode === "hard") return -1e9; // exclude completely
      if (hist.mode === "soft") s -= 120;
    }
  }

  // -------------------------------------------------------------------------
  // B) SETUP & STABILITY COSTS
  // -------------------------------------------------------------------------
  
  const setupPenalty = ctx.intent === "light" ? 3.2 : ctx.intent === "normal" ? 2.0 : 1.2;
  const stabilityPenalty = ctx.intent === "light" ? 3.0 : ctx.intent === "normal" ? 1.8 : 1.1;

  s -= (ex.setupCost - 1) * setupPenalty;
  s -= (ex.stabilityDemand - 1) * stabilityPenalty;

  if (ctx.timeBucket === 45) {
    s -= (ex.setupCost - 1) * 1.2;
    if (hasAnyTag(ex, ["not_for_circuit"])) s -= 4;
  }

  if (ctx.avoidHighSetupWhenTired && ctx.intent === "light") {
    s -= (ex.setupCost - 1) * 2;
  }

  // -------------------------------------------------------------------------
  // C) INTENT MATCHING
  // -------------------------------------------------------------------------
  
  if (ctx.intent === "light") {
    // Light day: favor simpler, stable, joint-friendly
    s += (6 - ex.difficulty) * 2.2;
    if (hasAnyTag(ex, [
      "stable_choice", 
      "low_setup", 
      "spine_friendly", 
      "shoulder_friendly", 
      "knee_friendly",
      "joint_friendly"
    ])) s += 5;
  }

  if (ctx.intent === "normal") {
    // Normal: prefer middle difficulty
    if (ex.difficulty === 3) s += 5;
    if (ex.difficulty === 2) s += 2;
    if (ex.difficulty === 4) s += 1;
  }

  if (ctx.intent === "hard") {
    // Hard: allow heavy/skill
    s += ex.difficulty * 2.0;
    if (hasAnyTag(ex, ["strength_bias", "barbell_skill"])) s += 3;
  }

  // -------------------------------------------------------------------------
  // D) ROLE-BASED PREFERENCES
  // -------------------------------------------------------------------------
  
  if (role === "main") {
    // Main exercises: prefer compounds, lower rep ranges, strength-biased
    if (ex.kind === "compound") s += 10;
    if (ex.kind === "isolation") s -= 5;
    if (hasAnyTag(ex, ["strength_bias", "progression_ready"])) s += 8;
    if (ex.repRangeDefault.min <= 6) s += 3;
  }

  if (role === "secondary") {
    // Secondary: balanced compounds or heavier isolation
    if (ex.kind === "compound") s += 5;
    if (ex.kind === "isolation") s += 2;
  }

  if (role === "accessory") {
    // Accessory: prefer isolation, higher reps, constant tension
    if (ex.kind === "isolation") s += 8;
    if (ex.kind === "compound") s -= 3;
    if (hasAnyTag(ex, ["constant_tension", "hypertrophy_bias"])) s += 5;
    if (ex.repRangeDefault.min >= 10) s += 3;
  }

  if (role === "pump") {
    // Pump: isolation, high reps, quick setup
    if (ex.kind === "isolation") s += 10;
    if (ex.setupCost <= 2) s += 5;
    if (hasAnyTag(ex, ["constant_tension", "good_for_circuit"])) s += 6;
  }

  if (role === "conditioning") {
    // Conditioning: full body, circuits, low setup
    if (hasAnyTag(ex, ["full_body_cardio", "good_for_circuit"])) s += 12;
    if (ex.setupCost >= 4) s -= 8;
  }

  // -------------------------------------------------------------------------
  // E) GOAL MATCHING
  // -------------------------------------------------------------------------
  
  if (ctx.goal === "strength") {
    if (hasAnyTag(ex, ["strength_bias"])) s += 10;
    if (ex.kind === "isolation") s -= 3;
    if (hasAnyTag(ex, ["not_for_circuit"])) s += 2;
    if (ex.repRangeDefault.min >= 10) s -= 2;
  }

  if (ctx.goal === "build_muscle") {
    if (hasAnyTag(ex, ["hypertrophy_bias", "constant_tension"])) s += 7;
    if (ex.kind === "isolation" && role !== "main") s += 3;
  }

  if (ctx.goal === "lose_weight") {
    if (hasAnyTag(ex, ["good_for_circuit", "fat_loss_friendly", "full_body_cardio"])) s += 10;
    if (hasAnyTag(ex, ["not_for_circuit"])) s -= 8;
    s -= clamp((ex.restSecDefault - 60) / 30, 0, 4) * 2;
  }

  if (ctx.goal === "athletic_body" || ctx.goal === "health_wellness") {
    if (hasAnyTag(ex, ["good_for_circuit", "low_setup", "functional"])) s += 5;
    if (ex.unilateral) s += 3;
  }

  if (ctx.goal === "lower_body_focus") {
    // Boost lower body patterns
    if (["squat", "hinge", "lunge", "hip_thrust"].includes(pattern)) {
      s += 5;
      if (ex.primaryMuscles.some(m => ["glutes", "quads", "hamstrings"].includes(m))) s += 8;
    }
  }

  if (ctx.preferCircuits) {
    if (hasAnyTag(ex, ["good_for_circuit"])) s += 6;
    if (ex.setupCost >= 4) s -= 6;
  }

  // -------------------------------------------------------------------------
  // F) DIVERSITY ACROSS SESSION
  // -------------------------------------------------------------------------
  
  // Don't over-repeat same pattern
  const pCount = usedPatterns.get(pattern) ?? 0;
  s -= pCount * (ctx.timeBucket === 90 ? 1.0 : 2.0);

  // Don't over-hit same primary muscles in a single session
  for (const m of ex.primaryMuscles) {
    const mc = usedPrimaryMuscles.get(m) ?? 0;
    s -= mc * 1.8;
  }

  // -------------------------------------------------------------------------
  // G) MUSCLE BIAS (weak points / priorities)
  // -------------------------------------------------------------------------
  
  if (ctx.muscleBias) {
    for (const m of ex.primaryMuscles) {
      const w = ctx.muscleBias[m];
      if (typeof w === "number") s += w * 6;
    }
    if (ex.secondaryMuscles) {
      for (const m of ex.secondaryMuscles) {
        const w = ctx.muscleBias[m];
        if (typeof w === "number") s += w * 2;
      }
    }
  }

  // -------------------------------------------------------------------------
  // H) MISCELLANEOUS BONUSES
  // -------------------------------------------------------------------------
  
  // Prefer unilateral sometimes (good for balance)
  if (ex.unilateral && ctx.intent !== "hard") s += 2;

  // Mixed planes for athletic
  if (ctx.goal === "athletic_body" && ex.plane === "mixed") s += 2;

  // Progression-ready bonus
  if (hasAnyTag(ex, ["progression_ready"])) s += 2;

  // Slight bonus for safe choices
  if (ctx.intent === "light" && hasAnyTag(ex, ["stable_choice"])) s += 2;

  return s;
}

// ============================================================================
// 3) PICK N EXERCISES FOR A PATTERN (diversified)
// ============================================================================

export function pickExercisesForPattern(args: {
  pattern: Pattern;
  n: number;
  role: SlotRole;
  ctx: CheckinContext;
  constraints: UserConstraints;
  
  usedIds?: Set<string>;
  usedPatterns?: Map<Pattern, number>;
  usedPrimaryMuscles?: Map<MuscleGroup, number>;
  excludeIds?: string[];
}): Exercise[] {
  const {
    pattern,
    n,
    role,
    ctx,
    constraints,
    excludeIds = [],
  } = args;

  const usedIds = args.usedIds ?? new Set<string>();
  const usedPatterns = args.usedPatterns ?? new Map<Pattern, number>();
  const usedPrimaryMuscles = args.usedPrimaryMuscles ?? new Map<MuscleGroup, number>();

  const pool = filterExercisesForPattern({ pattern, constraints })
    .filter(ex => !excludeIds.includes(ex.id));
  
  if (!pool.length) return [];

  let ranked = pool
    .map(ex => ({
      ex,
      score: scoreExerciseAdvanced({
        ex,
        pattern,
        role,
        ctx,
        constraints,
        usedIds,
        usedPatterns,
        usedPrimaryMuscles,
      }),
    }))
    .filter(x => x.score > -1e8)
    .sort((a, b) => b.score - a.score);

  // If pool too small due to hard history avoidance, relax to soft
  if (ranked.length < n && ctx.historyAvoidance?.mode === "hard") {
    const relaxed: CheckinContext = {
      ...ctx,
      historyAvoidance: { ...ctx.historyAvoidance, mode: "soft" },
    };
    
    ranked = pool
      .map(ex => ({
        ex,
        score: scoreExerciseAdvanced({
          ex,
          pattern,
          role,
          ctx: relaxed,
          constraints,
          usedIds,
          usedPatterns,
          usedPrimaryMuscles,
        }),
      }))
      .filter(x => x.score > -1e8)
      .sort((a, b) => b.score - a.score);
  }

  // Take top K, then weighted-random inside a small window
  const K = Math.min(ranked.length, Math.max(10, n * 6));
  const top = ranked.slice(0, K);

  const out: Exercise[] = [];
  
  while (out.length < n && top.length > 0) {
    const windowSize = Math.min(7, top.length);
    const window = top.slice(0, windowSize);

    // Weights: keep positive, emphasize better ones
    const weights = window.map(w => Math.max(1, Math.round(w.score + 20)));
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.floor(Math.random() * sum);

    let idx = 0;
    for (let i = 0; i < window.length; i++) {
      r -= weights[i];
      if (r < 0) {
        idx = i;
        break;
      }
    }

    const chosen = window[idx].ex;

    // Accept if not used
    if (!usedIds.has(chosen.id)) {
      out.push(chosen);
      usedIds.add(chosen.id);

      // Update diversity trackers
      usedPatterns.set(pattern, (usedPatterns.get(pattern) ?? 0) + 1);
      for (const m of chosen.primaryMuscles) {
        usedPrimaryMuscles.set(m, (usedPrimaryMuscles.get(m) ?? 0) + 1);
      }
    }

    // Remove chosen from top
    const pos = top.findIndex(x => x.ex.id === chosen.id);
    if (pos >= 0) top.splice(pos, 1);
    else top.shift();
  }

  return out;
}

// ============================================================================
// 4) FILL DAY SLOTS -> CONCRETE EXERCISE LIST
// ============================================================================

export function selectExercisesForDay(args: {
  slots: Slot[];
  ctx: CheckinContext;
  constraints: UserConstraints;
  excludeIds?: string[];
}): Exercise[] {
  const usedIds = new Set<string>(args.excludeIds ?? []);
  const usedPatterns = new Map<Pattern, number>();
  const usedPrimaryMuscles = new Map<MuscleGroup, number>();

  const out: Exercise[] = [];

  for (const slot of args.slots) {
    const role = slot.role ?? "secondary";
    
    const picked = pickExercisesForPattern({
      pattern: slot.pattern,
      n: slot.count,
      role,
      ctx: args.ctx,
      constraints: args.constraints,
      usedIds,
      usedPatterns,
      usedPrimaryMuscles,
      excludeIds: args.excludeIds,
    });

    out.push(...picked);
  }

  return out;
}

// ============================================================================
// EXPORT FOR BACKWARD COMPATIBILITY
// ============================================================================

export {
  filterExercisesForPattern as filterExercisesForSlot,
  scoreExerciseAdvanced as scoreExercise,
  pickExercisesForPattern as pickExercises,
};
