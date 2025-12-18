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

// ============================================================================
// PROFESSIONAL PATTERN → ROLE MAPPING
// ============================================================================

/**
 * Определяет правильную роль для паттерна (используется для required patterns)
 * Тренерская логика: compound → main, isolation → secondary/accessory, core → accessory
 */
function getDefaultRoleForPattern(pattern: Pattern): SlotRole {
  // COMPOUND MOVEMENTS → MAIN (базовые многосуставные)
  if ([
    "squat",
    "hinge",
    "lunge",
    "hip_thrust",
    "horizontal_push",
    "incline_push",
    "vertical_push",
    "horizontal_pull",
    "vertical_pull",
  ].includes(pattern)) {
    return "main";
  }

  // ISOLATION → SECONDARY (изоляция крупных мышц)
  if ([
    "rear_delts",
    "delts_iso",
  ].includes(pattern)) {
    return "secondary";
  }

  // SMALL ISOLATION → ACCESSORY (мелкие мышцы, кор)
  if ([
    "triceps_iso",
    "biceps_iso",
    "calves",
    "core",      // ← КРИТИЧНО! Кор = accessory
    "carry",
  ].includes(pattern)) {
    return "accessory";
  }

  // CONDITIONING
  if ([
    "conditioning_low_impact",
    "conditioning_intervals",
  ].includes(pattern)) {
    return "conditioning";
  }

  // Default fallback
  return "secondary";
}

// ============================================================================

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
    // КРИТИЧНО: упражнение требует ВСЁ своё оборудование (every, не some)
    if (constraints.equipmentAvailable?.length) {
      // "gym_full" means all equipment is available
      const hasGymFull = constraints.equipmentAvailable.some((eq: any) => eq === "gym_full");
      
      if (!hasGymFull) {
        // Проверяем что ВСЁ оборудование упражнения доступно
        const allEquipmentAvailable = ex.equipment.every(eq => 
          constraints.equipmentAvailable!.includes(eq as any) || eq === "bodyweight"
        );
        
        if (!allEquipmentAvailable) {
          return false;
        }
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
  
  // NEW: Required pattern priority
  isRequiredPattern?: boolean;
}): number {
  const { ex, pattern, role, ctx, usedIds, usedPatterns, usedPrimaryMuscles, isRequiredPattern = false } = args;

  let s = 0;
  
  // NEW: MASSIVE boost for required patterns (must be selected first!)
  if (isRequiredPattern) {
    s += 100; // Priority over everything else
  }

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
  if (hasAnyTag(ex, ["progression_ready", "easy_to_progress"])) s += 2;

  // Slight bonus for safe choices
  if (ctx.intent === "light" && hasAnyTag(ex, ["stable_choice"])) s += 2;

  // -------------------------------------------------------------------------
  // K) CNS LOAD MANAGEMENT (NEW)
  // -------------------------------------------------------------------------
  
  // Calculate accumulated CNS fatigue from already selected exercises
  const accumulatedCNS = Array.from(usedIds || [])
    .map(id => {
      const usedEx = EXERCISE_LIBRARY.find(e => e.id === id);
      return usedEx?.cnsLoad || 0;
    })
    .reduce((sum: number, load) => sum + load, 0);
  
  // If CNS is already fatigued, SOFTLY penalize high CNS load exercises
  // МЯГКИЙ штраф - не блокируем, только снижаем приоритет
  if (accumulatedCNS > 8) {
    s -= (ex.cnsLoad || 0) * 3;  // Было *5, стало *3 - мягче
  }
  
  // For light days, prefer low CNS but don't kill high CNS completely
  if (ctx.intent === "light") {
    if (ex.cnsLoad === 1 || hasAnyTag(ex, ["low_cns"])) s += 6;
    if (ex.cnsLoad === 3 || hasAnyTag(ex, ["high_cns"])) s -= 5;  // Было -10, стало -5 - мягче
  }
  
  // For hard days, allow high CNS load
  if (ctx.intent === "hard" && ex.cnsLoad === 3) {
    s += 3;
  }

  // -------------------------------------------------------------------------
  // L) POSITION IN WORKOUT (NEW)
  // -------------------------------------------------------------------------
  
  const exerciseCount = usedIds?.size || 0;
  
  // First exercise: prefer good openers (heavy compounds)
  if (exerciseCount === 0 && hasAnyTag(ex, ["good_opener"])) {
    s += 8;
  }
  
  // Last exercises: prefer good finishers (isolation)
  if (exerciseCount >= 5 && hasAnyTag(ex, ["good_finisher"])) {
    s += 6;
  }
  
  // Spine-safe bonus for exercises after heavy spinal loading
  if (accumulatedCNS > 4 && hasAnyTag(ex, ["spine_safe"])) {
    s += 5;
  }

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
  isRequiredPattern?: boolean; // NEW: priority boost + relaxation if needed
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

  // Normalized args with guaranteed non-undefined trackers
  const normArgs = { 
    ...args, 
    usedIds, 
    usedPatterns, 
    usedPrimaryMuscles 
  };

  let pool = filterExercisesForPattern({ pattern, constraints })
    .filter(ex => !excludeIds.includes(ex.id));
  
  // Relaxation Level 0: If pool empty AND required, try ignoring minLevel
  if (!pool.length && args.isRequiredPattern) {
    console.warn(`⚠️  Relaxation L0: ignoring minLevel for required pattern "${pattern}"`);
    
    const eqAvail = constraints.equipmentAvailable || [];
    const hasGymFull = eqAvail.includes("gym_full" as any);
    
    pool = EXERCISE_LIBRARY.filter(ex => {
      if (!ex.patterns.includes(pattern)) return false;
      if (excludeIds.includes(ex.id)) return false;
      
      // Equipment gate (still enforced, but with gym_full/bodyweight logic)
      if (!hasGymFull && eqAvail.length) {
        const needsEquipment = ex.equipment.filter(eq => eq !== "bodyweight");
        if (needsEquipment.length && !needsEquipment.every(eq => eqAvail.includes(eq))) {
          return false;
        }
      }
      
      // Avoid flags (still enforced - safety!)
      if (constraints.avoid?.length) {
        const avoidFlags = constraints.avoid.filter(Boolean);
        if (ex.jointFlags?.some(jf => avoidFlags.includes(jf))) return false;
      }
      
      return true;
    });
  }
  
  // If still no pool, we'll try duplicate fallback later
  if (!pool.length && !args.isRequiredPattern) {
    return []; // Non-required patterns can return empty
  }

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
        isRequiredPattern: args.isRequiredPattern, // NEW
      }),
    }))
    .filter(x => x.score > -1e8)
    .sort((a, b) => b.score - a.score);

  // Relaxation Level 1: If pool too small due to hard history avoidance, relax to soft
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
          isRequiredPattern: args.isRequiredPattern,
        }),
      }))
      .filter(x => x.score > -1e8)
      .sort((a, b) => b.score - a.score);
  }
  
  // Try selecting from pool first
  const selected = pickExercisesFromPool(pool, n, normArgs, args.isRequiredPattern);
  
  // If got enough, return
  if (selected.length >= n) return selected;
  
  // Relaxation Level 2: For REQUIRED patterns, if still not enough, allow duplicates (last resort!)
  if (args.isRequiredPattern) {
    console.warn(`⚠️  CRITICAL: Allowing duplicates for required pattern "${pattern}" (got ${selected.length}/${n})`);
    
    // Allow ANY exercise with this pattern, even if already used (but respect avoid/equipment)
    const eqAvail = constraints.equipmentAvailable || [];
    const hasGymFull = eqAvail.includes("gym_full" as any);
    const avoidFlags = constraints.avoid?.filter(Boolean) || [];
    
    const dupPool = EXERCISE_LIBRARY.filter(ex => {
      if (!ex.patterns.includes(pattern)) return false;
      
      // Equipment gate
      if (!hasGymFull && eqAvail.length) {
        const needsEquipment = ex.equipment.filter(eq => eq !== "bodyweight");
        if (needsEquipment.length && !needsEquipment.every(eq => eqAvail.includes(eq))) {
          return false;
        }
      }
      
      // Avoid flags (safety!)
      if (ex.jointFlags?.some(jf => avoidFlags.includes(jf))) return false;
      
      return true;
    });
    
    if (dupPool.length) {
      // FIXED: Return directly from dupPool, ignoring usedIds
      return pickExercisesFromPool(dupPool, n, { ...normArgs, usedIds: new Set<string>() }, true);
    }
  }
  
  return selected;
}

