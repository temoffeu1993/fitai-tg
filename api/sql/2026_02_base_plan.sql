-- Migration: add base_plan column and backfill from plan.
-- Preserves the original weekly plan so /workout/start can be re-run
-- with different check-in without "sticking" to a previous adaptation.
-- 2026-02-20

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS base_plan JSONB NULL;

UPDATE planned_workouts
  SET base_plan = plan
  WHERE base_plan IS NULL;
