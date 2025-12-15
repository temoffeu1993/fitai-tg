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

export type ProgressionStatus = 
  | "progressing"      // Стабильный прогресс
  | "maintaining"      // Держит уровень
  | "stalling"         // Застой (2-3 неделі)
  | "regressing"       // Откат
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
  notes?: string[];
};

export type ProgressionRecommendation = {
  exerciseId: string;
  action: "increase_weight" | "increase_reps" | "maintain" | "decrease_weight" | "deload" | "rotate_exercise";
  newWeight?: number;
  newRepsTarget?: [number, number];
  reason: string;
  alternatives?: string[];     // ID альтернативных упражнений для ротации
};

// ============================================================================
// CONSTANTS: Weight increments by equipment type
// ============================================================================

export const WEIGHT_INCREMENT: Record<string, number> = {
  barbell: 2.5,       // Штанга: +2.5 кг (самые маленькие блины)
  dumbbell: 1.0,      // Гантели: +1 кг (или следующая гантель +2 кг)
  machine: 5.0,       // Тренажёр: +5 кг (обычно шаг стека)
  cable: 2.5,         // Блоки: +2.5 кг
  smith: 2.5,         // Смит: +2.5 кг
  bodyweight: 0,      // Собственный вес: только reps
  kettlebell: 4.0,    // Гиря: +4 кг (8 / 12 / 16 / 20 / 24)
};

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

export const PROGRESSION_RULES_BY_GOAL: Record<Goal, ProgressionRules> = {
  strength: {
    repsIncrease: 1,
    successThreshold: 1.0,     // 100% подходов (силовая требовательная)
    stallThreshold: 2,         // 2 неудачи подряд
    deloadThreshold: 3,        // После 3 stall → deload
    deloadPercentage: 0.1,     // -10%
  },
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
  lower_body_focus: {
    repsIncrease: 2,
    successThreshold: 0.75,
    stallThreshold: 3,
    deloadThreshold: 4,
    deloadPercentage: 0.15,
  },
};

// ============================================================================
// HELPER: Analyze last workout performance
// ============================================================================

function analyzePerformance(
  history: ExerciseHistory,
  targetRepsRange: [number, number],
  rules: ProgressionRules
): {
  success: boolean;
  achievedUpperBound: boolean;
  achievedLowerBound: boolean;
  completionRate: number;
  averageRpe?: number;
} {
  const sets = history.sets;
  const [minReps, maxReps] = targetRepsRange;

  let completedSets = 0;
  let upperBoundSets = 0;
  let lowerBoundSets = 0;
  let totalRpe = 0;
  let rpeCount = 0;

  for (const set of sets) {
    if (set.completed) {
      completedSets++;
      
      if (set.actualReps >= maxReps) {
        upperBoundSets++;
      }
      
      if (set.actualReps >= minReps) {
        lowerBoundSets++;
      }

      if (set.rpe) {
        totalRpe += set.rpe;
        rpeCount++;
      }
    }
  }

  const completionRate = sets.length > 0 ? completedSets / sets.length : 0;
  const upperBoundRate = sets.length > 0 ? upperBoundSets / sets.length : 0;
  const lowerBoundRate = sets.length > 0 ? lowerBoundSets / sets.length : 0;

  const success = lowerBoundRate >= rules.successThreshold;
  const achievedUpperBound = upperBoundRate >= rules.successThreshold;
  const achievedLowerBound = lowerBoundRate >= rules.successThreshold;
  const averageRpe = rpeCount > 0 ? totalRpe / rpeCount : undefined;

  return {
    success,
    achievedUpperBound,
    achievedLowerBound,
    completionRate,
    averageRpe,
  };
}

// ============================================================================
// HELPER: Determine progression status
// ============================================================================

