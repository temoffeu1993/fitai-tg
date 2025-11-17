-- Добавляем поля для контроля «реальности» тренировки
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlock_used BOOLEAN DEFAULT false;

-- Быстрая навигация по времени
CREATE INDEX IF NOT EXISTS idx_workouts_user_created
  ON workouts(user_id, created_at DESC);
