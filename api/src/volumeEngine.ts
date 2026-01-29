// volumeEngine.ts
// ============================================================================
// VOLUME ENGINE: Scientific volume calculation system
// 
// ГЛАВНЫЙ ПРИНЦИП (Mike Israetel, Brad Schoenfeld):
// - Объём измеряется В НЕДЕЛЮ, а не за тренировку
// - perMusclePerWeek — главный лимит (10/15/20 sets)
// - perSession — мягкий ориентир для длины тренировки
//
// ЛОГИКА РАСПРЕДЕЛЕНИЯ:
// - Bro Split (грудь 1×/нед): весь объём за 1 тренировку (10-20 sets)
// - PPL 2× (грудь 2×/нед): объём делится на 2 (7-10 sets за раз)
// - Full Body 3× (грудь 3×/нед): объём делится на 3 (4-7 sets за раз)
//
// Architecture: baseSets × goalMod × daysMod × intentMod
// All deterministic, no AI, fully scalable
// ============================================================================

import type { Goal, ExperienceLevel, TimeBucket } from "./normalizedSchemes.js";
import type { Intent, SlotRole } from "./exerciseSelector.js";

// ============================================================================
// 1. GLOBAL LIMITS (hard caps, never exceed)
// ============================================================================

export const MAX_RECOVERABLE_VOLUME = {
  beginner: {
    perSession: 15,              // Мягкий лимит (для Full Body)
    perMusclePerWeek: 10,        // ГЛАВНЫЙ ЛИМИТ (Mike Israetel MRV)
    exercisesPerSession: 6,      // DEPRECATED: use getSessionCaps() instead
  },
  intermediate: {
    perSession: 20,              // Мягкий лимит
    perMusclePerWeek: 15,        // ГЛАВНЫЙ ЛИМИТ
    exercisesPerSession: 7,      // DEPRECATED: use getSessionCaps() instead
  },
  advanced: {
    perSession: 25,              // Мягкий лимит (для Bro Split может быть 20+ sets на одну группу)
    perMusclePerWeek: 20,        // ГЛАВНЫЙ ЛИМИТ
    exercisesPerSession: 9,      // DEPRECATED: use getSessionCaps() instead
  },
} as const;

// ============================================================================
// 1a. SESSION CAPS: Dynamic limits based on timeBucket + intent
// ============================================================================

/**
 * Session capacity: min/max exercises and sets based on experience, time, intent
 * 
 * KEY PRINCIPLE:
 * - maxExercises >= dayPatternMap SLOT_RANGE upper bound (no conflicts!)
 * - maxSets adjusts by intent (light = lower, hard = higher)
 * - minExercises prevents under-utilizing long sessions (90min shouldn't be 4 exercises)
 * 
 * SYNC WITH dayPatternMap.ts SLOT_RANGE:
 * - 90 normal: min:7, max:9  → caps must allow 9!
 * - 90 hard:   min:9, max:10 → caps must allow 10!
 */

export type SessionCaps = {
  minExercises: number;  // Prevent under-utilization
  maxExercises: number;  // Prevent overload (synced with dayPatternMap)
  maxSets: number;       // Total sets cap (adjusts by intent)
};

export function getSessionCaps(
  experience: ExperienceLevel,
  timeBucket: TimeBucket,
  intent: Intent
): SessionCaps {
  // Base caps by experience × timeBucket
  // CRITICAL: maxExercises MUST be >= dayPatternMap SLOT_RANGE max for this timeBucket!
  const baseCaps: Record<ExperienceLevel, Record<TimeBucket, { min: number; max: number; sets: number }>> = {
    beginner: {
      45: { min: 4, max: 6, sets: 16 },  // ПОВЫШЕНО: 14 → 16 (Nippard: ~16 sets/day для beginner короткая)
      60: { min: 5, max: 7, sets: 20 },  // ПОВЫШЕНО: 16 → 20 (Nippard FB 3d: 20 sets/day)
      90: { min: 6, max: 9, sets: 22 },  // ПОВЫШЕНО: 18 → 22 (beginner 90min может больше)
    },
    intermediate: {
      45: { min: 5, max: 7, sets: 18 },
      60: { min: 6, max: 8, sets: 24 },  // ПОВЫШЕНО: 21 → 24 (верхняя граница научного стандарта)
      90: { min: 7, max: 10, sets: 27 }, // ПОВЫШЕНО: 24 → 27 (для DUP heavy days)
    },
    advanced: {
      45: { min: 6, max: 8, sets: 20 },
      60: { min: 7, max: 9, sets: 26 },  // ПОВЫШЕНО: 24 → 26 (верхняя граница для advanced)
      90: { min: 8, max: 11, sets: 30 }, // ПОВЫШЕНО: 28 → 30 (advanced может больше)
    },
  };

  const base = baseCaps[experience][timeBucket];

  // Intent modifies SETS, not exercises count (more/less volume, not variety)
  const intentSetsMod = intent === "light" ? -4 : intent === "hard" ? +2 : 0;

  return {
    minExercises: base.min,
    maxExercises: base.max,
    maxSets: Math.max(10, base.sets + intentSetsMod), // Never below 10 sets
  };
}

