import { q } from "./db.js";

export type ExerciseChangeAction =
  | "replace"
  | "remove"
  | "skip"
  | "exclude"
  | "include";

export type ExerciseChangeEventInput = {
  userId: string;
  plannedWorkoutId?: string | null;
  sessionId?: string | null;
  action: ExerciseChangeAction;
  fromExerciseId?: string | null;
  toExerciseId?: string | null;
  reason?: string | null;
  source?: string | null;
  meta?: any | null;
};

export async function logExerciseChangeEvent(e: ExerciseChangeEventInput): Promise<void> {
  await q(
    `
    INSERT INTO exercise_change_events (
      user_id, planned_workout_id, session_id,
      action, from_exercise_id, to_exercise_id, reason, source, meta
    )
    VALUES (
      $1::uuid, $2::uuid, $3::uuid,
      $4, $5, $6, $7, $8, $9::jsonb
    )
  `,
    [
      e.userId,
      e.plannedWorkoutId ?? null,
      e.sessionId ?? null,
      e.action,
      e.fromExerciseId ?? null,
      e.toExerciseId ?? null,
      e.reason ?? null,
      e.source ?? null,
      e.meta != null ? JSON.stringify(e.meta) : null,
    ]
  );
}

