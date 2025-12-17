-- Миграция: добавление 'ok' в sleep_quality
-- Дата: 2025-12-17
-- Причина: фронтенд и бэкенд используют 5 значений ('poor', 'fair', 'ok', 'good', 'excellent'),
--          но в БД CHECK constraint имеет только 4 значения (без 'ok')

-- Удаляем старый constraint
ALTER TABLE daily_check_ins
  DROP CONSTRAINT IF EXISTS daily_check_ins_sleep_quality_check;

-- Добавляем новый constraint с 5 значениями (включая 'ok')
ALTER TABLE daily_check_ins
  ADD CONSTRAINT daily_check_ins_sleep_quality_check
  CHECK (sleep_quality IN ('poor', 'fair', 'ok', 'good', 'excellent'));

COMMENT ON COLUMN daily_check_ins.sleep_quality IS 'Качество сна: poor=плохо, fair=так себе, ok=нормально, good=хорошо, excellent=отлично';
