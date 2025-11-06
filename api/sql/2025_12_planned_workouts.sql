-- api/sql/2025_12_planned_workouts.sql
CREATE TABLE IF NOT EXISTS planned_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan JSONB NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  result_session_id UUID REFERENCES workout_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planned_workouts_user_time
  ON planned_workouts(user_id, scheduled_for DESC);

CREATE OR REPLACE FUNCTION set_planned_workout_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_planned_workout_updated_at ON planned_workouts;
CREATE TRIGGER trg_set_planned_workout_updated_at
BEFORE UPDATE ON planned_workouts
FOR EACH ROW EXECUTE FUNCTION set_planned_workout_updated_at();
