-- Миграция: изменение типа scheme_id с UUID на TEXT
-- Нужно для использования текстовых ID схем типа 'full_body_3x_classic'

BEGIN;

-- 1. Удаляем foreign key constraint
ALTER TABLE user_workout_schemes DROP CONSTRAINT IF EXISTS user_workout_schemes_scheme_id_fkey;

-- 2. Удаляем старые таблицы (если нужно пересоздать)
DROP TABLE IF EXISTS user_workout_schemes CASCADE;
DROP TABLE IF EXISTS workout_schemes CASCADE;

-- 3. Создаём заново с правильными типами
CREATE TABLE workout_schemes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  days_per_week INT NOT NULL,
  min_minutes INT NOT NULL,
  max_minutes INT NOT NULL,
  split_type TEXT NOT NULL,
  experience_levels TEXT[] NOT NULL,
  goals TEXT[] NOT NULL,
  equipment_required TEXT[] NOT NULL,
  day_labels JSONB NOT NULL,
  benefits TEXT[] NOT NULL,
  notes TEXT,
  intensity TEXT NOT NULL DEFAULT 'moderate',
  target_sex TEXT DEFAULT 'any',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_schemes_days_per_week ON workout_schemes(days_per_week);
CREATE INDEX idx_schemes_experience_gin ON workout_schemes USING GIN (experience_levels);
CREATE INDEX idx_schemes_goals_gin ON workout_schemes USING GIN (goals);

CREATE TABLE user_workout_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_id TEXT NOT NULL REFERENCES workout_schemes(id),
  selected_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_user_schemes_user ON user_workout_schemes(user_id);

COMMIT;

-- Теперь можно загрузить схемы: \i /path/to/seed_all_schemes.sql
