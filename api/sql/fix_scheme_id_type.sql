-- Простая миграция: меняем типы на TEXT
-- Выполняется быстро, не теряет данные

BEGIN;

-- Шаг 1: Удаляем foreign key если есть
ALTER TABLE user_workout_schemes 
DROP CONSTRAINT IF EXISTS user_workout_schemes_scheme_id_fkey;

-- Шаг 2: Меняем тип scheme_id на TEXT в workout_schemes
ALTER TABLE workout_schemes 
ALTER COLUMN id TYPE TEXT;

-- Шаг 3: Меняем тип scheme_id на TEXT в user_workout_schemes
ALTER TABLE user_workout_schemes 
ALTER COLUMN scheme_id TYPE TEXT;

-- Шаг 4: Восстанавливаем foreign key с новым типом
ALTER TABLE user_workout_schemes 
ADD CONSTRAINT user_workout_schemes_scheme_id_fkey 
FOREIGN KEY (scheme_id) REFERENCES workout_schemes(id);

COMMIT;

-- Готово! Теперь можно загружать схемы
