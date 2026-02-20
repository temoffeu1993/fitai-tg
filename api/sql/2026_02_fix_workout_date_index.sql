-- Migration: replace UNIQUE index on workout_date with a regular one.
-- A user may have multiple workouts on the same date (e.g. morning + evening),
-- so the UNIQUE constraint is too strict.
-- 2026-02-20

DROP INDEX IF EXISTS idx_planned_workouts_user_date;

CREATE INDEX IF NOT EXISTS idx_planned_workouts_user_date
  ON planned_workouts(user_id, workout_date);
