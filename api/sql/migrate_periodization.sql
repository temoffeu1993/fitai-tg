-- migrate_periodization.sql
-- Миграция для периодизации: мезоциклы, недельные планы, прогрессия

BEGIN;

-- 1. Таблица мезоциклов
CREATE TABLE IF NOT EXISTS mesocycles (
  user_id TEXT PRIMARY KEY,
  cycle_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Таблица недельных планов
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

-- 3. Таблица прогрессии упражнений
CREATE TABLE IF NOT EXISTS exercise_progression (
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  current_weight NUMERIC(6,2) DEFAULT 0,
  status TEXT DEFAULT 'progressing',
  stall_count INTEGER DEFAULT 0,
  deload_count INTEGER DEFAULT 0,
  last_progress_date TIMESTAMP,
  meso_cycle_id TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, exercise_id)
);

-- 4. Таблица истории упражнений (48 тренировок)
CREATE TABLE IF NOT EXISTS exercise_history (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  workout_date DATE NOT NULL,
  sets JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_weekly_plans_user_date 
  ON weekly_plans(user_id, week_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_mesocycles_user 
  ON mesocycles(user_id);

CREATE INDEX IF NOT EXISTS idx_exercise_history_user_exercise 
  ON exercise_history(user_id, exercise_id, workout_date DESC);

CREATE INDEX IF NOT EXISTS idx_exercise_progression_user 
  ON exercise_progression(user_id);

COMMIT;

-- Проверка
SELECT 
  'mesocycles' as table_name, COUNT(*) as rows FROM mesocycles
UNION ALL
SELECT 
  'weekly_plans', COUNT(*) FROM weekly_plans
UNION ALL
SELECT 
  'exercise_progression', COUNT(*) FROM exercise_progression
UNION ALL
SELECT 
  'exercise_history', COUNT(*) FROM exercise_history;
