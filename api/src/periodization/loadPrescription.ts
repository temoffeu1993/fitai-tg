// periodization/loadPrescription.ts
// ============================================================================
// LOAD PRESCRIPTION LAYER (Layer 9 in 10-layer architecture)
//
// Determines the LoadContext for each exercise:
//   - Which rep bucket (calibration / low_rep / moderate_rep / high_rep)
//   - Suggested weight from bucket-aware progression
//   - Progression action guidance
//
// Owner: Load Prescription layer
// Forbidden: cannot change reps/rest/sets/exercise choice
//
// KEY CONCEPT: exerciseId + loadBucket = independent progression line.
// Heavy day bench press (4-6 reps) progresses separately from
// light day bench press (10-15 reps). They use different weights.
//
// The DB stores weight per (user_id, exercise_id, load_bucket).
// trackedWeight passed here is already the correct weight for this bucket.
// ============================================================================

import type { LoadContext, LoadBucket, DayPrescription } from "./periodizationTypes.js";

// ============================================================================
// REP RANGE → LOAD BUCKET MAPPING
// ============================================================================

/**
 * Determine the load bucket from a rep range.
 * This maps the DayPrescription's rep range to one of the canonical buckets.
 */
export function classifyLoadBucket(repsRange: [number, number]): LoadBucket {
  const midpoint = (repsRange[0] + repsRange[1]) / 2;

  if (midpoint <= 5) return "low_rep";       // 1-5 reps → strength
  if (midpoint <= 10) return "moderate_rep";  // 6-10 reps → hypertrophy
  return "high_rep";                          // 11+ reps → endurance/pump
}

// ============================================================================
// MAIN: Build LoadContext
// ============================================================================

/**
 * Build LoadContext for a single exercise.
 *
 * @param repsRange - The final rep range assigned by DayPrescription
 * @param trackedWeight - Current weight from progressionEngine for THIS bucket (may be null for new exercises)
 * @param isCalibrating - Whether this exercise is still in calibration
 * @param progressionAction - Action from progressionEngine (if available)
 * @param progressionReason - Reason from progressionEngine
 */
export function buildLoadContext(args: {
  repsRange: [number, number];
  trackedWeight: number | null;
  isCalibrating: boolean;
  progressionAction?: string;
  progressionReason?: string;
}): LoadContext {
  const { repsRange, trackedWeight, isCalibrating, progressionAction, progressionReason } = args;

  // Determine load bucket
  const loadBucket: LoadBucket = isCalibrating
    ? "calibration"
    : classifyLoadBucket(repsRange);

  // Suggested weight = tracked weight for this bucket (no multiplier needed).
  // The DB now stores independent weights per (exerciseId, loadBucket).
  let suggestedWeightToday: number | null = null;
  if (trackedWeight !== null && trackedWeight > 0) {
    suggestedWeightToday = Math.round(trackedWeight * 2) / 2; // Round to 0.5kg
  }

  // Map progression action
  let action: LoadContext["progressionAction"] = "maintain";
  if (isCalibrating) {
    action = "calibrate";
  } else if (progressionAction) {
    const mapping: Record<string, LoadContext["progressionAction"]> = {
      increase_weight: "increase_weight",
      increase_reps: "increase_reps",
      maintain: "maintain",
      decrease_weight: "decrease_weight",
      deload: "deload",
    };
    action = mapping[progressionAction] ?? "maintain";
  }

  return {
    loadBucket,
    suggestedWeightToday,
    progressionAction: action,
    progressionReason: progressionReason ?? (isCalibrating ? "Подбор рабочего веса" : ""),
  };
}

/**
 * Convenience: compute LoadContext from DayPrescription + progression data.
 */
export function buildLoadContextFromPrescription(args: {
  prescription: DayPrescription;
  role: "main" | "secondary" | "accessory" | "pump" | "conditioning";
  exerciseId: string;
  trackedWeight: number | null;
  isCalibrating: boolean;
  progressionAction?: string;
  progressionReason?: string;
}): LoadContext {
  const { prescription, role, trackedWeight, isCalibrating, progressionAction, progressionReason } = args;

  // Get the rep range for this role from the prescription
  const repsRange = prescription.repProfile[role];

  return buildLoadContext({
    repsRange,
    trackedWeight,
    isCalibrating,
    progressionAction,
    progressionReason,
  });
}