// ============================================================================
// 2. BASE SETS BY ROLE AND EXPERIENCE
// ============================================================================

// ПРОФЕССИОНАЛЬНАЯ БАЗА: Точно настроенная под реальные тренировки
export const SLOT_ROLE_SETS: Record<SlotRole, Record<ExperienceLevel, number>> = {
  main: {
    beginner: 2,
    intermediate: 3,
    advanced: 4,
  },
  secondary: {
    beginner: 2,
    intermediate: 3,
    advanced: 3,
  },
  accessory: {
    beginner: 2,      // ИСПРАВЛЕНО: 1 → 2 (Nippard: accessory 2-3 sets для всех уровней)
    intermediate: 3,  // ПОВЫШЕНО: 2 → 3 для достаточного объёма
    advanced: 3,
  },
  pump: {
    beginner: 1,
    intermediate: 2,
    advanced: 2,
  },
  conditioning: {
    beginner: 1,
    intermediate: 1,
    advanced: 1,
  },
};

// ============================================================================
// 3. GOAL VOLUME MULTIPLIERS
// ============================================================================

export const GOAL_VOLUME_MULTIPLIER: Record<Goal, number> = {
  lose_weight: 0.85,          // Lower volume, higher reps for metabolic effect
  health_wellness: 0.85,      // Conservative volume
  athletic_body: 1.0,         // Balanced
  build_muscle: 1.15,         // Higher volume for hypertrophy
};

// ============================================================================
// 4. DAYS PER WEEK FREQUENCY MODIFIER
// ============================================================================

// More days = volume spreads out, less per session
// Fewer days = more volume per session to hit weekly targets
export const DAYS_FREQUENCY_MODIFIER: Record<number, number> = {
  2: 1.65,   // УВЕЛИЧЕНО: 1.6 → 1.65 (для advanced 2 дня нужно ещё +2 подхода)
  3: 1.1,    // Slightly more
  4: 1.0,    // Optimal balance
  5: 0.84,   // СНИЖЕНО: 0.85 → 0.84 (intermediate lower_body 5 дней превышает на 1)
  6: 0.72,   // СНИЖЕНО: 0.75 → 0.72 (intermediate 6 дней ещё превышает на 7)
};

// ============================================================================
// 5. INTENT MODIFIER (check-in based)
// ============================================================================

export const INTENT_MODIFIER: Record<Intent, number> = {
  light: 0.7,    // Reduce volume by 30%
  normal: 1.0,   // Standard
  hard: 1.15,    // Increase volume by 15% (было 1.1 - не работало из-за округления)
};

// ============================================================================
// 6. REPS RANGES BY GOAL AND ROLE
// ============================================================================

type RepsRange = [number, number];

export const REPS_BY_GOAL: Record<Goal, { main: RepsRange; secondary: RepsRange; accessory: RepsRange }> = {
  build_muscle: {
    main: [6, 10],
    secondary: [8, 12],
    accessory: [10, 15],
  },
  lose_weight: {
    main: [12, 15],
    secondary: [12, 18],
    accessory: [15, 20],
  },
  athletic_body: {
    main: [8, 12],
    secondary: [10, 15],
    accessory: [12, 18],
  },
  health_wellness: {
    main: [8, 12],
    secondary: [10, 15],
    accessory: [12, 18],
  },
};

// ============================================================================
// 7. REST TIMES BY GOAL AND ROLE (seconds)
// ============================================================================

