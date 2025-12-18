// progressionDb.ts
// БД функции для прогрессии

import { q } from "./db.js";
import type { ExerciseProgressionData, ExerciseHistory } from "./progressionEngine.js";

export async function getProgressionData(
  exerciseId: string,
  userId: string
): Promise<ExerciseProgressionData | null> {
  const rows = await q<any>(
    `SELECT * FROM exercise_progression 
     WHERE user_id = $1::uuid AND exercise_id = $2`,
    [userId, exerciseId]
  );

  if (!rows.length) return null;

  const row = rows[0];

  const historyRows = await q<any>(
    `SELECT * FROM exercise_history 
     WHERE user_id = $1::uuid AND exercise_id = $2 
     ORDER BY workout_date DESC LIMIT 48`,
    [userId, exerciseId]
  );

  const history: ExerciseHistory[] = historyRows.map(h => ({
    exerciseId: h.exercise_id,
    workoutDate: h.workout_date,
    sets: typeof h.sets === 'string' ? JSON.parse(h.sets) : h.sets,
  }));

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
  userId: string
): Promise<void> {
  await q(
    `INSERT INTO exercise_progression 
      (user_id, exercise_id, current_weight, status, stall_count, deload_count, last_progress_date, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id, exercise_id) 
     DO UPDATE SET
       current_weight = $3,
       status = $4,
       stall_count = $5,
       deload_count = $6,
       last_progress_date = $7,
       updated_at = NOW()`,
    [
      userId,
      data.exerciseId,
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
  userId: string
): Promise<void> {
  await q(
    `INSERT INTO exercise_history (user_id, exercise_id, workout_date, sets)
     VALUES ($1::uuid, $2, $3, $4)`,
    [userId, history.exerciseId, history.workoutDate, JSON.stringify(history.sets)]
  );
}
