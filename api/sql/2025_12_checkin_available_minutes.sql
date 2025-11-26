ALTER TABLE daily_check_ins
  ADD COLUMN IF NOT EXISTS available_minutes numeric(4,1);
