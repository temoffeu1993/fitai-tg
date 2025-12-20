// progressionService.ts
// ============================================================================
// PROGRESSION SERVICE: Orchestrator for exercise progression system
//
// ЦЕЛЬ: Связать workout sessions с progressionEngine и БД
// ВХОД: Payload тренировки (exercises с sets/weight/reps/effort)
// ВЫХОД: Обновлённые рекомендации по весам/повторам для следующих тренировок
// ============================================================================

import type { Exercise } from "./exerciseLibrary.js";
import type { Goal, ExperienceLevel } from "./normalizedSchemes.js";
import type { 
  ExerciseProgressionData, 
  ExerciseHistory,
  ProgressionRecommendation,
  EffortTag as EngineEffortTag,
  ProgressionContext
} from "./progressionEngine.js";

import {
  calculateProgression,
  deriveWorkingHistory,
  updateProgressionData,
  initializeProgressionData,
  shouldRotateExercise,
  PROGRESSION_RULES_BY_GOAL,
} from "./progressionEngine.js";

import {
  getProgressionData,
  saveProgressionData,
  saveWorkoutHistory,
} from "./progressionDb.js";

import { q } from "./db.js";

// ============================================================================
// TYPES: Payload structure from frontend
// ============================================================================

/**
 * Frontend effort mapping (from WorkoutSession.tsx)
 */
export type FrontendEffort = "easy" | "working" | "quite_hard" | "hard" | "max";

/**
 * Set data from frontend
 */
export type FrontendSet = {
  reps?: number;
  weight?: number;
};

/**
 * Exercise data from frontend payload
 */
export type FrontendExercise = {
  id?: string; // preferred (stable) identifier from exercise library
  name: string;
  pattern?: string;
  targetMuscles?: string[];
  restSec?: number;
  reps?: string | number; // target reps range
  done?: boolean;
  effort?: FrontendEffort;
  sets: FrontendSet[];
};

/**
 * Complete session payload from frontend
 */
export type SessionPayload = {
  title: string;
  location?: string;
  durationMin: number;
  exercises: FrontendExercise[];
  feedback?: {
    sessionRpe?: number;
  };
};

/**
 * Progression summary result
 */
export type ProgressionSummary = {
  totalExercises: number;
  progressedCount: number;      // +weight or +reps
  maintainedCount: number;       // same weight/reps
  deloadCount: number;           // -weight
  rotationSuggestions: string[]; // exercises that should be rotated
  details: Array<{
    exerciseName: string;
    recommendation: ProgressionRecommendation;
  }>;
};

// ============================================================================
// HELPERS: Data transformation
// ============================================================================

/**
 * Map frontend effort to engine EffortTag
 * Frontend: easy/working/quite_hard/hard/max
 * Engine: same (but typed differently)
 */
function mapEffortToRPE(effort: FrontendEffort | undefined): number {
  if (!effort) return 7; // default: working
  
  const mapping: Record<FrontendEffort, number> = {
    easy: 5,         // RPE 5: легко
    working: 7,      // RPE 7: рабочий
    quite_hard: 8,   // RPE 8: тяжеловато
    hard: 9,         // RPE 9: тяжело
    max: 10,         // RPE 10: предел
  };
  
  return mapping[effort] || 7;
}

function requiresExternalLoad(equipmentList: string[]): boolean {
  // "bodyweight" is intentionally excluded: weight may be 0/omitted.
  const loadable = ["barbell", "dumbbell", "machine", "cable", "smith", "kettlebell"];
  return equipmentList.some((eq) => loadable.includes(eq));
}

/**
 * Parse target reps range from string/number
 * Examples: "6-10" → [6, 10], 12 → [8, 12], "8-12" → [8, 12]
 */
function parseRepsRange(reps: string | number | undefined): [number, number] {
  if (!reps) return [8, 12]; // default
  
  if (typeof reps === 'number') {
    // Single number: use ±2 range
    const min = Math.max(1, reps - 2);
    const max = reps + 2;
    return [min, max];
  }
  
  // String: "6-10", "8–12", "10"
  const match = String(reps).match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (match) {
    return [Number(match[1]), Number(match[2])];
  }
  
  // Single number as string
  const num = Number(reps);
  if (Number.isFinite(num) && num > 0) {
    const min = Math.max(1, num - 2);
    const max = num + 2;
    return [min, max];
  }
  
  return [8, 12]; // fallback
}

