-- понадобится для gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- пользователи (минимально)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id TEXT UNIQUE NOT NULL,         -- telegram initData -> user.id как строка
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- программа пользователя
CREATE TABLE IF NOT EXISTS training_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  blueprint_json JSONB NOT NULL,           -- { name, days[], targets{} }
  microcycle_len INT NOT NULL DEFAULT 3,
  week INT NOT NULL DEFAULT 1,
  day_idx INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- длина сплита должна соответствовать длине days
  CONSTRAINT chk_micro_len
    CHECK (microcycle_len >= 1)
);

-- сохранённые тренировки
CREATE TABLE IF NOT EXISTS workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- быстрые поля (чтобы не лезть в JSON)
  title TEXT,
  location TEXT,                 -- 'gym' | 'home' | 'outdoor'
  duration_min INT,
  patterns TEXT[],               -- напр. ['push','row','core']
  volume_json JSONB,             -- агрегаты по сетам/повт/весу
  plan_hash TEXT,                -- для дедупа повторных сабмитов
  source TEXT,                   -- 'miniapp', 'ios', 'web'

  payload JSONB NOT NULL,        -- полный сырой план/факт

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- индексы
CREATE INDEX IF NOT EXISTS idx_sessions_user_time
  ON workout_sessions(user_id, finished_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_payload_gin
  ON workout_sessions USING GIN (payload);

CREATE INDEX IF NOT EXISTS idx_sessions_patterns_gin
  ON workout_sessions USING GIN (patterns);

-- при больших объёмах: дешёвая навигация по времени
CREATE INDEX IF NOT EXISTS brin_sessions_time
  ON workout_sessions USING BRIN (finished_at);

-- updated_at автообновление
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_users ON users;
CREATE TRIGGER trg_set_updated_at_users
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_prog ON training_programs;
CREATE TRIGGER trg_set_updated_at_prog
BEFORE UPDATE ON training_programs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_sessions ON workout_sessions;
CREATE TRIGGER trg_set_updated_at_sessions
BEFORE UPDATE ON workout_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
