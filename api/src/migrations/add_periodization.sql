-- migrations/add_periodization.sql
-- Добавление периодизации: мезоциклы и недельные планы

-- Таблица мезоциклов
CREATE TABLE IF NOT EXISTS mesocycles (
  user_id TEXT PRIMARY KEY,
  cycle_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица недельных планов
CREATE TABLE IF NOT EXISTS weekly_plans (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  meso_week INTEGER NOT NULL,
  scheme_id TEXT NOT NULL,
  workouts JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, week_start_date)
);

-- Расширить exercise_history (убрать лимит, добавить meso_id)
ALTER TABLE exercise_progression 
  ADD COLUMN IF NOT EXISTS meso_cycle_id TEXT;

-- Индексы
CREATE INDEX IF NOT EXISTS idx_weekly_plans_user_date 
  ON weekly_plans(user_id, week_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_mesocycles_user 
  ON mesocycles(user_id);
