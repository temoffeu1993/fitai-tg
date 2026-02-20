-- Migration: ensure UNIQUE index on (user_id, workout_date) exists.
-- This index is required by ON CONFLICT (user_id, workout_date) in workoutGeneration.ts.
-- One workout per user per date is a business rule.
-- 2026-02-20

CREATE UNIQUE INDEX IF NOT EXISTS idx_planned_workouts_user_date
  ON planned_workouts(user_id, workout_date);
