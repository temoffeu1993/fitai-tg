-- Migration: generation_id for planned_workouts batch tracking
-- 2026-02-20
--
-- Each weekly generation batch gets a single UUID (generation_id).
-- The schedule query uses this to show only the LATEST batch's workouts,
-- hiding completed/pending rows from older generations.

-- 1. Add nullable column (existing rows get NULL = legacy batch)
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS generation_id UUID;

-- 2. Index for fast "latest generation per user" lookup
CREATE INDEX IF NOT EXISTS idx_planned_workouts_user_generation
  ON planned_workouts (user_id, generation_id);