/**
 * Find exercise by name in library
 * @param name - exercise name
 * @returns Exercise or null
 */
async function findExerciseByName(name: string): Promise<Exercise | null> {
  try {
    const { EXERCISE_LIBRARY } = await import("./exerciseLibrary.js");
    
    // Normalize name for comparison
    const normalize = (s: string) => 
      s.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\wа-яa-z]/g, '');
    
    const searchNorm = normalize(name);
    
    // Find by exact match first
    let found = EXERCISE_LIBRARY.find(ex => normalize(ex.name) === searchNorm);
    
    // If not found, try partial match
    if (!found) {
      found = EXERCISE_LIBRARY.find(ex => {
        const exNorm = normalize(ex.name);
        return exNorm.includes(searchNorm) || searchNorm.includes(exNorm);
      });
    }
    
    if (found) {
      console.log(`  [ProgressionService] Matched "${name}" → ${found.id} (${found.name})`);
    } else {
      console.warn(`  [ProgressionService] ⚠️ Exercise not found: "${name}"`);
    }
    
    return found || null;
  } catch (err) {
    console.error(`  [ProgressionService] Error finding exercise "${name}":`, err);
    return null;
  }
}

async function findExerciseById(id: string): Promise<Exercise | null> {
  try {
    const { EXERCISE_LIBRARY } = await import("./exerciseLibrary.js");
    const found = EXERCISE_LIBRARY.find(ex => ex.id === id);
    if (!found) {
      console.warn(`  [ProgressionService] ⚠️ Exercise not found by id: "${id}"`);
    }
    return found || null;
  } catch (err) {
    console.error(`  [ProgressionService] Error finding exercise by id "${id}":`, err);
    return null;
  }
}

// ============================================================================
// MAIN: Apply progression from completed session
// ============================================================================

/**
 * Process completed workout session and update progression data
 * 
 * @param args.userId - User ID (UUID)
 * @param args.payload - Session payload from frontend
 * @param args.goal - User goal (for progression rules)
 * @param args.experience - User experience level
 * @param args.workoutDate - Date of workout (ISO string)
 * @returns Progression summary
 */