// Helper function to avoid duplication
function pickExercisesFromPool(
  pool: Exercise[],
  n: number,
  args: any,
  isRequiredPattern?: boolean
): Exercise[] {
  const { pattern, role, ctx, constraints, usedIds, usedPatterns, usedPrimaryMuscles } = args;
  
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
        isRequiredPattern,
      }),
    }))
    .filter(x => x.score > -1e8)
    .sort((a, b) => b.score - a.score);

  // OPTIMIZATION: For required patterns, take deterministically (no random)
  if (isRequiredPattern && ranked.length >= n) {
    const deterministic = ranked.slice(0, n).map(x => x.ex);
    // Update trackers
    for (const ex of deterministic) {
      usedIds.add(ex.id);
      usedPatterns.set(pattern, (usedPatterns.get(pattern) ?? 0) + 1);
      for (const m of ex.primaryMuscles) {
        usedPrimaryMuscles.set(m, (usedPrimaryMuscles.get(m) ?? 0) + 1);
      }
    }
    return deterministic;
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

  // FALLBACK: If we couldn't fill the slot, try without usedIds filter
  if (out.length < n) {
    const remaining = pool.filter(ex => !usedIds.has(ex.id)).slice(0, n - out.length);
    
    if (remaining.length > 0) {
      console.warn(`⚠️ Fallback: taking ${remaining.length} exercises for ${pattern} (pool: ${pool.length})`);
      out.push(...remaining);
    }

    // LAST RESORT for required: allow duplicates from pool
    if (out.length < n && isRequiredPattern) {
      console.warn(`⚠️ LAST RESORT: allowing duplicates for required ${pattern}`);
      const any = pool.slice(0, n - out.length); // Allow duplicates
      out.push(...any);
    }
  }

  return out;
}

