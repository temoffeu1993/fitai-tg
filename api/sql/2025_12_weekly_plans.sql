-- api/sql/2025_12_weekly_plans.sql
-- Добавляем поддержку недельных планов тренировок

-- Добавляем поля для недельной генерации
ALTER TABLE workout_plans
ADD COLUMN IF NOT EXISTS week_id TEXT,
ADD COLUMN IF NOT EXISTS day_index INT,
ADD COLUMN IF NOT EXISTS is_weekly_plan BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS weekly_plan_json JSONB;

-- Индекс для быстрого поиска недельных планов
CREATE INDEX IF NOT EXISTS idx_workout_plans_week_id
  ON workout_plans(user_id, week_id) WHERE week_id IS NOT NULL;

-- Индекс для активных недельных планов
CREATE INDEX IF NOT EXISTS idx_workout_plans_active_weekly
  ON workout_plans(user_id, is_weekly_plan, created_at DESC) WHERE is_weekly_plan = true;

COMMENT ON COLUMN workout_plans.week_id IS 'ID недели для группировки тренировок одной недельной программы';
COMMENT ON COLUMN workout_plans.day_index IS 'Номер дня в недельной программе (0, 1, 2 для PPL)';
COMMENT ON COLUMN workout_plans.is_weekly_plan IS 'Флаг что это часть недельного плана';
COMMENT ON COLUMN workout_plans.weekly_plan_json IS 'Полная недельная программа (если хранится в одной записи)';

