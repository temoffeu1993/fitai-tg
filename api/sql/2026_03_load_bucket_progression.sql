-- 2026_03_load_bucket_progression.sql
-- Добавляет load_bucket в exercise_progression для независимой прогрессии
-- по rep-bucket (low_rep / moderate_rep / high_rep / calibration).
--
-- Безопасная миграция:
-- 1. Добавляет колонку с дефолтом (существующие строки → 'moderate_rep')
-- 2. Меняет PK на (user_id, exercise_id, load_bucket)
-- 3. Обновляет lockProgressionRow ON CONFLICT
--
-- Обратная совместимость: старые строки = moderate_rep (базовый вес).

BEGIN;

-- 1. Добавить колонку load_bucket
ALTER TABLE exercise_progression
  ADD COLUMN IF NOT EXISTS load_bucket TEXT NOT NULL DEFAULT 'moderate_rep';

-- 2. Сменить PK: (user_id, exercise_id) → (user_id, exercise_id, load_bucket)
--    Сначала дропаем старый PK, потом создаём новый.
ALTER TABLE exercise_progression
  DROP CONSTRAINT IF EXISTS exercise_progression_pkey;

ALTER TABLE exercise_progression
  ADD CONSTRAINT exercise_progression_pkey
  PRIMARY KEY (user_id, exercise_id, load_bucket);

-- 3. Индекс для быстрого поиска по user_id + exercise_id (без bucket)
--    Полезен для getExerciseExposureSummaries и калибровки.
CREATE INDEX IF NOT EXISTS idx_exercise_progression_user_exercise
  ON exercise_progression(user_id, exercise_id);

COMMIT;

-- Проверка
SELECT load_bucket, COUNT(*) as rows
FROM exercise_progression
GROUP BY load_bucket
ORDER BY load_bucket;