export const REST_BY_GOAL: Record<Goal, { main: number; secondary: number; accessory: number }> = {
  build_muscle: {
    main: 120,     // 2 minutes
    secondary: 90,
    accessory: 60,
  },
  lose_weight: {
    main: 90,      // Достаточно для compound, но короче чем для массы
    secondary: 60, // Минимум 60с для восстановления
    accessory: 45, // Короткий для изоляции (метаболический эффект)
  },
  athletic_body: {
    main: 90,
    secondary: 75,
    accessory: 60,
  },
  health_wellness: {
    main: 90,
    secondary: 75,
    accessory: 60,
  },
};

// ============================================================================
// 8. MAIN FUNCTION: Calculate sets for a slot
// ============================================================================

export function calculateSetsForSlot(args: {
  role: SlotRole;
  experience: ExperienceLevel;
  goal: Goal;
  daysPerWeek: number;
  intent: Intent;
}): number {
  const { role, experience, goal, daysPerWeek, intent } = args;

  // Get base sets from role × experience matrix
  const baseSets = SLOT_ROLE_SETS[role][experience];

  // Apply modifiers
  const goalMod = GOAL_VOLUME_MULTIPLIER[goal];
  const daysMod = DAYS_FREQUENCY_MODIFIER[daysPerWeek] ?? 1.0;
  const intentMod = INTENT_MODIFIER[intent];

  // Calculate final sets
  const calculatedSets = baseSets * goalMod * daysMod * intentMod;

  // Round and clamp by intent + experience (professional rounding)
  let sets: number;
  
  if (intent === "hard") {
    sets = Math.ceil(calculatedSets);
  } else if (intent === "light") {
    sets = Math.floor(calculatedSets);
    // Защита от слишком лёгких тренировок
    if (role === "main" || role === "secondary") {
      sets = Math.max(2, sets);
    }
    if (role === "accessory") {
      sets = Math.max(1, sets);
    }
  } else {
    // PROFESSIONAL: Advanced округляется вверх при значениях ≥ X.3 (больше объёма для профи)
    if (experience === "advanced" && calculatedSets >= 2.3 && calculatedSets < 3) {
      sets = Math.ceil(calculatedSets); // 2.3-2.9 → 3
    } else {
      sets = Math.round(calculatedSets);
    }
  }
  
  const clamped = Math.max(1, Math.min(sets, 6)); // Never more than 6 sets per exercise
  
  // DEBUG: Log when clamp triggers (scientific limit: 6 sets max per exercise)
  if (process.env.DEBUG_VOLUME === "1" && sets > 6) {
    console.warn(
      `⚠️  Volume clamp: ${role}/${experience} wanted ${sets} sets ` +
      `(base=${baseSets}, goal×${goalMod.toFixed(2)}, days×${daysMod.toFixed(2)}, intent×${intentMod.toFixed(2)}), clamped to 6`
    );
  }

  return clamped;
}

// ============================================================================
// 9. GET REPS RANGE
// ============================================================================

export function getRepsRange(args: {
  role: SlotRole;
  goal: Goal;
  intent: Intent;
}): RepsRange {
  const { role, goal, intent } = args;

  // Get base reps from goal
  const repsConfig = REPS_BY_GOAL[goal];
  let reps: RepsRange;

  if (role === "main") {
    reps = repsConfig.main;
  } else if (role === "secondary") {
    reps = repsConfig.secondary;
  } else if (role === "accessory") {
    reps = repsConfig.accessory;
  } else if (role === "pump") {
    // Pump всегда высокие повторения для метаболического стресса
    reps = [15, 20];
  } else {
    // conditioning: time-based или высокие reps
    reps = [20, 40];
  }

  // Adjust for intent
  if (intent === "light") {
    // Reduce upper bound slightly
    reps = [reps[0], Math.max(reps[0] + 2, reps[1] - 2)] as RepsRange;
  } else if (intent === "hard") {
    // Increase upper bound slightly
    reps = [reps[0], Math.min(reps[1] + 2, 30)] as RepsRange;
  }

  return reps;
}

// ============================================================================
// 10. REST MODIFIERS BY EXPERIENCE (научно обоснованные)
// ============================================================================

