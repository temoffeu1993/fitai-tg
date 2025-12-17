-- Миграция: добавление поля metadata в planned_workouts
-- Дата: 2025-12-17
-- Причина: для хранения информации о swap_day (wasSwappedEarlier флаг)

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN planned_workouts.metadata IS 'Метаданные: { wasSwappedEarlier: boolean, originalDate: string, ... }';

-- Индекс для быстрого поиска "swapped" дней (опционально)
CREATE INDEX IF NOT EXISTS idx_planned_workouts_metadata_swapped
  ON planned_workouts USING GIN (metadata)
  WHERE (metadata->>'wasSwappedEarlier')::boolean = true;
