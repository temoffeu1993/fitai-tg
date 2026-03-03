// progressionEngine.ts
// ============================================================================
// PROGRESSION ENGINE: Professional, evidence-based progression system
//
// ПРИНЦИПЫ (научно обоснованные):
// 1. Double Progression - главный метод для гипертрофии
// 2. Linear Progression - для силовых (новички/intermediate)
// 3. Deload - при плато (10-20% снижение на 1 неделю)
// 4. Exercise Rotation - при длительном застое
// 5. Auto-regulation - учёт готовности (чекин)
//
// ИСТОЧНИКИ: Mike Israetel, Greg Nuckols, RTS (Reactive Training Systems)
// ============================================================================

import type { Exercise } from "./exerciseLibrary.js";
import type { Goal, ExperienceLevel } from "./normalizedSchemes.js";

// ============================================================================
// TYPES
// ============================================================================

type EffortTag = "easy" | "working" | "quite_hard" | "hard" | "max" | null;

type ProgressionStatus =
  | "progressing"      // Стабильный прогресс
  | "maintaining"      // Держит уровень
  | "stalling"         // Застой (2-3 неделі)
  | "deload_needed";   // Нужен deload

export type ExerciseHistory = {
  exerciseId: string;
  workoutDate: string;         // ISO date
  sets: Array<{
    targetReps: number;        // Целевые повторения
    actualReps: number;        // Выполненные повторения
    weight: number;            // Вес в кг (0 для bodyweight)
    rpe?: number;              // Rate of Perceived Exertion (1-10)
    completed: boolean;        // Завершён ли подход
  }>;
};

export type ExerciseProgressionData = {
  exerciseId: string;
  currentWeight: number;       // Текущий рабочий вес
  history: ExerciseHistory[];  // Последние N тренировок
  status: ProgressionStatus;
  lastProgressDate?: string;   // Дата последнего прогресса
  stallCount: number;          // Сколько тренировок подряд застой
  deloadCount: number;         // Сколько deload'ов было
};

export type ProgressionRecommendation = {
  exerciseId: string;
  action: "increase_weight" | "increase_reps" | "maintain" | "decrease_weight" | "deload";
  newWeight?: number;
  newRepsTarget?: [number, number];
  reason: string;
  /** True when last workout failed to hit the lower reps bound (for stall tracking) */
  failedLowerBound?: boolean;
  explain?: {
    targetRepsRange?: [number, number];
    totalWorkingSets?: number;
    lowerHits?: number;
    upperHits?: number;
    lastSetUpper?: boolean;
    requiredUpperHits?: number;
    upperOk?: boolean;
    failCount?: number;
    failedLowerBound?: boolean;
    plannedSets?: number;
    performedSets?: number;
    antiOverreach?: boolean;
    doNotPenalize?: boolean;
    doNotPenalizeReason?: string;
    equipment?: string | null;
    increment?: number;
  };
};

// ============================================================================
// CONSTANTS: Weight increments by equipment type
// ============================================================================

const WEIGHT_INCREMENT: Record<string, number> = {
  barbell: 2.5,       // Штанга: +2.5 кг (самые маленькие блины)
  dumbbell: 2.5,       // Гантели: +2.5 кг (стандартный шаг фиксированных гантелей)
  machine: 5.0,       // Тренажёр: +5 кг (обычно шаг стека)
  cable: 5.0,          // Блоки: +5 кг (стандартный шаг стека)
  smith: 2.5,         // Смит: +2.5 кг
  bodyweight: 0,      // Собственный вес: только reps
  kettlebell: 4.0,    // Гиря: +4 кг (8 / 12 / 16 / 20 / 24)
};