function determineStatus(
  progressionData: ExerciseProgressionData,
  rules: ProgressionRules
): ProgressionStatus {
  const { stallCount, deloadCount } = progressionData;

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

  if (stallCount > 0) {
    return "maintaining";
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
}): ProgressionRecommendation {
  const { exercise, progressionData, goal, targetRepsRange, currentIntent } = args;

  const rules = PROGRESSION_RULES_BY_GOAL[goal];

  // If no history, maintain current weight
  if (progressionData.history.length === 0) {
    return {
      exerciseId: exercise.id,
      action: "maintain",
      newWeight: progressionData.currentWeight,
      reason: "Первая тренировка с этим упражнением. Используй рабочий вес для техники.",
    };
  }

  // Get last workout
  const lastWorkout = progressionData.history[progressionData.history.length - 1];
  const performance = analyzePerformance(lastWorkout, targetRepsRange, rules);

  // CASE 1: Deload needed (too many stalls)
  if (progressionData.status === "deload_needed") {
    const deloadWeight = Math.max(
      progressionData.currentWeight * (1 - rules.deloadPercentage),
      0
    );

    return {
      exerciseId: exercise.id,
      action: "deload",
      newWeight: Math.round(deloadWeight * 4) / 4, // Round to 0.25 kg
      reason: `Deload: ${progressionData.stallCount} тренировок без прогресса. Снижаем вес на ${rules.deloadPercentage * 100}% для восстановления.`,
    };
  }

  // CASE 2: Intent is light → maintain (recovery day)
  if (currentIntent === "light") {
    return {
      exerciseId: exercise.id,
      action: "maintain",
      newWeight: progressionData.currentWeight,
      reason: "Light день: сохраняем текущий вес для восстановления.",
    };
  }

  // CASE 3: Achieved upper bound → increase weight
  if (performance.achievedUpperBound && performance.success) {
    const equipment = exercise.equipment[0]; // Primary equipment
    const increment = WEIGHT_INCREMENT[equipment] || 2.5;

    // Bodyweight exercises → increase reps target
    if (equipment === "bodyweight" || progressionData.currentWeight === 0) {
      const newTarget: [number, number] = [
        targetRepsRange[0] + rules.repsIncrease,
        targetRepsRange[1] + rules.repsIncrease,
      ];

      return {
        exerciseId: exercise.id,
        action: "increase_reps",
        newRepsTarget: newTarget,
        reason: `Прогресс! Добил верх диапазона (${targetRepsRange[1]} reps). Повышаем целевые повторения на ${rules.repsIncrease}.`,
      };
    }

    // Weighted exercises → increase weight
    const newWeight = progressionData.currentWeight + increment;

    return {
      exerciseId: exercise.id,
      action: "increase_weight",
      newWeight: Math.round(newWeight * 4) / 4, // Round to 0.25 kg
      reason: `Прогресс! Добил ${targetRepsRange[1]} повторов. Увеличиваем вес на ${increment} кг.`,
    };
  }

  // CASE 4: Failed to reach lower bound → decrease weight or deload
  if (!performance.achievedLowerBound) {
    const newStallCount = progressionData.stallCount + 1;

    // If already stalling for a while → suggest decrease
    if (newStallCount >= rules.stallThreshold) {
      const decreaseWeight = progressionData.currentWeight * 0.9; // -10%

      return {
        exerciseId: exercise.id,
        action: "decrease_weight",
        newWeight: Math.round(decreaseWeight * 4) / 4,
        reason: `Не добил минимум ${targetRepsRange[0]} повторов ${newStallCount} раз подряд. Снижаем вес на 10%.`,
      };
    }

    // First stall → maintain and try again
    return {
      exerciseId: exercise.id,
      action: "maintain",
      newWeight: progressionData.currentWeight,
      reason: `Не добил минимум повторений. Попробуй ещё раз с тем же весом на следующей тренировке.`,
    };
  }

  // CASE 5: Achieved lower bound but not upper → maintain and push
  if (performance.achievedLowerBound && !performance.achievedUpperBound) {
    return {
      exerciseId: exercise.id,
      action: "maintain",
      newWeight: progressionData.currentWeight,
      reason: `Выполнил минимум, но не добил верх. Держи вес и добивай до ${targetRepsRange[1]} повторов.`,
    };
  }

  // Default: maintain
  return {
    exerciseId: exercise.id,
    action: "maintain",
    newWeight: progressionData.currentWeight,
    reason: "Сохраняем текущий вес.",
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
    
    if (daysSinceProgress > 56) return true; // 8 weeks
  }

  return false;
}

// ============================================================================
// HELPER: Get starting weight for new exercise
// ============================================================================

export function getStartingWeight(args: {
  exercise: Exercise;
  experience: ExperienceLevel;
  goal: Goal;
}): number {
  const { exercise, experience } = args;

  // Bodyweight exercises
  if (exercise.equipment.includes("bodyweight")) {
    return 0;
  }

  // Estimate based on experience and exercise type
  // These are VERY conservative starting weights for safety
  
  const baseWeights: Record<string, Record<ExperienceLevel, number>> = {
    // Compound movements (barbell)
    barbell_compound: {
      beginner: 20,      // Empty bar
      intermediate: 40,
      advanced: 60,
    },
    // Dumbbell compound
    dumbbell_compound: {
      beginner: 5,
      intermediate: 10,
      advanced: 15,
    },
    // Isolation
    isolation: {
      beginner: 2.5,
      intermediate: 5,
      advanced: 10,
    },
    // Machine
    machine: {
      beginner: 10,
      intermediate: 20,
      advanced: 30,
    },
  };

  // Determine category
  let category = "isolation";
  if (exercise.kind === "compound") {
    if (exercise.equipment.includes("barbell")) {
      category = "barbell_compound";
    } else if (exercise.equipment.includes("dumbbell")) {
      category = "dumbbell_compound";
    } else if (exercise.equipment.includes("machine")) {
      category = "machine";
    }
  } else if (exercise.equipment.includes("machine")) {
    category = "machine";
  }

  return baseWeights[category]?.[experience] || 5;
}

// ============================================================================
// HELPER: Initialize progression data for new exercise
// ============================================================================

export function initializeProgressionData(args: {
  exerciseId: string;
  exercise: Exercise;
  experience: ExperienceLevel;
  goal: Goal;
}): ExerciseProgressionData {
  const { exerciseId, exercise, experience, goal } = args;

  const startingWeight = getStartingWeight({ exercise, experience, goal });

  return {
    exerciseId,
    currentWeight: startingWeight,
    history: [],
    status: "maintaining",
    stallCount: 0,
    deloadCount: 0,
    notes: ["Начальный вес установлен консервативно для отработки техники."],
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
  } else if (recommendation.action === "decrease_weight" || recommendation.action === "maintain") {
    if (recommendation.reason.includes("Не добил")) {
      newStallCount++;
    }
  } else if (recommendation.action === "deload") {
    newStallCount = 0;
    newDeloadCount++;
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
