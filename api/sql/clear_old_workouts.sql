-- Clear old workouts that don't have new exercise fields (technique, equipment, etc.)
-- This ensures users see fresh workouts with complete data

BEGIN;

-- Delete old planned workouts (they will be regenerated with new fields)
DELETE FROM planned_workouts 
WHERE created_at < NOW() - INTERVAL '1 hour';

-- Optional: Also clear old weekly plans
DELETE FROM weekly_plans 
WHERE created_at < NOW() - INTERVAL '1 hour';

COMMIT;

-- Verify
SELECT 
  COUNT(*) as remaining_planned_workouts,
  MAX(created_at) as newest
FROM planned_workouts;

SELECT 
  COUNT(*) as remaining_weekly_plans,
  MAX(created_at) as newest
FROM weekly_plans;
