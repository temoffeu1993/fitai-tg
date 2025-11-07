ALTER TABLE nutrition_plans
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS error_info text;

UPDATE nutrition_plans
SET status = 'ready'
WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_status
  ON nutrition_plans(status);
