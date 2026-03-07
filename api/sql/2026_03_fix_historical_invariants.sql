-- Миграция: проверка и исправление инвариантов planned_workouts
-- Запускать после деплоя фиксов в schedule.ts и workoutGeneration.ts
-- Проверено 2026-03-07: все запросы вернули 0 строк, данные чистые.

-- 1. completed без completed_at: подтянуть из workout_sessions.finished_at
--    ЭТО ОСНОВНОЙ ИСТОЧНИК ПРАВДЫ О ДАТЕ ВЫПОЛНЕНИЯ
UPDATE planned_workouts pw
SET completed_at = ws.finished_at
FROM workout_sessions ws
WHERE pw.result_session_id = ws.id
  AND pw.status = 'completed'
  AND pw.completed_at IS NULL;

-- 2. не-completed с result_session_id или completed_at: очистить
UPDATE planned_workouts
SET result_session_id = NULL, completed_at = NULL
WHERE status != 'completed'
  AND (result_session_id IS NOT NULL OR completed_at IS NOT NULL);

-- 3. completed без result_session_id: проверить вручную
SELECT id, user_id, status, scheduled_for, completed_at, result_session_id
FROM planned_workouts
WHERE status = 'completed' AND result_session_id IS NULL;
