// api/src/db.ts
import pg from "pg";
import { parse as parsePg } from "pg-connection-string";
import { config } from "./config.js";
import { AppError } from "./middleware/errorHandler.js";

const { Pool } = pg;

// Жёстко парсим DATABASE_URL, чтобы PG* env не переопределяли
const cn = parsePg(config.databaseUrl);

export const pool = new Pool({
  host: cn.host || "127.0.0.1",
  port: cn.port ? Number(cn.port) : 5432,
  user: cn.user ?? undefined,
  password: cn.password ?? undefined,
  database: cn.database ?? undefined,
  ssl: config.nodeEnv === "production" ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
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
