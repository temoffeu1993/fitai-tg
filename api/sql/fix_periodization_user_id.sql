-- fix_periodization_user_id.sql
-- Исправление типа user_id в таблицах периодизации с TEXT на UUID

BEGIN;

-- 1. Удалить данные (если есть) и изменить тип user_id в mesocycles
TRUNCATE mesocycles;
ALTER TABLE mesocycles 
  ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- Добавить foreign key
ALTER TABLE mesocycles
  ADD CONSTRAINT mesocycles_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 2. Удалить данные (если есть) и изменить тип user_id в weekly_plans
TRUNCATE weekly_plans;
ALTER TABLE weekly_plans 
  ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- Добавить foreign key
ALTER TABLE weekly_plans
  ADD CONSTRAINT weekly_plans_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 3. Удалить данные (если есть) и изменить тип user_id в exercise_progression
TRUNCATE exercise_progression;
ALTER TABLE exercise_progression 
  ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- Добавить foreign key
ALTER TABLE exercise_progression
  ADD CONSTRAINT exercise_progression_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 4. Удалить данные (если есть) и изменить тип user_id в exercise_history
TRUNCATE exercise_history;
ALTER TABLE exercise_history 
  ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- Добавить foreign key
ALTER TABLE exercise_history
  ADD CONSTRAINT exercise_history_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

COMMIT;

-- Проверка
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('mesocycles', 'weekly_plans', 'exercise_progression', 'exercise_history')
  AND column_name = 'user_id'
ORDER BY table_name;

-- Проверка foreign keys
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('mesocycles', 'weekly_plans', 'exercise_progression', 'exercise_history')
ORDER BY tc.table_name;
