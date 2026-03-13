// periodization/calibrationDb.ts
// ============================================================================
// DB queries for calibration layer.
// Extracted from workoutGeneration.ts to avoid circular imports
// (workoutGeneration → workoutDayGenerator → workoutGeneration).
// ============================================================================

import { q } from "../db.js";
import { EXERCISE_LIBRARY } from "../exerciseLibrary.js";
import type { ExerciseExposureSummary } from "./calibration.js";

const EXERCISE_BY_ID = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e] as const));

/**
 * Fetch exposure summaries for a list of exercises.
 * Used by calibration layer to determine which exercises
 * have enough history for periodization.
 */
export async function getExerciseExposureSummaries(
  userId: string,
  exerciseIds: string[],
): Promise<ExerciseExposureSummary[]> {
  if (!userId || exerciseIds.length === 0) return [];

  try {
    const rows = await q<{
      exercise_id: string;
      valid_exposures: string;
      has_weights: boolean;
    }>(
      `SELECT
         eh.exercise_id,
         COUNT(DISTINCT eh.session_id)::text AS valid_exposures,
         COALESCE(BOOL_OR(ep.current_weight > 0), false) AS has_weights
       FROM exercise_history eh
       LEFT JOIN exercise_progression ep
         ON ep.user_id = eh.user_id AND ep.exercise_id = eh.exercise_id
       WHERE eh.user_id = $1
         AND eh.exercise_id = ANY($2)
       GROUP BY eh.exercise_id`,
      [userId, exerciseIds],
    );

    return rows.map((r) => {
      const libEx = EXERCISE_BY_ID.get(r.exercise_id);
      return {
        exerciseId: r.exercise_id,
        pattern: (libEx as any)?.patterns?.[0] ?? "",
        validExposures: parseInt(r.valid_exposures, 10) || 0,
        hasRecordedWeights: r.has_weights,
      };
    });
  } catch (err) {
    console.warn("[Periodization] Failed to fetch exposure summaries:", err);
    return [];
  }
}
