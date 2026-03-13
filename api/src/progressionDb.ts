// progressionDb.ts
// БД функции для прогрессии
//
// PK: (user_id, exercise_id, load_bucket)
// load_bucket = 'low_rep' | 'moderate_rep' | 'high_rep' | 'calibration'
// Каждый bucket — независимая линия прогрессии для одного упражнения.

import { q } from "./db.js";
import type { ExerciseProgressionData, ExerciseHistory } from "./progressionEngine.js";
import type { LoadBucket } from "./periodization/periodizationTypes.js";

/** Default bucket when caller doesn't specify (backward compat) */
const DEFAULT_BUCKET: LoadBucket = "moderate_rep";

function normalizeWorkoutDate(value: any): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const d = new Date(value);
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  return String(value);
}

export async function getProgressionData(
  exerciseId: string,
  userId: string,
  loadBucket?: LoadBucket,
): Promise<ExerciseProgressionData | null> {
  const bucket = loadBucket ?? DEFAULT_BUCKET;
  const rows = await q<any>(
    `SELECT * FROM exercise_progression
     WHERE user_id = $1 AND exercise_id = $2 AND load_bucket = $3`,
    [userId, exerciseId, bucket]
  );

  if (!rows.length) return null;

  const row = rows[0];

  // History is shared across all buckets (raw set data).
  // The engine derives working sets from the full history.
  const historyRows = await q<any>(
    `SELECT * FROM exercise_history
     WHERE user_id = $1 AND exercise_id = $2
     ORDER BY workout_date DESC, created_at DESC NULLS LAST, session_id DESC NULLS LAST
     LIMIT 48`,
    [userId, exerciseId]
  );

  // DB returns newest-first (DESC). Engine expects chronological order (oldest → newest)
  // so that `history[history.length - 1]` is the latest workout.
  const history: ExerciseHistory[] = historyRows.map(h => ({
    exerciseId: h.exercise_id,
    workoutDate: normalizeWorkoutDate(h.workout_date),
    sets: typeof h.sets === 'string' ? JSON.parse(h.sets) : h.sets,
  })).reverse();

  return {
    exerciseId: row.exercise_id,
    currentWeight: parseFloat(row.current_weight) || 0,
    history,
    status: row.status || "maintaining",
    stallCount: parseInt(row.stall_count) || 0,
    deloadCount: parseInt(row.deload_count) || 0,
    lastProgressDate: row.last_progress_date || null,
  };
}

export async function saveProgressionData(
  data: ExerciseProgressionData,
  userId: string,
  loadBucket?: LoadBucket,
): Promise<void> {
  const bucket = loadBucket ?? DEFAULT_BUCKET;
  await q(
    `INSERT INTO exercise_progression
      (user_id, exercise_id, load_bucket, current_weight, status, stall_count, deload_count, last_progress_date, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id, exercise_id, load_bucket)
     DO UPDATE SET
       current_weight = $4,
       status = $5,
       stall_count = $6,
       deload_count = $7,
       last_progress_date = $8,
       updated_at = NOW()`,
    [
      userId,
      data.exerciseId,
      bucket,
      data.currentWeight,
      data.status,
      data.stallCount,
      data.deloadCount,
      data.lastProgressDate || null,
    ]
  );
}

export async function saveWorkoutHistory(
  history: ExerciseHistory,
  userId: string,
  opts?: { sessionId?: string | null }
): Promise<void> {
  await q(
    `INSERT INTO exercise_history (user_id, exercise_id, workout_date, session_id, sets)
     VALUES ($1, $2, $3, $4::uuid, $5)
     ON CONFLICT (user_id, exercise_id, session_id) DO UPDATE
       SET workout_date = EXCLUDED.workout_date,
           sets = EXCLUDED.sets`,
    [userId, history.exerciseId, history.workoutDate, opts?.sessionId ?? null, JSON.stringify(history.sets)]
  );
}

export async function lockProgressionRow(args: {
  userId: string;
  exerciseId: string;
  initialWeight: number;
  loadBucket?: LoadBucket;
}): Promise<void> {
  const { userId, exerciseId, initialWeight } = args;
  const bucket = args.loadBucket ?? DEFAULT_BUCKET;
  // Ensure a row exists, then lock it to prevent concurrent lost updates across jobs.
  await q(
    `INSERT INTO exercise_progression
      (user_id, exercise_id, load_bucket, current_weight, status, stall_count, deload_count, last_progress_date, updated_at)
     VALUES ($1, $2, $3, $4, 'maintaining', 0, 0, NULL, NOW())
     ON CONFLICT (user_id, exercise_id, load_bucket) DO NOTHING`,
    [userId, exerciseId, bucket, initialWeight]
  );

  await q(
    `SELECT 1
       FROM exercise_progression
      WHERE user_id = $1 AND exercise_id = $2 AND load_bucket = $3
      FOR UPDATE`,
    [userId, exerciseId, bucket]
  );
}