// ============================================================================
// 4) FILL DAY SLOTS -> CONCRETE EXERCISE LIST
// ============================================================================

// КРИТИЧНО: возвращаем упражнение + его pattern + role, чтобы генератор не делал remap
export type SelectedExercise = {
  ex: Exercise;
  pattern: Pattern;
  role: SlotRole;
};

/**
 * NEW: 2-phase selection with required patterns priority
 * 
 * Phase 1: Ensure required patterns are covered (with relaxation if needed)
 * Phase 2: Fill remaining slots with variety/balance
 */
export function selectExercisesForDay(args: {
  slots: Slot[];
  ctx: CheckinContext;
  constraints: UserConstraints;
  excludeIds?: string[];
  requiredPatterns?: Pattern[]; // NEW: patterns that MUST be covered
}): SelectedExercise[] {
  const usedIds = new Set<string>(args.excludeIds ?? []);
  const usedPatterns = new Map<Pattern, number>();
  const usedPrimaryMuscles = new Map<MuscleGroup, number>();

  // КРИТИЧНО: Разворачиваем слоты с count > 1 и ПОНИЖАЕМ РОЛЬ для второго упражнения
  const expandedSlots: Array<{ pattern: Pattern; role: SlotRole }> = [];
  
  for (const slot of args.slots) {
    for (let i = 0; i < slot.count; i++) {
      let role = slot.role ?? "secondary";
      
      // КРИТИЧНО: для preferredDoubles понижаем роль на втором упражнении
      if (i > 0) {
        if (role === "main") role = "secondary";
        else if (role === "secondary") role = "accessory";
        // pump/conditioning остаются как есть
      }
      
      expandedSlots.push({
        pattern: slot.pattern,
        role,
      });
    }
  }

  // Сортируем так, чтобы одинаковые паттерны НЕ шли подряд
  // Простая эвристика: группируем по паттернам и чередуем группы
  const grouped = new Map<Pattern, Array<{ pattern: Pattern; role: SlotRole }>>();
  for (const slot of expandedSlots) {
    if (!grouped.has(slot.pattern)) grouped.set(slot.pattern, []);
    grouped.get(slot.pattern)!.push(slot);
  }

  const interleaved: Array<{ pattern: Pattern; role: SlotRole }> = [];
  const groups = Array.from(grouped.values());
  
  let maxLen = Math.max(...groups.map(g => g.length));
  for (let i = 0; i < maxLen; i++) {
    for (const group of groups) {
      if (group[i]) interleaved.push(group[i]);
    }
  }

  // КРИТИЧНО: возвращаем упражнения + pattern + role
  const out: SelectedExercise[] = [];

  // ============================================================================
  // PHASE 1: REQUIRED PATTERNS (guarantee coverage first!)
  // ============================================================================
  const required = args.requiredPatterns ?? [];
  const requiredPicked = new Set<Pattern>();

  for (const rp of required) {
    // ✅ PROFESSIONAL: Определяем правильную роль для паттерна
    const properRole = getDefaultRoleForPattern(rp);
    
    const picked = pickExercisesForPattern({
      pattern: rp,
      n: 1,
      role: properRole, // ✅ ИСПРАВЛЕНО: compound→main, core→accessory
      ctx: args.ctx,
      constraints: args.constraints,
      usedIds,
      usedPatterns,
      usedPrimaryMuscles,
      excludeIds: args.excludeIds,
      isRequiredPattern: true, // CRITICAL: enables relaxation
    });

    if (picked.length) {
      out.push({ ex: picked[0], pattern: rp, role: properRole }); // ✅ ИСПРАВЛЕНО
      requiredPicked.add(rp);
    } else {
      console.warn(`❌ Required pattern "${rp}" could not be covered!`);
    }
  }

  // ============================================================================
  // PHASE 2: FILL ALL SLOTS (skip first occurrence of already-picked required)
  // ============================================================================
  const skippedOnce = new Set<Pattern>();
  
  for (const slot of interleaved) {
    // If this pattern was picked in Phase 1, skip its FIRST slot occurrence
    if (requiredPicked.has(slot.pattern) && !skippedOnce.has(slot.pattern)) {
      skippedOnce.add(slot.pattern);
      continue; // Skip first slot (already covered by Phase 1)
    }
    
    const picked = pickExercisesForPattern({
      pattern: slot.pattern,
      n: 1,
      role: slot.role,
      ctx: args.ctx,
      constraints: args.constraints,
      usedIds,
      usedPatterns,
      usedPrimaryMuscles,
      excludeIds: args.excludeIds,
      isRequiredPattern: false, // Phase 2 = optional
    });

    // КРИТИЧНО: возвращаем вместе с pattern и role
    for (const pickedEx of picked) {
      out.push({
        ex: pickedEx,
        pattern: slot.pattern,
        role: slot.role,
      });
    }
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
