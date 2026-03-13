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
  lockProgressionRow,
} from "./progressionDb.js";

import { classifyLoadBucket } from "./periodization/loadPrescription.js";
import type { LoadBucket } from "./periodization/periodizationTypes.js";

import { q } from "./db.js";

function isProgressionDebug(): boolean {
  const v = process.env.DEBUG_PROGRESSION || process.env.DEBUG_AI || "";
  if (v === "1" || v === "true") return true;
  return String(v).toLowerCase().includes("progression");
}

function progLog(...args: any[]) {
  if (!isProgressionDebug()) return;
  console.log(...args);
}

// ============================================================================
// TYPES: Payload structure from frontend
// ============================================================================

/**
 * Frontend effort mapping (from WorkoutSession.tsx)
 */
type FrontendEffort = "easy" | "working" | "quite_hard" | "hard" | "max";

/**
 * Set data from frontend
 */
type FrontendSet = {
  reps?: number;
  weight?: number;
  /** True when user explicitly marked this set as done (tapped checkmark). Absent in legacy payloads. */
  done?: boolean;
};

/**
 * Exercise data from frontend payload
 */
type FrontendExercise = {
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
type SessionPayload = {
  title: string;
  location?: string;
  durationMin: number;
  exercises: FrontendExercise[];
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
 * Parse target reps range from string/number/tuple.
 * Examples: "6-10" → [6, 10], 12 → [8, 12], "8-12" → [8, 12]
 */
function parseRepsRange(reps: unknown): [number, number] {
  if (!reps) return [8, 12]; // default

  // Array/tuple: [6,10] (common payload form from frontend)
  if (Array.isArray(reps) && reps.length >= 2) {
    const a = Number(reps[0]);
    const b = Number(reps[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      let min = Math.max(1, Math.min(50, Math.round(a)));
      let max = Math.max(1, Math.min(50, Math.round(b)));
      if (min > max) [min, max] = [max, min];
      return [min, max];
    }
  }
  
  if (typeof reps === 'number') {
    // Single number: use ±2 range
    const min = Math.max(1, Math.min(50, reps - 2));
    const max = Math.max(1, Math.min(50, reps + 2));
    return min <= max ? [min, max] : [max, min];
  }
  
  // String: "6-10", "8–12", "10"
  const s = String(reps).trim();
  const match = s.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (match) {
    let min = Math.max(1, Math.min(50, Number(match[1])));
    let max = Math.max(1, Math.min(50, Number(match[2])));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [8, 12];
    if (min > max) [min, max] = [max, min];
    return [min, max];
  }

  // Comma-delimited: "6,10" (can happen if array got stringified)
  const comma = s.match(/(\d+)\s*,\s*(\d+)/);
  if (comma) {
    let min = Math.max(1, Math.min(50, Number(comma[1])));
    let max = Math.max(1, Math.min(50, Number(comma[2])));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [8, 12];
    if (min > max) [min, max] = [max, min];
    return [min, max];
  }
  
  // Single number as string
  const num = Number(s);
  if (Number.isFinite(num) && num > 0) {
    const min = Math.max(1, Math.min(50, num - 2));
    const max = Math.max(1, Math.min(50, num + 2));
    return min <= max ? [min, max] : [max, min];
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
    const exactFound = Boolean(found);
    
    // If not found, try partial match
    if (!found) {
      found = EXERCISE_LIBRARY.find(ex => {
        const exNorm = normalize(ex.name);
        return exNorm.includes(searchNorm) || searchNorm.includes(exNorm);
      });
    }
    
    if (found) {
      if (!exactFound) {
        console.warn(
          `  [ProgressionService] ⚠️ Fuzzy matched "${name}" → "${found.name}". ` +
          `Consider passing exercise ID from frontend for accuracy.`
        );
      }
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
  progLog(`  [ProgressionService][debug] plannedWorkoutId=${plannedWorkoutId || "null"} sessionId=${sessionId || "null"}`);

  // Optional planned workout context (for adherence + recovery/shortened detection)
  const plannedSetsByExerciseId = new Map<string, number>();
  const plannedSetsByNameNorm = new Map<string, number>();
  let plannedIntent: string | undefined;

  if (plannedWorkoutId) {
    try {
      const rows = await q<{ plan: any }>(
        `SELECT COALESCE(base_plan, plan) AS plan FROM planned_workouts WHERE id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
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
  
  // Determine if the payload uses the done flag (newer frontend sends done on exercises).
  // Legacy payloads (done is undefined on all exercises) → treat all as done to avoid regression.
  const anyHasDone = payload.exercises.some((ex) => typeof ex.done === "boolean");

  let processedCount = 0;
  let skippedCount = 0;

  const effortRank: Record<FrontendEffort, number> = {
    easy: 1,
    working: 2,
    quite_hard: 3,
    hard: 4,
    max: 5,
  };

  type AggregatedExercise = {
    exercise: Exercise;
    name: string;
    reps?: string | number;
    effort?: FrontendEffort;
    repsSets: FrontendSet[]; // reps-only sets (concatenated across duplicates)
  };

  // Resolve exercises to library IDs and aggregate duplicates per resolved exercise.id.
  const aggregated = new Map<string, AggregatedExercise>();
  for (const input of payload.exercises) {
    progLog(`\n  [ProgressionService][debug] Exercise payload:`, {
      id: input.id,
      name: input.name,
      reps: input.reps,
      effort: input.effort,
      setsCount: Array.isArray(input.sets) ? input.sets.length : 0,
    });

    // Skip exercises that were not completed (only when payload uses done flag).
    // Legacy payloads (done undefined on all) treat every exercise as done.
    if (anyHasDone && input.done === false) {
      console.log(`  ⏭️  Skipping "${input.name}" (done=false — exercise not completed)`);
      skippedCount++;
      continue;
    }

    if (!input.sets || input.sets.length === 0) {
      console.log(`  ⏭️  Skipping "${input.name}" (no sets recorded)`);
      skippedCount++;
      continue;
    }

    // Filter sets: if any set carries a done flag (newer frontend), exclude done=false sets.
    // Legacy payloads (done absent on all sets) → keep all sets with reps.
    const setsHaveDone = input.sets.some((s) => typeof s.done === "boolean");
    const repsSets = input.sets.filter((s) =>
      (s.reps ?? 0) > 0 && (!setsHaveDone || s.done !== false)
    );
    if (repsSets.length === 0) {
      console.log(`  ⏭️  Skipping "${input.name}" (no reps recorded)`);
      skippedCount++;
      continue;
    }

    const exercise =
      (input.id ? await findExerciseById(input.id) : null) ?? (await findExerciseByName(input.name));
    if (!exercise) {
      console.warn(`  ⚠️  Exercise not found: "${input.name}" - skipping progression`);
      skippedCount++;
      continue;
    }

    const key = exercise.id;
    const prev = aggregated.get(key);
    if (!prev) {
      aggregated.set(key, {
        exercise,
        name: input.name || exercise.name,
        reps: input.reps,
        effort: input.effort,
        repsSets: [...repsSets],
      });
      continue;
    }

    prev.repsSets.push(...repsSets);
    if (prev.reps == null && input.reps != null) prev.reps = input.reps;
    if (prev.effort == null && input.effort != null) prev.effort = input.effort;
    if (prev.effort != null && input.effort != null) {
      if ((effortRank[input.effort] ?? 0) > (effortRank[prev.effort] ?? 0)) {
        prev.effort = input.effort;
      }
    }
  }

  // Process each unique exercise once
  for (const exerciseData of aggregated.values()) {
    const exercise = exerciseData.exercise;

    summary.totalExercises++;
    processedCount++;

    try {
      const init = initializeProgressionData({
        exerciseId: exercise.id,
        exercise,
        experience,
      });

      // Parse target reps range & determine load bucket for this exercise
      const targetRepsRange = parseRepsRange(exerciseData.reps);
      const loadBucket: LoadBucket = classifyLoadBucket(targetRepsRange);
      progLog(`  [ProgressionService][debug] targetRepsRange=${targetRepsRange[0]}-${targetRepsRange[1]} loadBucket=${loadBucket}`);

      // Prevent concurrent lost updates for this exercise+bucket across parallel jobs/sessions.
      await lockProgressionRow({ userId, exerciseId: exercise.id, initialWeight: init.currentWeight, loadBucket });

      const progressionData = (await getProgressionData(exercise.id, userId, loadBucket)) ?? init;
      
      // Map frontend effort to RPE
      const avgRpe = mapEffortToRPE(exerciseData.effort);
      progLog(`  [ProgressionService][debug] mappedSetRpe=${avgRpe}`);
      
      // Build full ExerciseHistory (store all reps-based sets)
      const fullHistory: ExerciseHistory = {
        exerciseId: exercise.id,
        workoutDate,
        sets: exerciseData.repsSets.map((s) => ({
          targetReps: targetRepsRange[1], // upper bound as target
          actualReps: s.reps ?? 0,
          weight: s.weight ?? 0,
          rpe: avgRpe,
          // completed = performed set (reps are present)
          completed: (s.reps ?? 0) > 0,
        })),
      };

      // Working sets are a derivation rule (single source of truth in engine).
      // For weightInverted (assisted) exercises, "working" = lightest sets (most resistance).
      const weightInverted = Boolean((exercise as any).weightInverted);
      const workingHistory = deriveWorkingHistory(fullHistory, weightInverted);
      progLog(
        `  [ProgressionService][debug] workingSets=${workingHistory.sets.length}/${fullHistory.sets.length} weightInverted=${weightInverted}`,
        workingHistory.sets.map((s) => ({ reps: s.actualReps, weight: s.weight }))
      );

      const hasAnyRecordedWeight = exerciseData.repsSets.some((s: any) => {
        const w = s?.weight;
        return typeof w === "number" && Number.isFinite(w) && w > 0;
      });
      const missingWeightData = requiresExternalLoad(exercise.equipment) && !hasAnyRecordedWeight;
      progLog(
        `  [ProgressionService][debug] equipment=${exercise.equipment.join(",")} requiresLoad=${requiresExternalLoad(exercise.equipment)} hasAnyWeight=${hasAnyRecordedWeight} missingWeightData=${missingWeightData}`
      );

      // Sync effective currentWeight with what user actually performed.
      // For normal exercises: use median of working weights (middle of working range).
      // For inverted (assisted): use MINIMUM weight (= most resistance = actual working weight).
      const workingWeights = workingHistory.sets
        .map((s) => s.weight)
        .filter((w) => typeof w === "number" && w > 0)
        .sort((a, b) => a - b);
      const effectiveCurrentWeight =
        workingWeights.length > 0
          ? weightInverted
            ? workingWeights[0] // min = hardest for assisted
            : workingWeights[Math.floor(workingWeights.length / 2)] // median for normal
          : progressionData.currentWeight;
      progLog(
        `  [ProgressionService][debug] currentWeight(db)=${progressionData.currentWeight} effectiveCurrentWeight=${effectiveCurrentWeight} workingWeights=${workingWeights}`
      );

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
      progLog(
        `  [ProgressionService][debug] plannedSets=${plannedSets ?? "n/a"} performedSets=${performedSets} shortened=${shortened}`
      );

      const antiOverreach =
        exerciseData.effort === "hard" ||
        exerciseData.effort === "max";

      // Check if this muscle group was trained too recently (< 48 h = insufficient recovery).
      // workoutDate may be a date-only string (YYYY-MM-DD) — treat same-day as 0 h → still too soon.
      // Uses the last entry in progressionData.history.
      const MIN_RECOVERY_HOURS = 48;
      let tooSoonReason: string | undefined;
      if (progressionData.history.length > 0) {
        const lastEntry = progressionData.history[progressionData.history.length - 1];
        if (lastEntry?.workoutDate) {
          const lastMs = new Date(lastEntry.workoutDate).getTime();
          const nowMs = new Date(workoutDate).getTime();
          const diffH = (nowMs - lastMs) / (1000 * 60 * 60);
          // diffH >= 0: same day (0 h) is still "too soon".
          // diffH < 0: clock skew / duplicate job — skip to avoid false positives.
          if (Number.isFinite(diffH) && diffH >= 0 && diffH < MIN_RECOVERY_HOURS) {
            const diffLabel = diffH < 1 ? "< 1" : String(Math.round(diffH));
            tooSoonReason = `слишком короткий интервал между тренировками (${diffLabel}ч < ${MIN_RECOVERY_HOURS}ч)`;
            progLog(
              `  [ProgressionService][debug] tooSoon=${tooSoonReason} lastWorkout=${lastEntry.workoutDate} current=${workoutDate}`
            );
          }
        }
      }

      const doNotPenalize =
        plannedIntent === "light" ||
        Boolean(recoveryReason) ||
        Boolean(tooSoonReason) ||
        missingWeightData ||
        shortened ||
        workingHistory.sets.length < 2;
      progLog(
        `  [ProgressionService][debug] plannedIntent=${plannedIntent ?? "n/a"} recoveryReason=${recoveryReason ?? "n/a"} tooSoonReason=${tooSoonReason ?? "n/a"} doNotPenalize=${doNotPenalize} antiOverreach=${antiOverreach}`
      );

      const doNotPenalizeReason =
        plannedIntent === "light"
          ? "лёгкий день по плану"
          : recoveryReason
            ? `чек-ин: ${recoveryReason}`
            : tooSoonReason
              ? tooSoonReason
              : missingWeightData
                ? "не указан вес в подходах (для прогрессии нужен вес хотя бы в рабочих подходах)"
                : shortened && plannedSets
                  ? `сокращённая тренировка (${performedSets}/${plannedSets} подходов)`
                  : workingHistory.sets.length < 2
                    ? "недостаточно рабочих подходов"
                    : undefined;

      const context: ProgressionContext = {
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
      progLog(
        `  [ProgressionService][debug] recommendation`,
        {
          action: recommendation.action,
          newWeight: recommendation.newWeight,
          newRepsTarget: recommendation.newRepsTarget,
          failedLowerBound: recommendation.failedLowerBound,
          reason: recommendation.reason,
          explain: recommendation.explain,
        }
      );
      
      // Update progression data based on recommendation
      const updatedData = updateProgressionData({
        progressionData: progressionDataForCalc,
        workoutHistory: fullHistory,
        recommendation,
        goal,
      });
      progLog(
        `  [ProgressionService][debug] updatedData`,
        {
          currentWeight: updatedData.currentWeight,
          stallCount: updatedData.stallCount,
          deloadCount: updatedData.deloadCount,
          status: updatedData.status,
          lastProgressDate: updatedData.lastProgressDate ?? null,
        }
      );
      
      // Save to database (bucket-aware)
      progLog(`  [ProgressionService][debug] saving progression/history to DB (bucket=${loadBucket})...`);
      await saveProgressionData(updatedData, userId, loadBucket);
      await saveWorkoutHistory(fullHistory, userId, { sessionId });
      progLog(
        `  [ProgressionService][debug] saved ✅`,
        { exerciseId: exercise.id, workoutDate, sessionId: sessionId ?? null, setsSaved: fullHistory.sets.length }
      );
      
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
  /** Optional per-exercise load bucket. If provided, queries the bucket-specific progression line. */
  loadBuckets?: Map<string, LoadBucket>;
}): Promise<Map<string, ProgressionRecommendation>> {
  const { userId, exercises, goal, experience, loadBuckets } = args;

  progLog(`\n📖 [ProgressionService] Getting recommendations for ${exercises.length} exercises...`);

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
      const bucket = loadBuckets?.get(exercise.id);
      const progressionData = await getProgressionData(exercise.id, userId, bucket);
      
      if (!progressionData) {
        // No history: use starting weight
        const initData = initializeProgressionData({
          exerciseId: exercise.id,
          exercise,
          experience,
        });

        recommendations.set(exercise.id, {
          exerciseId: exercise.id,
          action: "maintain",
          newWeight: initData.currentWeight,
          reason: "Первый раз — подберите вес.",
          failedLowerBound: false,
        });
        
        newExercises++;
        progLog(`  🆕 ${exercise.name}: starting weight ${initData.currentWeight}кг`);
        continue;
      }

      // Read-only recommendations:
      // - normally: return stored currentWeight (do NOT re-run progression off the same last workout)
      // - if deload is due: suggest deload weight
      const rules = PROGRESSION_RULES_BY_GOAL[goal];
      const needsDeload = progressionData.stallCount >= rules.deloadThreshold;
      const weightInvertedNext = Boolean((exercise as any).weightInverted);
      // For assisted (inverted) exercises, deload = MORE assistance (higher machine weight = easier).
      const deloadWeight = weightInvertedNext
        ? Math.round(progressionData.currentWeight * (1 + rules.deloadPercentage) * 4) / 4
        : Math.round(Math.max(progressionData.currentWeight * (1 - rules.deloadPercentage), 0) * 4) / 4;
      const deloadReason = weightInvertedNext
        ? `Deload: ${progressionData.stallCount} тренировок без прогресса → увеличиваем противовес на ${rules.deloadPercentage * 100}% для восстановления.`
        : `Deload: ${progressionData.stallCount} тренировок без прогресса → снижаем вес на ${rules.deloadPercentage * 100}% для восстановления.`;
      const recommendation: ProgressionRecommendation = needsDeload
        ? {
            exerciseId: exercise.id,
            action: "deload",
            newWeight: deloadWeight,
            reason: deloadReason,
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
      }[recommendation.action] || '❓';
      
      progLog(`  ${actionEmoji} ${exercise.name}: ${recommendation.action} (${recommendation.newWeight || 'N/A'}кг)`);
      
    } catch (error) {
      console.error(`  ❌ Error getting recommendation for ${exercise.name}:`, error);
    }
  }
  
  progLog(`  Summary: ${withHistory} with history, ${newExercises} new exercises`);
  
  return recommendations;
}
