-- Добавляем поля подписки и триалов в users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_workout_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_nutrition_used BOOLEAN DEFAULT false;

-- Индекс по дате подписки для быстрых проверок
CREATE INDEX IF NOT EXISTS idx_users_subscription_until
  ON users(subscription_until);
