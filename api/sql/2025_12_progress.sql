-- api/sql/2025_12_progress.sql
CREATE TABLE IF NOT EXISTS body_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL,
  weight NUMERIC(6,2),
  body_fat NUMERIC(5,2),
  muscle_mass NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_body_metrics_user_date
  ON body_metrics(user_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_body_metrics_user_time
  ON body_metrics(user_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION set_body_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_body_metrics_updated_at ON body_metrics;
CREATE TRIGGER trg_set_body_metrics_updated_at
BEFORE UPDATE ON body_metrics
FOR EACH ROW EXECUTE FUNCTION set_body_metrics_updated_at();