function readWeightIncrementOverride(equipment: string, fallback: number): number {
  const key = `PROGRESSION_INCREMENT_${equipment.toUpperCase()}`;
  const raw = process.env[key];
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function getWeightIncrementForExercise(equipment: string | null): number {
  if (!equipment) return 0;
  const base = WEIGHT_INCREMENT[equipment] ?? 2.5;
  return readWeightIncrementOverride(equipment, base);
}

// ============================================================================
// CONSTANTS: Progression rules by goal
// ============================================================================

type ProgressionRules = {
  repsIncrease: number;        // На сколько повторов увеличивать при bodyweight
  successThreshold: number;    // Какой % подходов нужно выполнить для успеха
  stallThreshold: number;      // Сколько тренировок застоя = stall
  deloadThreshold: number;     // Сколько stall'ов = deload
  deloadPercentage: number;    // На сколько % снижать вес при deload
};

export type ProgressionContext = {
  exerciseEffort?: Exclude<EffortTag, null>;
  plannedSets?: number;
  performedSets?: number;
  totalWorkingSets?: number;
  antiOverreach?: boolean;
  doNotPenalize?: boolean;
  doNotPenalizeReason?: string;
};

export const PROGRESSION_RULES_BY_GOAL: Record<Goal, ProgressionRules> = {
  build_muscle: {
    repsIncrease: 2,
    successThreshold: 0.75,    // 75% подходов (гипертрофия более гибкая)
    stallThreshold: 3,         // 3 неудачи
    deloadThreshold: 4,        // После 4 stall → deload
    deloadPercentage: 0.15,    // -15%
  },
  lose_weight: {
    repsIncrease: 2,
    successThreshold: 0.7,     // 70% подходов (фокус на объёме)
    stallThreshold: 4,         // Более терпимо к застою
    deloadThreshold: 5,
    deloadPercentage: 0.2,     // -20% (больше восстановления)
  },
  athletic_body: {
    repsIncrease: 2,
    successThreshold: 0.75,
    stallThreshold: 3,
    deloadThreshold: 4,
    deloadPercentage: 0.15,
  },
  health_wellness: {
    repsIncrease: 1,
    successThreshold: 0.7,
    stallThreshold: 5,         // Очень терпимо
    deloadThreshold: 6,
    deloadPercentage: 0.2,
  },
};

// ============================================================================
// HELPER: Analyze last workout performance
// ============================================================================

function analyzePerformance(
  history: ExerciseHistory,
  targetRepsRange: [number, number],
): {
  totalSets: number;
  lowerHits: number;
  upperHits: number;
  lastSetUpper: boolean;
} {
  const sets = history.sets;
  const [minReps, maxReps] = targetRepsRange;

  let totalSets = 0;
  let upperHits = 0;
  let lowerHits = 0;

  for (const set of sets) {
    if (!set.completed) continue;
    totalSets++;
    if (set.actualReps >= minReps) lowerHits++;
    if (set.actualReps >= maxReps) upperHits++;
  }

  const last = sets.length > 0 ? sets[sets.length - 1] : undefined;
  const lastSetUpper = Boolean(last && last.completed && last.actualReps >= maxReps);

  return {
    totalSets,
    lowerHits,
    upperHits,
    lastSetUpper,
  };
}

export function deriveWorkingHistory(full: ExerciseHistory, weightInverted?: boolean): ExerciseHistory {
  const allSets = full.sets ?? [];
  const sets = allSets.filter((s) => Boolean(s.completed) && (s.actualReps ?? 0) > 0);
  if (sets.length === 0) return { ...full, sets };

  const weights = sets
    .map((s) => s.weight)
    .filter((w) => typeof w === "number" && w > 0)
    .sort((a, b) => a - b);

  // Bodyweight (or no weight recorded) → treat all performed sets as working
  if (weights.length === 0) return { ...full, sets };

  if (weightInverted) {
    // Assisted exercises: lower machine weight = more resistance = harder = "working" sets.
    // Working sets are those at the MINIMUM weight (most resistance), within 15% of min.
    const minW = weights[0] ?? 0;
    if (minW <= 0) return { ...full, sets };
    const working = sets.filter((s) => (s.weight ?? 0) > 0 && (s.weight ?? 0) <= minW * 1.15);
    if (working.length > 0) return { ...full, sets: working };
    // Fallback: take the lightest 2 performed sets
    const bottom2 = [...sets]
      .filter((s) => (s.weight ?? 0) > 0)
      .sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))
      .slice(0, 2);
    return bottom2.length > 0 ? { ...full, sets: bottom2 } : { ...full, sets };
  }

  const maxW = weights[weights.length - 1] ?? 0;
  if (maxW <= 0) return { ...full, sets };

  const working = sets.filter((s) => (s.weight ?? 0) > 0 && (s.weight ?? 0) >= maxW * 0.85);
  if (working.length > 0) return { ...full, sets: working };

  // Fallback: take the heaviest 2 performed sets
  const top2 = [...sets]
    .filter((s) => (s.weight ?? 0) > 0)
    .sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))
    .slice(-2);

  // If only 1 weighted set exists (e.g. user entered weight only for top set),
  // treat that single set as the only working set to avoid counting unweighted sets as working.
  return top2.length > 0 ? { ...full, sets: top2 } : { ...full, sets };
}