export async function applyProgressionFromSession(args: {
  userId: string;
  payload: SessionPayload;
  goal: Goal;
  experience: ExperienceLevel;
  workoutDate: string;
  plannedWorkoutId?: string | null;
  sessionId?: string | null;
}): Promise<ProgressionSummary> {
  const { userId, payload, goal, experience, workoutDate, plannedWorkoutId, sessionId } = args;
  
  console.log(`\n🏋️ [ProgressionService] Processing session for user ${userId.slice(0, 8)}...`);
  console.log(`  Workout date: ${workoutDate}`);
  console.log(`  Goal: ${goal}, Experience: ${experience}`);
  console.log(`  Exercises: ${payload.exercises?.length || 0}`);

  const sessionRpeRaw = payload.feedback?.sessionRpe;
  const sessionRpe =
    typeof sessionRpeRaw === "number" && Number.isFinite(sessionRpeRaw) ? sessionRpeRaw : undefined;

  // Optional planned workout context (for adherence + recovery/shortened detection)
  const plannedSetsByExerciseId = new Map<string, number>();
  const plannedSetsByNameNorm = new Map<string, number>();
  let plannedIntent: string | undefined;

  if (plannedWorkoutId) {
    try {
      const rows = await q<{ plan: any }>(
        `SELECT plan FROM planned_workouts WHERE id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
        [plannedWorkoutId, userId]
      );
      const plan = rows[0]?.plan;
      plannedIntent = plan?.intent;

      const plannedExercises = Array.isArray(plan?.exercises) ? plan.exercises : [];
      for (const ex of plannedExercises) {
        const exId = ex?.exerciseId || ex?.exercise?.id;
        const exName = ex?.name || ex?.exerciseName;
        const sets = Number(ex?.sets);
        if (!Number.isFinite(sets) || sets <= 0) continue;
        if (typeof exId === "string" && exId.trim()) plannedSetsByExerciseId.set(exId, Math.round(sets));
        if (typeof exName === "string" && exName.trim()) {
          const key = exName
            .toLowerCase()
            .replace(/ё/g, "е")
            .replace(/[^\wа-яa-z]/g, "");
          plannedSetsByNameNorm.set(key, Math.round(sets));
        }
      }
    } catch (e) {
      console.warn("  [ProgressionService] Failed to load planned workout for adherence:", e);
    }
  }

  // Optional recovery signals from latest check-in
  let recoveryReason: string | undefined;
  try {
    const rows = await q<{
      energy_level: "low" | "medium" | "high" | null;
      sleep_quality: "poor" | "fair" | "ok" | "good" | "excellent" | null;
      stress_level: "low" | "medium" | "high" | "very_high" | null;
      pain: any;
    }>(
      `SELECT energy_level, sleep_quality, stress_level, pain
       FROM daily_check_ins
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    const row = rows[0];
    if (row) {
      const reasons: string[] = [];
      if (row.energy_level === "low") reasons.push("низкая энергия");
      if (row.sleep_quality === "poor" || row.sleep_quality === "fair") reasons.push("плохой сон");
      if (row.stress_level === "very_high") reasons.push("очень высокий стресс");

      const pain = typeof row.pain === "string"
        ? (() => { try { return JSON.parse(row.pain); } catch { return []; } })()
        : row.pain;
      if (Array.isArray(pain)) {
        const maxPain = pain.reduce((m: number, p: any) => Math.max(m, Number(p?.level) || 0), 0);
        if (maxPain >= 6) reasons.push("выраженная боль");
      }

      if (reasons.length > 0) recoveryReason = reasons.join(", ");
    }
  } catch {
    // ignore
  }
  
  // Validate inputs
  if (!userId) {
    throw new Error('[ProgressionService] userId is required');
  }
  
  if (!payload?.exercises || !Array.isArray(payload.exercises)) {
    throw new Error('[ProgressionService] payload.exercises is required');
  }
  
  const summary: ProgressionSummary = {
    totalExercises: 0,
    progressedCount: 0,
    maintainedCount: 0,
    deloadCount: 0,
    rotationSuggestions: [],
    details: [],
  };
  
  let processedCount = 0;
  let skippedCount = 0;
  
  // Process each exercise
  for (const exerciseData of payload.exercises) {
    // Skip if no sets recorded
    if (!exerciseData.sets || exerciseData.sets.length === 0) {
      console.log(`  ⏭️  Skipping "${exerciseData.name}" (no sets recorded)`);
      skippedCount++;
      continue;
    }

    // Only reps-based sets are useful for progression decisions.
    const repsSets = exerciseData.sets.filter((s) => (s.reps ?? 0) > 0);
    if (repsSets.length === 0) {
      console.log(`  ⏭️  Skipping "${exerciseData.name}" (no reps recorded)`);
      skippedCount++;
      continue;
    }
    
    // Find exercise in library
    const exercise =
      (exerciseData.id ? await findExerciseById(exerciseData.id) : null) ??
      (await findExerciseByName(exerciseData.name));
    if (!exercise) {
      console.warn(`  ⚠️  Exercise not found: "${exerciseData.name}" - skipping progression`);
      skippedCount++;
      continue;
    }
    
    summary.totalExercises++;
    processedCount++;
    
    try {
      // Get or initialize progression data
      let progressionData = await getProgressionData(exercise.id, userId);
      
      if (!progressionData) {
        progressionData = initializeProgressionData({
          exerciseId: exercise.id,
          exercise,
          experience,
          goal,
        });
      }
      
      // Parse target reps range
      const targetRepsRange = parseRepsRange(exerciseData.reps);
      
      // Map frontend effort to RPE
      const avgRpe = mapEffortToRPE(exerciseData.effort);
      
      // Build full ExerciseHistory (store all reps-based sets)
      const fullHistory: ExerciseHistory = {
        exerciseId: exercise.id,
        workoutDate,
        sets: repsSets.map((s) => ({
          targetReps: targetRepsRange[1], // upper bound as target
          actualReps: s.reps ?? 0,
          weight: s.weight ?? 0,
          rpe: avgRpe,
          // completed = performed set (reps are present)
          completed: (s.reps ?? 0) > 0,
        })),
      };

      // Working sets are a derivation rule (single source of truth in engine).
      const workingHistory = deriveWorkingHistory(fullHistory);

      const hasAnyRecordedWeight = repsSets.some((s: any) => {
        const w = s?.weight;
        return typeof w === "number" && Number.isFinite(w) && w > 0;
      });
      const missingWeightData = requiresExternalLoad(exercise.equipment) && !hasAnyRecordedWeight;

      // Sync effective currentWeight with what user actually performed (use median of working weights).
      const workingWeights = workingHistory.sets
        .map((s) => s.weight)
        .filter((w) => typeof w === "number" && w > 0)
        .sort((a, b) => a - b);
      const effectiveCurrentWeight =
        workingWeights.length > 0
          ? workingWeights[Math.floor(workingWeights.length / 2)]
          : progressionData.currentWeight;

      const plannedSets =
        plannedSetsByExerciseId.get(exercise.id) ??
        plannedSetsByNameNorm.get(
          exerciseData.name
            .toLowerCase()
            .replace(/ё/g, "е")
            .replace(/[^\wа-яa-z]/g, "")
        );
      const performedSets = fullHistory.sets.length;

      const shortened =
        typeof plannedSets === "number" &&
        plannedSets > 0 &&
        performedSets / plannedSets < 0.75;

      const antiOverreach =
        (typeof sessionRpe === "number" && sessionRpe >= 9) ||
        exerciseData.effort === "hard" ||
        exerciseData.effort === "max";

      const doNotPenalize =
        plannedIntent === "light" ||
        Boolean(recoveryReason) ||
        missingWeightData ||
        shortened ||
        workingHistory.sets.length < 2;

      const doNotPenalizeReason =
        plannedIntent === "light"
          ? "лёгкий день по плану"
          : recoveryReason
            ? `чек-ин: ${recoveryReason}`
            : missingWeightData
              ? "не указан вес в подходах (для прогрессии нужен вес хотя бы в рабочих подходах)"
              : shortened && plannedSets
                ? `сокращённая тренировка (${performedSets}/${plannedSets} подходов)`
                : workingHistory.sets.length < 2
                  ? "недостаточно рабочих подходов"
                  : undefined;

      const context: ProgressionContext = {
        sessionRpe,
        exerciseEffort: exerciseData.effort ?? undefined,
        plannedSets,
        performedSets,
        totalWorkingSets: workingHistory.sets.length,
        antiOverreach,
        doNotPenalize,
        doNotPenalizeReason,
      };
      const progressionDataForCalc: ExerciseProgressionData = {
        ...progressionData,
        currentWeight: effectiveCurrentWeight,
      };
      
      // Calculate progression recommendation
      const recommendation = calculateProgression({
        exercise,
        progressionData: progressionDataForCalc,
        goal,
        experience,
        targetRepsRange,
        currentIntent: plannedIntent === "light" ? "light" : undefined,
        workoutHistory: fullHistory,
        context,
      });
      
      // Update progression data based on recommendation
      const updatedData = updateProgressionData({
        progressionData: progressionDataForCalc,
        workoutHistory: fullHistory,
        recommendation,
        goal,
      });
      
      // Save to database
      await saveProgressionData(updatedData, userId);
      await saveWorkoutHistory(fullHistory, userId, { sessionId });
      
      // Update summary counts
      if (recommendation.action === "increase_weight" || recommendation.action === "increase_reps") {
        summary.progressedCount++;
      } else if (recommendation.action === "deload" || recommendation.action === "decrease_weight") {
        summary.deloadCount++;
      } else {
        summary.maintainedCount++;
      }
      
      // Check if rotation needed
      if (shouldRotateExercise(updatedData)) {
        summary.rotationSuggestions.push(exerciseData.name);
      }
      
      summary.details.push({
        exerciseName: exerciseData.name,
        recommendation,
      });
      
    } catch (error) {
      console.error(`  ❌ Error processing ${exerciseData.name}:`, error);
      skippedCount++;
      // Continue with other exercises
    }
  }
  
  // Log summary
  console.log(`\n📊 [ProgressionService] Session processed:`);
  console.log(`  ✅ Processed: ${processedCount} exercises`);
  console.log(`  ⏭️  Skipped: ${skippedCount} exercises`);
  console.log(`  📈 Progressed: ${summary.progressedCount}`);
  console.log(`  ➡️  Maintained: ${summary.maintainedCount}`);
  console.log(`  📉 Deloaded: ${summary.deloadCount}`);
  if (summary.rotationSuggestions.length > 0) {
    console.log(`  🔄 Rotation suggested: ${summary.rotationSuggestions.join(', ')}`);
  }
  
  return summary;
}

// ============================================================================
// HELPER: Get progression recommendations for next workout
// ============================================================================

/**
 * Get progression recommendations for exercises in next workout
 * This is called BEFORE workout generation to provide suggested weights
 * 
 * @param args.userId - User ID
 * @param args.exercises - Exercises planned for next workout
 * @param args.goal - User goal
 * @param args.experience - User experience level
 * @returns Map of exerciseId → recommendation
 */
export async function getNextWorkoutRecommendations(args: {
  userId: string;
  exercises: Exercise[];
  goal: Goal;
  experience: ExperienceLevel;
}): Promise<Map<string, ProgressionRecommendation>> {
  const { userId, exercises, goal, experience } = args;
  
  console.log(`\n📖 [ProgressionService] Getting recommendations for ${exercises.length} exercises...`);
  
  // Validate inputs
  if (!userId) {
    console.warn('  ⚠️  No userId provided, skipping progression recommendations');
    return new Map();
  }
  
  const recommendations = new Map<string, ProgressionRecommendation>();
  let newExercises = 0;
  let withHistory = 0;
  
  for (const exercise of exercises) {
    try {
      const progressionData = await getProgressionData(exercise.id, userId);
      
      if (!progressionData) {
        // No history: use starting weight
        const initData = initializeProgressionData({
          exerciseId: exercise.id,
          exercise,
          experience,
          goal,
        });
        
        recommendations.set(exercise.id, {
          exerciseId: exercise.id,
          action: "maintain",
          newWeight: initData.currentWeight,
          reason: "Первый раз с этим упражнением. Начинаем с консервативного веса.",
          failedLowerBound: false,
        });
        
        newExercises++;
        console.log(`  🆕 ${exercise.name}: starting weight ${initData.currentWeight}кг`);
        continue;
      }

      // Read-only recommendations:
      // - normally: return stored currentWeight (do NOT re-run progression off the same last workout)
      // - if deload is due: suggest deload weight
      const rules = PROGRESSION_RULES_BY_GOAL[goal];
      const needsDeload = progressionData.stallCount >= rules.deloadThreshold;
      const recommendation: ProgressionRecommendation = needsDeload
        ? {
            exerciseId: exercise.id,
            action: "deload",
            newWeight: Math.round(Math.max(progressionData.currentWeight * (1 - rules.deloadPercentage), 0) * 4) / 4,
            reason: `Deload: ${progressionData.stallCount} тренировок без прогресса → снижаем вес на ${rules.deloadPercentage * 100}% для восстановления.`,
            failedLowerBound: false,
          }
        : {
            exerciseId: exercise.id,
            action: "maintain",
            newWeight: progressionData.currentWeight,
            reason:
              progressionData.stallCount > 0
                ? `Вес сохраняем. Застой: ${progressionData.stallCount}/${rules.deloadThreshold}.`
                : "Текущий рабочий вес из прогрессии.",
            failedLowerBound: false,
          };
      
      recommendations.set(exercise.id, recommendation);
      withHistory++;
      
      const actionEmoji = {
        increase_weight: '📈',
        increase_reps: '📊',
        decrease_weight: '📉',
        deload: '🛌',
        maintain: '➡️',
        rotate_exercise: '🔄',
      }[recommendation.action] || '❓';
      
      console.log(`  ${actionEmoji} ${exercise.name}: ${recommendation.action} (${recommendation.newWeight || 'N/A'}кг)`);
      
    } catch (error) {
      console.error(`  ❌ Error getting recommendation for ${exercise.name}:`, error);
    }
  }
  
  console.log(`  Summary: ${withHistory} with history, ${newExercises} new exercises`);
  
  return recommendations;
}
