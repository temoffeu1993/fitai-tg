-- Migration: atomic per-user session counter + session_number in workout_sessions
-- 2026-02-19

-- 1. Atomic counter table (row-level lock on UPSERT guarantees uniqueness)
CREATE TABLE IF NOT EXISTS user_session_counters (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_count INTEGER NOT NULL DEFAULT 0
);

-- 2. Initialise counter from existing workout_sessions data
INSERT INTO user_session_counters (user_id, session_count)
SELECT user_id, COUNT(*)::integer
FROM workout_sessions
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE
  SET session_count = EXCLUDED.session_count;

-- 3. Add session_number column (nullable first, to allow backfill)
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS session_number INTEGER;

-- 4. Backfill existing rows deterministically (finished_at, id as tiebreaker)
UPDATE workout_sessions ws
SET session_number = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY finished_at, id
         ) AS rn
  FROM workout_sessions
) sub
WHERE ws.id = sub.id;

-- 5. Now enforce NOT NULL
ALTER TABLE workout_sessions
  ALTER COLUMN session_number SET NOT NULL;

-- 6. Enforce uniqueness (safety net — UPSERT counter is the primary guarantee)
ALTER TABLE workout_sessions
  ADD CONSTRAINT uq_workout_sessions_user_session_number
  UNIQUE (user_id, session_number);

-- NOTE: api/src/plan.ts has a dead INSERT into workout_sessions (router is
-- disabled in index.ts). If it's ever re-enabled it must also do the counter
-- UPSERT and pass session_number, otherwise the NOT NULL constraint will reject
-- the insert.
