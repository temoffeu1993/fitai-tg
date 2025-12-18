// api/src/db.ts
import pg from "pg";
import { parse as parsePg } from "pg-connection-string";
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
    const res = await pool.query(text, params);
    if (config.nodeEnv !== "production") {
      console.log(`SQL ok (${Date.now() - t0}ms, rows=${res.rowCount}) ::`, text, params);
    }
    return res.rows as T[];
  } catch (err: any) {
    console.error("DB ERROR:", err?.message, { text, params });
    throw new AppError("Database operation failed", 500);
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

// Применяем миграции при старте
(async () => {
  try {
    await applyWeeklyPlansMigration();
  } catch (error) {
    console.error("Migration error:", error);
    // Не падаем, продолжаем работу
  }
})();
