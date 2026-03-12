// api/src/db.ts
import pg from "pg";
import { parse as parsePg } from "pg-connection-string";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config.js";
import { AppError } from "./middleware/errorHandler.js";

const { Pool } = pg;

// Жёстко парсим DATABASE_URL, чтобы PG* env не переопределяли
const cn = parsePg(config.databaseUrl);
const resolvedHost = cn.host || "127.0.0.1";
const isLocalHost =
  resolvedHost === "127.0.0.1" || resolvedHost === "localhost" || resolvedHost === "::1";

export const pool = new Pool({
  host: resolvedHost,
  port: cn.port ? Number(cn.port) : 5432,
  user: cn.user ?? undefined,
  password: cn.password ?? undefined,
  database: cn.database ?? undefined,
  // Managed Postgres providers (e.g. Neon) require SSL; local dev Postgres often doesn't.
  ssl: isLocalHost ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

const txStorage = new AsyncLocalStorage<pg.PoolClient>();

// базовые логи
pool.on("connect", () => {
  if (config.nodeEnv !== "production") console.log("DB: connected");
});
pool.on("error", (err) => {
  console.error("DB: unexpected error", err);
});

// api/src/db.ts (сразу после pool.on("connect") ... оставь как есть)
(async () => {
  try {
    const r = await pool.query("SELECT current_database() db, inet_server_addr() host, inet_server_port() port");
    console.log("DB whoami:", r.rows[0]); // ← увидишь host=127.0.0.1 port=5433, если всё ок
  } catch (e) {
    console.error("DB: whoami failed", e);
  }
})();

// показать к какой БД подключились
(async () => {
  try {
    const r = await pool.query<{ db: string }>("select current_database() as db");
    if (config.nodeEnv !== "production") console.log("DB:", r.rows[0]?.db);
  } catch (e) {
    console.error("DB: initial check failed", e);
  }
})();

/** Универсальный helper для SQL-запросов */
export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const t0 = Date.now();
  try {
    const client = txStorage.getStore();
    const res = client ? await client.query(text, params) : await pool.query(text, params);
    if (config.nodeEnv !== "production") {
      console.log(`SQL ok (${Date.now() - t0}ms, rows=${res.rowCount}) ::`, text, params);
    }
    return res.rows as T[];
  } catch (err: any) {
    console.error("DB ERROR:", err?.message, { text, params });
    const e = new AppError("Database operation failed", 500, { code: "db_error" });
    (e as any).causeMessage = String(err?.message || "");
    (e as any).causeCode = err?.code ? String(err.code) : "";
    (e as any).causeConstraint = err?.constraint ? String(err.constraint) : "";
    throw e;
  }
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await txStorage.run(client, async () => fn());
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failures
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
  if (config.nodeEnv !== "production") console.log("DB: pool closed");
}

// ============================================================================
// АВТОМАТИЧЕСКИЕ МИГРАЦИИ
// ============================================================================

/**
 * Применяет SQL миграцию для недельных планов тренировок
 */
async function applyWeeklyPlansMigration() {
  try {
    console.log("\n🔧 Checking weekly plans migration...");
    
    // Проверяем есть ли уже колонка week_id
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'workout_plans' 
      AND column_name = 'week_id'
    `);
    
    if (checkColumn.rows.length > 0) {
      console.log("✅ Weekly plans migration already applied");
      return;
    }
    
    console.log("📝 Applying weekly plans migration...");
    
    // Применяем миграцию
    await pool.query(`
      -- Добавляем поля для недельной генерации
      ALTER TABLE workout_plans
      ADD COLUMN IF NOT EXISTS week_id TEXT,
      ADD COLUMN IF NOT EXISTS day_index INT,
      ADD COLUMN IF NOT EXISTS is_weekly_plan BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS weekly_plan_json JSONB;
    `);
    
    await pool.query(`
      -- Индекс для быстрого поиска недельных планов
      CREATE INDEX IF NOT EXISTS idx_workout_plans_week_id
        ON workout_plans(user_id, week_id) WHERE week_id IS NOT NULL;
    `);
    
    await pool.query(`
      -- Индекс для активных недельных планов
      CREATE INDEX IF NOT EXISTS idx_workout_plans_active_weekly
        ON workout_plans(user_id, is_weekly_plan, created_at DESC) WHERE is_weekly_plan = true;
    `);
    
    await pool.query(`
      COMMENT ON COLUMN workout_plans.week_id IS 'ID недели для группировки тренировок одной недельной программы';
    `);
    
    await pool.query(`
      COMMENT ON COLUMN workout_plans.day_index IS 'Номер дня в недельной программе (0, 1, 2 для PPL)';
    `);
    
    await pool.query(`
      COMMENT ON COLUMN workout_plans.is_weekly_plan IS 'Флаг что это часть недельного плана';
    `);
    
    await pool.query(`
      COMMENT ON COLUMN workout_plans.weekly_plan_json IS 'Полная недельная программа (если хранится в одной записи)';
    `);
    
    console.log("✅ Weekly plans migration applied successfully!\n");
  } catch (error: any) {
    console.error("❌ Weekly plans migration failed:", error.message);
    throw error;
  }
}

/**
 * Применяет SQL миграцию для outbox очереди прогрессии
 * (eventual consistency: тренировка сохраняется всегда, прогрессия догоняет через job)
 */
async function applyProgressionJobsMigration() {
  try {
    console.log("\n🔧 Checking progression jobs migration...");

    console.log("📝 Ensuring progression_jobs schema...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS progression_jobs (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        session_id uuid NOT NULL,
        planned_workout_id uuid NULL,
        workout_date date NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        attempts int NOT NULL DEFAULT 0,
        next_run_at timestamptz NOT NULL DEFAULT now(),
        last_error text NULL,
        result jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz NULL
      );
    `);

    // For older versions / partially applied tables
    await pool.query(`ALTER TABLE progression_jobs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';`);
    await pool.query(`ALTER TABLE progression_jobs ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;`);
    await pool.query(`ALTER TABLE progression_jobs ADD COLUMN IF NOT EXISTS next_run_at timestamptz NOT NULL DEFAULT now();`);
    await pool.query(`ALTER TABLE progression_jobs ADD COLUMN IF NOT EXISTS last_error text NULL;`);
    await pool.query(`ALTER TABLE progression_jobs ADD COLUMN IF NOT EXISTS result jsonb NULL;`);
    await pool.query(`ALTER TABLE progression_jobs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();`);
    await pool.query(`ALTER TABLE progression_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();`);
    await pool.query(`ALTER TABLE progression_jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;`);

    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_progression_jobs_session_id ON progression_jobs(session_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_progression_jobs_pending ON progression_jobs(status, next_run_at, created_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_progression_jobs_user ON progression_jobs(user_id, created_at DESC);`);

    console.log("✅ Progression jobs schema ensured\n");
  } catch (error: any) {
    console.error("❌ Progression jobs migration failed:", error.message);
    throw error;
  }
}

/**
 * Adds `session_id` to exercise_history for idempotent outbox retries.
 */
async function applyExerciseHistorySessionIdMigration() {
  try {
    console.log("\n🔧 Checking exercise_history.session_id migration...");

    await pool.query(`
      ALTER TABLE exercise_history
      ADD COLUMN IF NOT EXISTS session_id uuid NULL;
    `);

    // created_at is used for deterministic ordering when multiple sessions exist on the same workout_date.
    await pool.query(`
      ALTER TABLE exercise_history
      ADD COLUMN IF NOT EXISTS created_at timestamptz NULL DEFAULT now();
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_history_session
      ON exercise_history(user_id, exercise_id, session_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_exercise_history_user_exercise_order
      ON exercise_history(user_id, exercise_id, workout_date DESC, created_at DESC);
    `);

    console.log("✅ exercise_history.session_id ensured\n");
  } catch (error: any) {
    console.error("❌ exercise_history.session_id migration failed:", error.message);
    throw error;
  }
}

/**
 * Adds `base_plan` to planned_workouts to preserve the original weekly plan.
 * This allows /workout/start to be re-run with different check-in time without "sticking" to a previous adaptation.
 */
async function applyPlannedWorkoutsBasePlanMigration() {
  try {
    // Only ensures column exists; backfill is handled by sql/2026_02_base_plan.sql
    await pool.query(`
      ALTER TABLE planned_workouts
      ADD COLUMN IF NOT EXISTS base_plan jsonb NULL;
    `);
  } catch (error: any) {
    console.error("❌ planned_workouts.base_plan migration failed:", error.message);
    throw error;
  }
}

/**
 * Ensures outbox-style coach feedback jobs table.
 * This powers "trainer-like" AI feedback after each workout and weekly summaries.
 */
async function applyCoachJobsMigration() {
  try {
    console.log("\n🔧 Checking coach_jobs migration...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coach_jobs (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        kind text NOT NULL, -- 'session' | 'week'
        session_id uuid NULL UNIQUE, -- non-null only for kind='session' (NULLs allowed)
        period_start date NULL,
        period_end date NULL,
        status text NOT NULL DEFAULT 'pending',
        attempts int NOT NULL DEFAULT 0,
        next_run_at timestamptz NOT NULL DEFAULT now(),
        last_error text NULL,
        result jsonb NULL,
        model text NULL,
        prompt_tokens int NULL,
        completion_tokens int NULL,
        total_tokens int NULL,
        latency_ms int NULL,
        telegram_sent boolean NOT NULL DEFAULT false,
        telegram_message_id text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz NULL
      );
    `);

    // Backfill/compat for older versions (idempotent)
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'session';`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS session_id uuid NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS period_start date NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS period_end date NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS next_run_at timestamptz NOT NULL DEFAULT now();`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS last_error text NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS result jsonb NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS model text NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS prompt_tokens int NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS completion_tokens int NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS total_tokens int NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS latency_ms int NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS telegram_sent boolean NOT NULL DEFAULT false;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS telegram_message_id text NULL;`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();`);
    await pool.query(`ALTER TABLE coach_jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;`);

    // Ensure uniqueness for weekly reports (one per user per period_end)
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_jobs_week_unique
      ON coach_jobs(user_id, kind, period_end)
      WHERE kind = 'week' AND period_end IS NOT NULL;
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_coach_jobs_pending ON coach_jobs(status, next_run_at, created_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_coach_jobs_user ON coach_jobs(user_id, created_at DESC);`);

    console.log("✅ coach_jobs schema ensured\n");
  } catch (error: any) {
    console.error("❌ coach_jobs migration failed:", error.message);
    throw error;
  }
}

/**
 * Ensures coach chat persistence tables (threads + messages).
 */
async function applyCoachChatMigration() {
  try {
    console.log("\n🔧 Checking coach_chat migration...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coach_chat_threads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coach_chat_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id uuid NOT NULL REFERENCES coach_chat_threads(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('user','assistant','system')),
        content text NOT NULL,
        meta jsonb NULL,
        model text NULL,
        prompt_tokens int NULL,
        completion_tokens int NULL,
        total_tokens int NULL,
        latency_ms int NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`ALTER TABLE coach_chat_messages ADD COLUMN IF NOT EXISTS model text NULL;`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_coach_chat_messages_thread_time ON coach_chat_messages(thread_id, created_at ASC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_coach_chat_messages_thread_time_desc ON coach_chat_messages(thread_id, created_at DESC);`);
    await pool.query(`ALTER TABLE coach_chat_messages ADD COLUMN IF NOT EXISTS latency_ms int NULL;`);

    console.log("✅ coach_chat schema ensured\n");
  } catch (error: any) {
    console.error("❌ coach_chat migration failed:", error.message);
    throw error;
  }
}

/**
 * Ensures user exercise preferences (excluded exercises) and change event log.
 */
async function applyExerciseChangesMigration() {
  try {
    console.log("\n🔧 Checking exercise changes migration...");

    // User-level preferences
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS excluded_exercise_ids text[] NOT NULL DEFAULT '{}';
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_excluded_exercises_gin
      ON users USING GIN (excluded_exercise_ids);
    `);

    // Planned workouts compatibility: many parts of the app rely on these columns existing.
    await pool.query(`ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS data jsonb NULL;`);
    await pool.query(`ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS workout_date date NULL;`);
    await pool.query(`ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;`);

    // Event log for all manual changes (replace/remove/skip/exclude).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exercise_change_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        planned_workout_id uuid NULL REFERENCES planned_workouts(id) ON DELETE SET NULL,
        session_id uuid NULL REFERENCES workout_sessions(id) ON DELETE SET NULL,
        action text NOT NULL,
        from_exercise_id text NULL,
        to_exercise_id text NULL,
        reason text NULL,
        source text NULL,
        meta jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_exercise_change_events_user_time
      ON exercise_change_events(user_id, created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_exercise_change_events_planned
      ON exercise_change_events(planned_workout_id, created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_exercise_change_events_session
      ON exercise_change_events(session_id, created_at DESC);
    `);

    console.log("✅ exercise changes schema ensured\n");
  } catch (error: any) {
    console.error("❌ exercise changes migration failed:", error.message);
    throw error;
  }
}

/**
 * Ensures user_session_counters table and workout_sessions.session_number column exist.
 * Required for sequential session numbering (save-session flow).
 */
async function applySessionCountersMigration() {
  try {
    console.log("\n🔧 Checking session counters migration...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_session_counters (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        session_count INTEGER NOT NULL DEFAULT 0
      );
    `);

    await pool.query(`
      ALTER TABLE workout_sessions
      ADD COLUMN IF NOT EXISTS session_number INTEGER;
    `);

    console.log("✅ session counters schema ensured\n");
  } catch (error: any) {
    console.error("❌ session counters migration failed:", error.message);
    throw error;
  }
}

// Применяем миграции при старте
(async () => {
  try {
    await applyWeeklyPlansMigration();
    await applyProgressionJobsMigration();
    await applyExerciseHistorySessionIdMigration();
    await applyPlannedWorkoutsBasePlanMigration();
    await applyExerciseChangesMigration();
    await applyCoachJobsMigration();
    await applyCoachChatMigration();
    await applySessionCountersMigration();
  } catch (error) {
    console.error("Migration error:", error);
    // Не падаем, продолжаем работу
  }
})();
