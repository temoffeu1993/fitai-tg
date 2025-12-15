-- fix_planned_workouts_schema.sql
-- Обновление структуры planned_workouts для новой системы генерации

BEGIN;

-- 1. Добавить поля для новой системы
ALTER TABLE planned_workouts 
  ADD COLUMN IF NOT EXISTS workout_date DATE;

ALTER TABLE planned_workouts 
  ADD COLUMN IF NOT EXISTS data JSONB;

ALTER TABLE planned_workouts 
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2. Мигрировать данные из старых полей
UPDATE planned_workouts 
SET 
  workout_date = scheduled_for::date,
  data = plan
WHERE workout_date IS NULL AND scheduled_for IS NOT NULL;

-- 3. Создать уникальный индекс для workout_date
CREATE UNIQUE INDEX IF NOT EXISTS idx_planned_workouts_user_date
  ON planned_workouts(user_id, workout_date);

-- 4. Удалить старый индекс (если нужно оставить только новый)
-- DROP INDEX IF EXISTS idx_planned_workouts_user_time;

COMMIT;

-- Проверка структуры
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'planned_workouts'
ORDER BY ordinal_position;

-- Проверка индексов
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'planned_workouts';