function getLoadableEquipment(equipmentList: string[]): string | null {
  const loadablePriority = [
    "barbell",
    "dumbbell",
    "machine",
    "cable",
    "smith",
    "kettlebell",
    "bodyweight",
  ];
  for (const eq of loadablePriority) {
    if (equipmentList.includes(eq)) return eq;
  }
  return null;
}

// ============================================================================
// HELPER: Determine progression status
// ============================================================================

function determineStatus(
  progressionData: ExerciseProgressionData,
  rules: ProgressionRules
): ProgressionStatus {
  const { stallCount } = progressionData;

  // Check if deload is needed
  if (stallCount >= rules.deloadThreshold) {
    return "deload_needed";
  }

  // Check recent history
  if (progressionData.history.length === 0) {
    return "maintaining";
  }

  const lastWorkout = progressionData.history[progressionData.history.length - 1];
  const hasRecent = lastWorkout && 
    new Date(lastWorkout.workoutDate) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  if (!hasRecent) {
    return "maintaining";
  }

  // Check if progressing
  if (stallCount === 0) {
    return "progressing";
  }

  if (stallCount >= rules.stallThreshold) {
    return "stalling";
  }

  return "maintaining";
}

// ============================================================================
// MAIN: Calculate progression recommendation
// ============================================================================

