// periodization/calibration.ts
// ============================================================================
// CALIBRATION LAYER: Determines if exercises have enough history
// for periodization and load progression.
//
// Owner: Calibration layer
// Forbidden: cannot change split, week plan, exercise list
//
// KEY RULE: Calibration is PER-EXERCISE, not per-day.
// One uncalibrated exercise does NOT disable DUP for the whole day.
// Instead, that exercise gets a safe mid-range override while others
// can still receive their DUP-prescribed rep range.
//
// Threshold: ≥2 valid exposures (with recorded working weights) needed
// to exit calibration for an exercise or pattern.
// ============================================================================

import type { CalibrationContext, ExperienceLevel } from "./periodizationTypes.js";
import type { Goal } from "../normalizedSchemes.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum valid exposures needed to exit calibration */
const MIN_EXPOSURES_FOR_CALIBRATION = 2;

/** Safe rep floors by experience level (never go below this in calibration) */
const SAFE_REP_FLOOR: Record<ExperienceLevel, number> = {
  beginner: 8,      // 8+ reps for safety and technique
  intermediate: 6,  // can handle moderate weight
  advanced: 6,      // even advanced shouldn't go below 6 on new exercises
};

// ============================================================================
// TYPES for history data
// ============================================================================

export interface ExerciseExposureSummary {
  exerciseId: string;
  pattern: string;
  /** Number of completed workouts where this exercise had valid working weights */
  validExposures: number;
  /** Whether this exercise has any recorded weights > 0 */
  hasRecordedWeights: boolean;
}

// ============================================================================
// MAIN: Build CalibrationContext
// ============================================================================

/**
 * Build CalibrationContext from exercise history summaries.
 *
 * @param exerciseSummaries - Summary of each exercise's training history.
 *   In the current system, this comes from exercise_progression + exercise_history tables.
 *   On first workout (no history), pass an empty array.
 *
 * @param plannedExerciseIds - IDs of ALL exercises planned for today's workout.
 *   Used to build the per-exercise calibration map (covers every exercise).
 *
 * @param globalLogicExerciseIds - (Optional) IDs of main/secondary exercises only.
 *   Used for globalCalibrationMode and periodizationAllowed.
 *   If not provided, falls back to plannedExerciseIds.
 *   Reason: one calibrated accessory (biceps curl) should NOT keep
 *   globalCalibrationMode = false when all main/secondary are new.
 *
 * @param experience - User's experience level.
 */
export function buildCalibrationContext(args: {
  exerciseSummaries: ExerciseExposureSummary[];
  plannedExerciseIds: string[];
  globalLogicExerciseIds?: string[];
  plannedPatterns: string[];
  experience: ExperienceLevel;
  goal: Goal;
}): CalibrationContext {
  const { exerciseSummaries, plannedExerciseIds, plannedPatterns, experience, goal } = args;
  const globalIds = args.globalLogicExerciseIds ?? plannedExerciseIds;

  // Build lookup maps
  const summaryByExercise = new Map<string, ExerciseExposureSummary>();
  const summaryByPattern = new Map<string, ExerciseExposureSummary[]>();

  for (const s of exerciseSummaries) {
    summaryByExercise.set(s.exerciseId, s);
    const existing = summaryByPattern.get(s.pattern) || [];
    existing.push(s);
    summaryByPattern.set(s.pattern, existing);
  }

  // ── Per-exercise calibration (ALL exercises) ──
  const calibrationByExercise = new Map<string, boolean>();
  let uncalibratedCount = 0;

  for (const exId of plannedExerciseIds) {
    const summary = summaryByExercise.get(exId);
    const isCalibrated = summary
      ? summary.validExposures >= MIN_EXPOSURES_FOR_CALIBRATION && summary.hasRecordedWeights
      : false;
    calibrationByExercise.set(exId, !isCalibrated);
    if (!isCalibrated) uncalibratedCount++;
  }

  // ── Per-pattern calibration ──
  // Pattern is calibrated if ANY exercise in that pattern is calibrated
  const calibrationByPattern = new Map<string, boolean>();

  for (const pattern of plannedPatterns) {
    const patternSummaries = summaryByPattern.get(pattern) || [];
    const patternCalibrated = patternSummaries.some(
      s => s.validExposures >= MIN_EXPOSURES_FOR_CALIBRATION && s.hasRecordedWeights
    );
    calibrationByPattern.set(pattern, !patternCalibrated);
  }

  // ── Global calibration mode (main/secondary only) ──
  // Global = ALL main/secondary exercises lack history (very first workouts).
  // Uses globalIds (main/secondary) so accessories don't affect this decision.
  let globalUncalibratedCount = 0;
  for (const exId of globalIds) {
    if (calibrationByExercise.get(exId) !== false) globalUncalibratedCount++;
  }
  const globalCalibrationMode = globalIds.length > 0 &&
    globalUncalibratedCount === globalIds.length;

  // ── Periodization allowed? ──
  // Periodization is allowed even if some exercises are uncalibrated.
  // Those exercises get per-exercise override; the rest can use DUP.
  // Only block periodization globally if ALL main/secondary are uncalibrated.
  const periodizationAllowed = !globalCalibrationMode;

  // ── Safe rep floor ──
  const safeRepFloor = SAFE_REP_FLOOR[experience];

  // ── Starter load mode (ALL exercises) ──
  // Uses uncalibratedCount from the full loop — if ANY exercise is new, starter mode.
  const starterLoadMode = globalCalibrationMode
    ? "starter"
    : uncalibratedCount > 0
      ? "starter" // mixed: some exercises need starter guidance
      : "progression";

  return {
    globalCalibrationMode,
    calibrationByExercise,
    calibrationByPattern,
    periodizationAllowed,
    safeRepFloor,
    starterLoadMode,
  };
}

/**
 * Check if a specific exercise should get calibration override.
 * Used by Exercise Prescription layer to override DUP rep range
 * for uncalibrated exercises.
 */
export function isExerciseCalibrated(
  calibration: CalibrationContext,
  exerciseId: string,
  pattern: string,
): boolean {
  // Check exercise-level first
  const exCalibrating = calibration.calibrationByExercise.get(exerciseId);
  if (exCalibrating !== undefined) return !exCalibrating;

  // Fallback to pattern-level
  const patternCalibrating = calibration.calibrationByPattern.get(pattern);
  if (patternCalibrating !== undefined) return !patternCalibrating;

  // No data at all → not calibrated
  return false;
}
