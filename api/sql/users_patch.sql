-- users_patch.sql
BEGIN;

-- 1) Гарантируем нужные колонки
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tg_id      TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS username   TEXT;

-- 2) Если tg_id не TEXT (например BIGINT) — приводим тип
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
      AND column_name='tg_id' AND data_type <> 'text'
  ) THEN
    EXECUTE 'ALTER TABLE users ALTER COLUMN tg_id TYPE TEXT USING tg_id::text';
  END IF;
END $$;

-- 3) Если есть старая колонка tg_user_id — переносим значения
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
      AND column_name='tg_user_id'
  ) THEN
    EXECUTE 'UPDATE users SET tg_id = COALESCE(tg_id, tg_user_id::text) WHERE tg_id IS NULL';
  END IF;
END $$;

-- 4) Уникальный индекс под upsert по tg_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='users_tg_id_key'
  ) THEN
    CREATE UNIQUE INDEX users_tg_id_key ON users(tg_id);
  END IF;
END $$;

COMMIT;

BEGIN;

-- гарантируем системные колонки
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- колонки под апсёрт телеграма
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tg_id TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT;

-- если есть старая tg_user_id — скопируем в tg_id один раз
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='tg_user_id'
  ) THEN
    UPDATE users SET tg_id = COALESCE(tg_id, tg_user_id::text) WHERE tg_id IS NULL;
  END IF;
END $$;

-- уникальный индекс под ON CONFLICT (tg_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='users_tg_id_key'
  ) THEN
    CREATE UNIQUE INDEX users_tg_id_key ON users(tg_id);
  END IF;
END $$;

COMMIT;