export function calculateProgression(args: {
  exercise: Exercise;
  progressionData: ExerciseProgressionData;
  goal: Goal;
  experience: ExperienceLevel;
  targetRepsRange: [number, number];
  currentIntent?: "light" | "normal" | "hard";
  workoutHistory?: ExerciseHistory; // if provided, analyze this completed workout
  context?: ProgressionContext;
}): ProgressionRecommendation {
  const { exercise, progressionData, goal, targetRepsRange, currentIntent, workoutHistory, context } = args;
  const weightInverted = Boolean((exercise as any).weightInverted);

  const rules = PROGRESSION_RULES_BY_GOAL[goal];

  const workoutToAnalyzeFull =
    workoutHistory ?? progressionData.history[progressionData.history.length - 1];
  if (!workoutToAnalyzeFull) {
    return {
      exerciseId: exercise.id,
      action: "maintain",
      newWeight: progressionData.currentWeight,
      reason: "Нет истории по упражнению. Используй рабочий вес для техники.",
      failedLowerBound: false,
      explain: {
        antiOverreach: Boolean(context?.antiOverreach),
        doNotPenalize: Boolean(context?.doNotPenalize),
        doNotPenalizeReason: context?.doNotPenalizeReason,
        plannedSets: context?.plannedSets,
        performedSets: context?.performedSets,
      },
    };
  }
  // IMPORTANT: Engine always analyzes WORKING sets derived from the last workout,
  // so stored history may keep warmups/ramps without affecting decisions.
  // For weightInverted (assisted) exercises, "working" = lightest sets (most resistance).
  const workoutToAnalyze = deriveWorkingHistory(workoutToAnalyzeFull, weightInverted);
  const performance = analyzePerformance(workoutToAnalyze, targetRepsRange);
  const [minReps, maxReps] = targetRepsRange;
  const totalWorkingSets = performance.totalSets;

  const failCount = totalWorkingSets - performance.lowerHits;

  const explainBase: NonNullable<ProgressionRecommendation["explain"]> = {
    targetRepsRange,
    totalWorkingSets: context?.totalWorkingSets ?? totalWorkingSets,
    lowerHits: performance.lowerHits,
    upperHits: performance.upperHits,
    lastSetUpper: performance.lastSetUpper,
    failCount,
    plannedSets: context?.plannedSets,
    performedSets: context?.performedSets,
    antiOverreach: Boolean(context?.antiOverreach),
    doNotPenalize: Boolean(context?.doNotPenalize),
    doNotPenalizeReason: context?.doNotPenalizeReason,
  };

  // do-not-penalize: recovery / shortened day / low data
  if (context?.doNotPenalize) {
    return {
      exerciseId: exercise.id,
      action: "maintain",
      newWeight: progressionData.currentWeight,
      reason: context.doNotPenalizeReason
        ? `Recovery: ${context.doNotPenalizeReason} → вес сохраняем.`
        : "Recovery: вес сохраняем. Без штрафа в прогрессии.",
      failedLowerBound: false,
      explain: explainBase,
    };
  }

  // CASE 1: Deload needed (too many stalls)
  // Do not rely only on stored status (can be stale); compute directly from stallCount.
  if (progressionData.stallCount >= rules.deloadThreshold) {
    let deloadWeight: number;
    let deloadReason: string;
    if (weightInverted) {
      // Assisted: deload = more assistance (higher machine weight = easier)
      deloadWeight = progressionData.currentWeight * (1 + rules.deloadPercentage);
      deloadReason = `Deload: ${progressionData.stallCount} тренировок без прогресса. Увеличиваем противовес на ${rules.deloadPercentage * 100}% для восстановления.`;
    } else {
      deloadWeight = Math.max(progressionData.currentWeight * (1 - rules.deloadPercentage), 0);
      deloadReason = `Deload: ${progressionData.stallCount} тренировок без прогресса. Снижаем вес на ${rules.deloadPercentage * 100}% для восстановления.`;
    }

    return {
      exerciseId: exercise.id,
      action: "deload",
      newWeight: Math.round(deloadWeight * 4) / 4, // Round to 0.25 kg
      reason: deloadReason,
      failedLowerBound: false,
      explain: explainBase,
    };
  }

  // CASE 2: Intent is light → maintain (recovery day)
  if (currentIntent === "light") {
    return {
      exerciseId: exercise.id,
      action: "maintain",
      newWeight: progressionData.currentWeight,
      reason: "Light день: сохраняем текущий вес для восстановления.",
      failedLowerBound: false,
      explain: explainBase,
    };
  }

  // If not enough working sets, avoid making progression decisions.
  if (totalWorkingSets < 2) {
    return {
      exerciseId: exercise.id,
      action: "maintain",
      newWeight: progressionData.currentWeight,
      reason: "Недостаточно рабочих подходов для решения по прогрессии. Оставляем вес.",
      failedLowerBound: false,
      explain: { ...explainBase, failedLowerBound: false },
    };
  }

  const antiOverreach = Boolean(context?.antiOverreach);

  const failedLowerBound = totalWorkingSets === 2
    ? failCount >= 1
    : totalWorkingSets === 3
      ? failCount >= 2
      : failCount > totalWorkingSets / 2;

  const allMetLower = performance.lowerHits === totalWorkingSets;

  const requiredUpperHits = totalWorkingSets === 2
    ? 2
    : totalWorkingSets === 3
      ? 2
      : Math.ceil(totalWorkingSets * 0.75);

  const upperOk = allMetLower &&
    performance.upperHits >= requiredUpperHits &&
    performance.lastSetUpper;

  // Include decision thresholds in explain for debuggability.
  explainBase.requiredUpperHits = requiredUpperHits;
  explainBase.upperOk = upperOk;
  explainBase.failedLowerBound = failedLowerBound;

  if (upperOk) {
    if (antiOverreach) {
      return {
        exerciseId: exercise.id,
        action: "maintain",
        newWeight: progressionData.currentWeight,
        reason: "Верх диапазона добит, но день тяжёлый (высокий RPE/effort) → вес сохраняем.",
        failedLowerBound: false,
        explain: { ...explainBase, equipment: getLoadableEquipment(exercise.equipment), increment: undefined },
      };
    }

    const equipment = getLoadableEquipment(exercise.equipment);
    const baseIncrement = getWeightIncrementForExercise(equipment);
    // Progressive slowdown: reduce increment for experienced athletes with long history.
    // Beginner (< 12 workouts): full increment
    // Intermediate (12–36 workouts): 75% of increment
    // Advanced (> 36 workouts): 50% of increment
    // Round to the nearest equipment step (0.25 kg minimum).
    const workoutCount = progressionData.history.length;
    const slowdownFactor =
      args.experience === "beginner"
        ? 1.0
        : workoutCount < 12
          ? 1.0
          : workoutCount < 36
            ? 0.75
            : 0.5;
    const increment = Math.max(
      baseIncrement > 0 ? 0.25 : 0, // minimum 0.25 kg if equipment supports weight
      Math.round(baseIncrement * slowdownFactor * 4) / 4
    );
    explainBase.equipment = equipment;
    explainBase.increment = increment;

    if (equipment === "bodyweight" || progressionData.currentWeight === 0) {
      const newTarget: [number, number] = [
        targetRepsRange[0] + rules.repsIncrease,
        targetRepsRange[1] + rules.repsIncrease,
      ];
      return {
        exerciseId: exercise.id,
        action: "increase_reps",
        newRepsTarget: newTarget,
        reason: `Прогресс! Закрыл диапазон (${minReps}-${maxReps}). Повышаем повторения на ${rules.repsIncrease}.`,
        failedLowerBound: false,
        explain: explainBase,
      };
    }

    if (!equipment) {
      return {
        exerciseId: exercise.id,
        action: "maintain",
        newWeight: progressionData.currentWeight,
        reason: "Прогресс по повторениям есть, но тип оборудования не определён. Оставляем вес без изменения.",
        failedLowerBound: false,
        explain: explainBase,
      };
    }

    if (weightInverted) {
      // Assisted exercise: progress = reducing machine weight (less assistance = harder).
      const newWeight = Math.max(0, progressionData.currentWeight - increment);
      return {
        exerciseId: exercise.id,
        action: "increase_weight", // Semantically "progress" — less assistance
        newWeight: Math.round(newWeight * 4) / 4,
        reason: `Прогресс! Закрыл диапазон (${minReps}-${maxReps}). Уменьшаем противовес на ${increment} кг (меньше помощи = сложнее).`,
        failedLowerBound: false,
        explain: explainBase,
      };
    }

    const newWeight = progressionData.currentWeight + increment;
    return {
      exerciseId: exercise.id,
      action: "increase_weight",
      newWeight: Math.round(newWeight * 4) / 4, // Round to 0.25 kg
      reason: `Прогресс! Закрыл диапазон (${minReps}-${maxReps}) в рабочих подходах. +${increment} кг.`,
      failedLowerBound: false,
      explain: explainBase,
    };
  }

  // Failed to reach lower bound → decrease weight or maintain
  if (failedLowerBound) {
    const newStallCount = progressionData.stallCount + 1;

    // If already stalling for a while → suggest decrease
    if (newStallCount >= rules.stallThreshold) {
      if (weightInverted) {
        // Assisted: reduce stall by increasing machine weight (more assistance = easier)
        const decreaseWeight = progressionData.currentWeight * 1.1; // +10% (more assistance)
        return {
          exerciseId: exercise.id,
          action: "decrease_weight", // Semantically "step back" — more assistance
          newWeight: Math.round(decreaseWeight * 4) / 4,
          reason: `Не добил минимум ${minReps} (${newStallCount} раз подряд). Увеличиваем противовес на 10% для восстановления техники.`,
          failedLowerBound: true,
          explain: explainBase,
        };
      }

      const decreaseWeight = progressionData.currentWeight * 0.9; // -10%

      return {
        exerciseId: exercise.id,
        action: "decrease_weight",
        newWeight: Math.round(decreaseWeight * 4) / 4,
        reason: `Не добил минимум ${minReps} в рабочих подходах (${newStallCount} раз подряд). Снижаем вес на 10%.`,
        failedLowerBound: true,
        explain: explainBase,
      };
    }

    // First stall → maintain and try again
    return {
      exerciseId: exercise.id,
      action: "maintain",
      newWeight: progressionData.currentWeight,
      reason: `Не добил минимум ${minReps} в рабочих подходах. Пробуем ещё раз с тем же весом.`,
      failedLowerBound: true,
      explain: explainBase,
    };
  }

  // Default: maintain
  return {
    exerciseId: exercise.id,
    action: "maintain",
    newWeight: progressionData.currentWeight,
    reason: `Вес сохраняем. Цель: добить верх диапазона (${maxReps}) в рабочих подходах.`,
    failedLowerBound: false,
    explain: explainBase,
  };
}