// Новичкам нужно больше времени на восстановление АТФ-КФ системы
export const REST_MODIFIERS_BY_EXPERIENCE: Record<ExperienceLevel, number> = {
  beginner: 1.2,      // +20% отдыха
  intermediate: 1.0,  // Стандарт
  advanced: 0.9,      // -10% отдыха (быстрее восстанавливаются)
};

// ============================================================================
// 11. GET REST TIME (с учётом experience!)
// ============================================================================

/**
 * Round rest time to human-friendly values
 * Nobody sets timer to 1:48 or 0:54! Round to: 30, 45, 60, 90, 120, 150, 180
 */
function roundRestTime(seconds: number): number {
  const humanValues = [30, 45, 60, 90, 120, 150, 180, 240, 300];
  
  // Find closest human-friendly value
  let closest = humanValues[0];
  let minDiff = Math.abs(seconds - closest);
  
  for (const val of humanValues) {
    const diff = Math.abs(seconds - val);
    if (diff < minDiff) {
      minDiff = diff;
      closest = val;
    }
  }
  
  return closest;
}

export function getRestTime(args: {
  role: SlotRole;
  goal: Goal;
  experience: ExperienceLevel;
  intent: Intent;
}): number {
  const { role, goal, experience, intent } = args;

  // Get base rest from goal
  const restConfig = REST_BY_GOAL[goal];
  let rest: number;

  if (role === "main") {
    rest = restConfig.main;
  } else if (role === "secondary") {
    rest = restConfig.secondary;
  } else if (role === "accessory" || role === "pump") {
    rest = restConfig.accessory;
  } else {
    // conditioning
    rest = 30;
  }

  // Apply experience modifier (КРИТИЧНО для новичков!)
  const experienceMod = REST_MODIFIERS_BY_EXPERIENCE[experience];
  rest = Math.floor(rest * experienceMod);

  // Adjust for intent
  if (intent === "light") {
    rest = Math.floor(rest * 0.95); // Немного короче при light
  }

  // Round to human-friendly values (30, 45, 60, 90, 120, etc.)
  return roundRestTime(rest);
}

// ============================================================================
// 11. VALIDATION: Check if workout exceeds caps (NO TRIMMING HERE!)
// ============================================================================

/**
 * Проверяет превышение caps ОДНОЙ тренировки (длина, объём)
 * 
 * ВАЖНО: 
 * - Эта функция ТОЛЬКО возвращает флаги превышения
 * - Удаление/урезание делает workoutDayGenerator.fitSession() (там есть context required patterns)
 * - perSession — это МЯГКИЙ лимит (ориентир для Full Body)
 * - Для Bro Split (грудь 1×/нед) может быть 15-20 sets груди — это ОК!
 * 
 * NEW: Использует getSessionCaps() вместо жёстких лимитов из MAX_RECOVERABLE_VOLUME
 */
export function validateWorkoutVolume(args: {
  totalSets: number;
  totalExercises: number;
  experience: ExperienceLevel;
  timeBucket: TimeBucket;
  intent: Intent;
}): {
  valid: boolean;
  overMaxSets: boolean;
  overMaxExercises: boolean;
  underMinExercises: boolean;
  warnings: string[];
  caps: SessionCaps;
} {
  const { totalSets, totalExercises, experience, timeBucket, intent } = args;

  const caps = getSessionCaps(experience, timeBucket, intent);
  const warnings: string[] = [];

  const overMaxSets = totalSets > caps.maxSets;
  const overMaxExercises = totalExercises > caps.maxExercises;
  const underMinExercises = totalExercises < caps.minExercises;

  // Мягкая проверка sets
  if (overMaxSets) {
    warnings.push(
      `⚠️ Превышение maxSets: ${totalSets} > ${caps.maxSets} (${experience}, ${timeBucket}min, ${intent})`
    );
  }

  // Проверка количества упражнений
  if (overMaxExercises) {
    warnings.push(
      `⚠️ Слишком много упражнений: ${totalExercises} > ${caps.maxExercises}`
    );
  }

  if (underMinExercises) {
    warnings.push(
      `⚠️ Слишком мало упражнений: ${totalExercises} < ${caps.minExercises} (недоиспользование ${timeBucket}min)`
    );
  }

  // ВАЖНО: underMinExercises = warning only, не ошибка!
  // При боли/blockedPatterns/коротком effectiveMinutes может быть невозможно набрать minExercises
  const valid = !overMaxSets && !overMaxExercises;

  return {
    valid,
    overMaxSets,
    overMaxExercises,
    underMinExercises,
    warnings,
    caps,
  };
}

