import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render Postgres требует TLS
  ssl: { rejectUnauthorized: false },
});

export async function q<T = any>(sql: string, params: any[] = []) {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}