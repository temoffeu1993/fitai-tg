-- sql/2025_11_schedule.sql
CREATE TABLE IF NOT EXISTS workout_schedules (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);