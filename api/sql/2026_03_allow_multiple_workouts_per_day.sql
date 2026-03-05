-- Migration: allow multiple workouts per day per user.
-- Drop the UNIQUE index and create a regular one.
-- 2026-03-06

DROP INDEX IF EXISTS idx_planned_workouts_user_date;
CREATE INDEX IF NOT EXISTS idx_planned_workouts_user_date
  ON planned_workouts(user_id, workout_date);