// ============================================================================
// HELPER: Suggest exercise rotation (when stuck too long)
// ============================================================================

export function shouldRotateExercise(progressionData: ExerciseProgressionData): boolean {
  // Rotate if:
  // 1. Been stalling for 6+ workouts
  // 2. Had 2+ deloads already
  // 3. No progress in last 8 weeks

  if (progressionData.stallCount >= 6) return true;
  if (progressionData.deloadCount >= 2) return true;

  if (progressionData.lastProgressDate) {
    const daysSinceProgress = 
      (Date.now() - new Date(progressionData.lastProgressDate).getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceProgress > 56) {
      const recentThresholdDays = 14;
      const recentCountNeeded = 2;
      const recentCutoff = Date.now() - recentThresholdDays * 24 * 60 * 60 * 1000;
      const recentWorkouts = (progressionData.history || []).filter((h) => {
        const t = new Date(h.workoutDate).getTime();
        return Number.isFinite(t) && t >= recentCutoff;
      });
      if (recentWorkouts.length >= recentCountNeeded) return true; // 8 weeks without progress while training actively
    }
  }

  return false;
}

// ============================================================================
// HELPER: Get starting weight for new exercise
// ============================================================================

// Coefficients: Novice 1RM (strengthlevel.com, 80kg male) × 0.50 / 80.
// Source: strengthlevel.com (150M+ lifts). Novice = 20th percentile, ~6-12 months trained.
// × 0.50 = conservative starting load for first attempt (NSCA guideline, RPE 5-6).
// barbell = total bar weight (Olympic 20kg or EZ ~8kg)
// dumbbell = weight per hand
// machine = weight on stack / cable
const BW_COEFFICIENTS: Record<string, { barbell: number; dumbbell: number; machine: number }> = {
  squat:            { barbell: 0.61, dumbbell: 0.14, machine: 0.96 },
  hinge:            { barbell: 0.73, dumbbell: 0.17, machine: 0.55 },
  lunge:            { barbell: 0.34, dumbbell: 0.11, machine: 0.30 },
  hip_thrust:       { barbell: 0.54, dumbbell: 0.08, machine: 0.55 },
  horizontal_push:  { barbell: 0.46, dumbbell: 0.18, machine: 0.38 },
  incline_push:     { barbell: 0.42, dumbbell: 0.19, machine: 0.34 },
  vertical_push:    { barbell: 0.29, dumbbell: 0.14, machine: 0.31 },
  horizontal_pull:  { barbell: 0.39, dumbbell: 0.19, machine: 0.40 },
  vertical_pull:    { barbell: 0.30, dumbbell: 0.08, machine: 0.38 },
  rear_delts:       { barbell: 0.08, dumbbell: 0.06, machine: 0.18 },
  delts_iso:        { barbell: 0.08, dumbbell: 0.06, machine: 0.10 },
  triceps_iso:      { barbell: 0.18, dumbbell: 0.09, machine: 0.23 },
  biceps_iso:       { barbell: 0.20, dumbbell: 0.09, machine: 0.19 },
  calves:           { barbell: 0.50, dumbbell: 0.10, machine: 0.49 },
  core:             { barbell: 0.06, dumbbell: 0.04, machine: 0.28 },
  carry:            { barbell: 0.30, dumbbell: 0.15, machine: 0.20 },
};

