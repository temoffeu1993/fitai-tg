-- Таблица обхватов тела для отслеживания трансформации
CREATE TABLE IF NOT EXISTS body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  chest_cm NUMERIC(5,1),
  waist_cm NUMERIC(5,1),
  hips_cm NUMERIC(5,1),
  bicep_left_cm NUMERIC(5,1),
  bicep_right_cm NUMERIC(5,1),
  neck_cm NUMERIC(5,1),
  thigh_cm NUMERIC(5,1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user
  ON body_measurements(user_id, recorded_at DESC);
