-- api/sql/2025_02_async_workout_plans.sql
CREATE TABLE IF NOT EXISTS workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing',
  plan JSONB,
  analysis JSONB,
  error_info TEXT,
  progress_stage TEXT,
  progress_percent INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_plans_user_created
  ON workout_plans(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_workout_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_workout_plan_updated_at ON workout_plans;
CREATE TRIGGER trg_set_workout_plan_updated_at
BEFORE UPDATE ON workout_plans
FOR EACH ROW EXECUTE FUNCTION set_workout_plan_updated_at();