// Experience multipliers derived from strengthlevel.com Beginner/Novice/Intermediate ratios.
// Compound exercises scale more linearly; isolation shows steeper progression.
const EXP_MULTIPLIER_COMPOUND: Record<ExperienceLevel, number> = {
  beginner: 0.73,    // Beginner/Novice ratio avg (squat 0.73, bench 0.72, dead 0.74)
  intermediate: 1.0,
  advanced: 1.32,    // Intermediate/Novice ratio avg (squat 1.33, bench 1.32, dead 1.30)
};
const EXP_MULTIPLIER_ISOLATION: Record<ExperienceLevel, number> = {
  beginner: 0.46,    // Beginner/Novice ratio avg (curl 0.50, raise 0.44, pushdown 0.56)
  intermediate: 1.0,
  advanced: 1.70,    // Intermediate/Novice ratio avg (curl 1.71, raise 1.78, pushdown 1.61)
};

function getStartingWeight(args: {
  exercise: Exercise;
  experience: ExperienceLevel;
  sex?: "male" | "female";
  bodyweight?: number;
}): number {
  const { exercise, experience, sex, bodyweight } = args;

  // Bodyweight exercises — no external load
  if (exercise.equipment.includes("bodyweight") && !exercise.equipment.some(e => e !== "bodyweight")) {
    return 0;
  }

  // Determine equipment category
  const hasBarbell = exercise.equipment.includes("barbell");
  const hasSmith = exercise.equipment.includes("smith");
  const hasDumbbell = exercise.equipment.includes("dumbbell");
  const hasMachine = exercise.equipment.includes("machine") || exercise.equipment.includes("cable");

  // Coefficient lookup key: barbell and smith both use plate-based weights,
  // but smith uses "machine" column (guided motion → typically heavier).
  const equipKey: "barbell" | "dumbbell" | "machine" =
    hasBarbell ? "barbell" : hasDumbbell ? "dumbbell" : "machine";

  // If we have bodyweight → use coefficient table
  if (bodyweight && bodyweight > 0) {
    const pattern = exercise.patterns?.[0];
    const coeff = pattern ? BW_COEFFICIENTS[pattern] : null;
    const baseCoeff = coeff ? coeff[equipKey] : (exercise.kind === "compound" ? 0.20 : 0.06);

    const sexMult = sex === "male" ? 1.0 : sex === "female" ? 0.60 : 0.75;
    const expMultTable = exercise.kind === "isolation" ? EXP_MULTIPLIER_ISOLATION : EXP_MULTIPLIER_COMPOUND;
    const expMult = expMultTable[experience] ?? 1.0;

    const raw = bodyweight * baseCoeff * sexMult * expMult;

    // ── Rounding to real equipment steps & enforce minimums ──
    // Plate-loaded (barbell/smith): round to 5kg for approximate starting weight

    // Barbell (Olympic bar 20kg or EZ-bar ~8kg)
    if (hasBarbell) {
      const EZ_PATTERNS = new Set(["triceps_iso", "biceps_iso"]);
      const minBarbell = EZ_PATTERNS.has(pattern ?? "") ? 8 : 20;
      return Math.max(minBarbell, Math.round(raw / 5) * 5);
    }

    // Smith machine (guided bar ~15kg, same plates as barbell)
    if (hasSmith) {
      return Math.max(15, Math.round(raw / 5) * 5);
    }

    // Dumbbells (fixed set: 1kg steps ≤10kg, 2.5kg steps above)
    if (hasDumbbell) {
      const rounded = raw <= 10 ? Math.round(raw) : Math.round(raw / 2.5) * 2.5;
      return Math.max(2, rounded);
    }

    // Machine / cable (pin-loaded weight stack: 5kg per plate)
    return Math.max(5, Math.round(raw / 5) * 5);
  }

  // Fallback: no bodyweight data — use fixed conservative values
  const fallback: Record<string, Record<ExperienceLevel, number>> = {
    barbell:  { beginner: 20, intermediate: 40, advanced: 60 },
    smith:    { beginner: 15, intermediate: 35, advanced: 55 },
    dumbbell: { beginner: 4,  intermediate: 8,  advanced: 14 },
    machine:  { beginner: 10, intermediate: 20, advanced: 30 },
  };
  const fbKey = hasBarbell ? "barbell" : hasSmith ? "smith" : hasDumbbell ? "dumbbell" : "machine";
  return fallback[fbKey]?.[experience] ?? 5;
}