// ============================================================================
// 12. WEEKLY VOLUME TRACKING: Map detailed muscles to volume groups
// ============================================================================

// Упрощённые группы для недельного лимита (Mike Israetel MRV)
export type VolumeGroup = 
  | "chest"
  | "back"        // lats + upper_back + lower_back
  | "shoulders"   // front_delts + side_delts + rear_delts
  | "arms"        // biceps + triceps
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core";

// Маппинг от детальных MuscleGroup (из Exercise) к VolumeGroup
export function mapMuscleToVolumeGroup(muscle: string): VolumeGroup | null {
  const map: Record<string, VolumeGroup> = {
    chest: "chest",
    lats: "back",
    upper_back: "back",
    lower_back: "back",
    rear_delts: "shoulders",
    front_delts: "shoulders",
    side_delts: "shoulders",
    triceps: "arms",
    biceps: "arms",
    forearms: "arms",
    quads: "quads",
    hamstrings: "hamstrings",
    glutes: "glutes",
    calves: "calves",
    core: "core",
  };
  return map[muscle] || null;
}

// ============================================================================
// 13. VALIDATE WEEKLY VOLUME (главная научная проверка!)
// ============================================================================

export function validateWeeklyMuscleVolume(args: {
  muscleVolumes: Map<VolumeGroup, number>; // sets per week per volume group
  experience: ExperienceLevel;
}): {
  valid: boolean;
  warnings: string[];
  overloadedMuscles: Array<{ muscle: VolumeGroup; sets: number; limit: number }>;
} {
  const { muscleVolumes, experience } = args;

  const maxPerMuscle = MAX_RECOVERABLE_VOLUME[experience].perMusclePerWeek;
  const warnings: string[] = [];
  const overloadedMuscles: Array<{ muscle: VolumeGroup; sets: number; limit: number }> = [];
  let valid = true;

  for (const [muscle, sets] of muscleVolumes) {
    if (sets > maxPerMuscle) {
      valid = false;
      overloadedMuscles.push({ muscle, sets, limit: maxPerMuscle });
      warnings.push(
        `⚠️ ${muscle}: ${sets} подходов/нед > ${maxPerMuscle} (лимит для ${experience})`
      );
    }
  }

  return { valid, warnings, overloadedMuscles };
}

// ============================================================================
// 14. CALCULATE WEEKLY VOLUME FROM WORKOUTS
// ============================================================================

export type WorkoutExercise = {
  primaryMuscles: string[];  // MuscleGroup names from Exercise
  sets: number;
};

export type WorkoutDay = {
  exercises: WorkoutExercise[];
};

/**
 * Подсчитывает недельный объём по группам мышц из массива тренировок
 * 
 * Логика: Если упражнение тренирует грудь + трицепс (primaryMuscles),
 * то оба получают полный объём sets (как в науке).
 */
export function calculateWeeklyVolume(workouts: WorkoutDay[]): Map<VolumeGroup, number> {
  const volumeMap = new Map<VolumeGroup, number>();

  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      for (const muscle of exercise.primaryMuscles) {
        const volumeGroup = mapMuscleToVolumeGroup(muscle);
        if (volumeGroup) {
          const current = volumeMap.get(volumeGroup) || 0;
          volumeMap.set(volumeGroup, current + exercise.sets);
        }
      }
    }
  }

  return volumeMap;
}

// ============================================================================
// 15. VALIDATE FULL WEEK (комплексная проверка)
// ============================================================================

export function validateFullWeek(args: {
  workouts: WorkoutDay[];
  experience: ExperienceLevel;
}): {
  valid: boolean;
  warnings: string[];
  weeklyVolume: Map<VolumeGroup, number>;
  overloadedMuscles: Array<{ muscle: VolumeGroup; sets: number; limit: number }>;
} {
  const { workouts, experience } = args;

  // Calculate weekly volume
  const weeklyVolume = calculateWeeklyVolume(workouts);

  // Validate against MRV limits
  const validation = validateWeeklyMuscleVolume({ muscleVolumes: weeklyVolume, experience });

  return {
    valid: validation.valid,
    warnings: validation.warnings,
    weeklyVolume,
    overloadedMuscles: validation.overloadedMuscles,
  };
}
