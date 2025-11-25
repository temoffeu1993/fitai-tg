-- Уникальный индекс по пользователю и дню (UTC)
CREATE UNIQUE INDEX IF NOT EXISTS daily_check_ins_user_day_uniq
  ON daily_check_ins (user_id, (DATE(created_at AT TIME ZONE 'UTC')));