// ============================================================================
// HELPER: Initialize progression data for new exercise
// ============================================================================

export function initializeProgressionData(args: {
  exerciseId: string;
  exercise: Exercise;
  experience: ExperienceLevel;
  sex?: "male" | "female";
  bodyweight?: number;
}): ExerciseProgressionData {
  const { exerciseId, exercise, experience, sex, bodyweight } = args;

  const startingWeight = getStartingWeight({ exercise, experience, sex, bodyweight });

  return {
    exerciseId,
    currentWeight: startingWeight,
    history: [],
    status: "maintaining",
    stallCount: 0,
    deloadCount: 0,
  };
}

// ============================================================================
// HELPER: Update progression data after workout
// ============================================================================

export function updateProgressionData(args: {
  progressionData: ExerciseProgressionData;
  workoutHistory: ExerciseHistory;
  recommendation: ProgressionRecommendation;
  goal: Goal;
}): ExerciseProgressionData {
  const { progressionData, workoutHistory, recommendation, goal } = args;

  const rules = PROGRESSION_RULES_BY_GOAL[goal];

  // Add workout to history
  const newHistory = [...progressionData.history, workoutHistory];
  
  // Keep last 48 workouts (~16 weeks at 3×/week)
  // Раз НЕ ИИ генерит, можем хранить МНОГО для периодизации!
  if (newHistory.length > 48) {
    newHistory.shift();
  }

  // Update weight
  let newWeight = progressionData.currentWeight;
  if (recommendation.newWeight !== undefined) {
    newWeight = recommendation.newWeight;
  }

  // Update stall count
  let newStallCount = progressionData.stallCount;
  let newDeloadCount = progressionData.deloadCount;
  let lastProgressDate = progressionData.lastProgressDate;

  if (recommendation.action === "increase_weight" || recommendation.action === "increase_reps") {
    newStallCount = 0;
    lastProgressDate = workoutHistory.workoutDate;
  } else if (recommendation.action === "decrease_weight") {
    // Weight correction does NOT reset stall counter — athlete still failed.
    // Stall pressure keeps building toward deload threshold.
    newStallCount++;
  } else if (recommendation.action === "deload") {
    newStallCount = 0;
    newDeloadCount++;
  } else if (recommendation.failedLowerBound) {
    newStallCount++;
  }

  // Determine new status
  const updated: ExerciseProgressionData = {
    ...progressionData,
    currentWeight: newWeight,
    history: newHistory,
    stallCount: newStallCount,
    deloadCount: newDeloadCount,
    lastProgressDate,
    status: "maintaining", // Will be updated below
  };

  updated.status = determineStatus(updated, rules);

  return updated;
}
