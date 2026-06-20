// ============================================================
// DATABASE CONNECTION POOL
// A "pool" = a fleet of pre-warmed cabs waiting outside.
// Each query grabs a free cab instead of buying a new car
// (opening a fresh connection) every single time.
// Works for BOTH local PostgreSQL and Supabase — only the
// DATABASE_URL in .env changes.
// ============================================================
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase needs SSL; local Postgres does not.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Tiny helper so every file can do: query('SELECT ...', [params])
export const query = (text, params) => pool.query(text, params);

// Quick connectivity check used by /api/health
export async function pingDb() {
  const { rows } = await pool.query('SELECT NOW() AS now');
  return rows[0].now;
}
