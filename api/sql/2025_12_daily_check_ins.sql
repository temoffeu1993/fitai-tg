-- daily_check_ins table for per-day state
CREATE TABLE IF NOT EXISTS daily_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  injuries TEXT[],
  limitations TEXT[],
  pain JSONB,

  sleep_hours NUMERIC(3,1),
  sleep_quality TEXT CHECK (sleep_quality IN ('poor', 'fair', 'good', 'excellent')),
  stress_level TEXT CHECK (stress_level IN ('low', 'medium', 'high', 'very_high')),
  energy_level TEXT CHECK (energy_level IN ('low', 'medium', 'high')),

  motivation TEXT CHECK (motivation IN ('low', 'medium', 'high')),
  mood TEXT,

  menstrual_phase TEXT CHECK (menstrual_phase IN ('follicular', 'ovulation', 'luteal', 'menstruation')),
  menstrual_symptoms TEXT[],

  hydration TEXT CHECK (hydration IN ('poor', 'adequate', 'good')),
  last_meal TEXT,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- один чек-ин в сутки (UTC) через уникальный индекс с выражением
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_checkins_user_date
  ON daily_check_ins(user_id, ((created_at AT TIME ZONE 'UTC')::date));

CREATE INDEX IF NOT EXISTS idx_daily_checkins_created_at ON daily_check_ins(created_at DESC);

CREATE OR REPLACE FUNCTION update_daily_check_ins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_check_ins_updated_at ON daily_check_ins;
CREATE TRIGGER daily_check_ins_updated_at
  BEFORE UPDATE ON daily_check_ins
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_check_ins_updated_at();

COMMENT ON TABLE daily_check_ins IS 'Ежедневные данные о состоянии пользователя перед тренировкой';
