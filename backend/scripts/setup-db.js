import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function runMigrations() {
  // v1.2: payment methods
  await pool.query(`ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_method_check`);
  await pool.query(`ALTER TABLE settlements ADD CONSTRAINT settlements_method_check CHECK (method IN ('upi','cash','card','netbanking','other'))`);
  console.log('   • payment methods upgraded');
  // v1.4: achievement renames
  const renames = [
    ['FIRST_EXPENSE','Chai Sponsor','Pehla kharcha add kiya — squad career shuru','☕'],
    ['FIRST_SETTLEMENT','Debt Destroyer','Pehla udhaar khatam. Imaandari zinda hai','🔥'],
    ['PAID_10K','Human Credit Card','₹10,000 squad pe lagaye. Bhai salaamat rahe','💳'],
    ['EXPENSES_50','Finance Minister','50 expenses add kiye. Budget ka asli boss','📊'],
  ];
  for (const [code,name,desc,emoji] of renames)
    await pool.query(`UPDATE achievements SET name=$2,description=$3,emoji=$4 WHERE code=$1`,[code,name,desc,emoji]);
  console.log('   • achievements upgraded');
  // v2.0: reactions
  await pool.query(`CREATE TABLE IF NOT EXISTS reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL CHECK (emoji IN ('😂','🔥','💀','❤️','🍕','☕')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, photo_id, emoji)
  )`);
  console.log('   • reactions table ready');
  // v3.0: UPI ID
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS upi_id TEXT`);
  console.log('   • UPI ID column ready');
  // v4.0: Squad Treasury
  await pool.query(`CREATE TABLE IF NOT EXISTS treasury (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_id UUID NOT NULL UNIQUE REFERENCES squads(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS treasury_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('deposit','expense','reversal')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL DEFAULT '',
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS treasury_amount BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contributions_squad ON contributions (squad_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_treasury_txns_squad ON treasury_transactions (squad_id, created_at DESC)`);
  console.log('   • Squad Treasury tables ready 🏦');

  // v5.0: Trip Mode — create table, then defensively add any missing columns
  // (handles cases where an older/partial trips table may already exist)
  await pool.query(`CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS emoji TEXT NOT NULL DEFAULT '🧳'`);
  await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS start_date DATE`);
  await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS end_date DATE`);
  await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget BIGINT`);
  await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
  await pool.query(`ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check`);
  await pool.query(`ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK (status IN ('active','completed','archived'))`);
  await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE SET NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_trips_squad ON trips (squad_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses (trip_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_photos_trip ON photos (trip_id)`);
  console.log('   • Trip Mode tables ready 🧳');

  // v5.2: Email OTP (login/register 2FA) + password reset
  await pool.query(`CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('login','register','reset_password')),
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  // Self-heal: drop the earlier non-partial index if this DB already ran an
  // older version of this migration, so we don't carry a duplicate forever.
  await pool.query(`DROP INDEX IF EXISTS idx_otp_email_purpose`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_otp_lookup ON otp_codes (email, purpose, created_at DESC) WHERE consumed_at IS NULL`);
  console.log('   • Email OTP + password reset tables ready 📧');
}

async function main() {
  console.log('🔌 Connecting to database...');
  await pool.query('SELECT 1');
  console.log('✅ Connected!');
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='users'`);
  if (rows[0].n > 0) {
    console.log('✅ Tables exist — checking upgrades...');
    await runMigrations();
    console.log('✅ Database up to date. You are ready!');
    return;
  }
  console.log('🛠️  Creating tables + seed data...');
  const sql = fs.readFileSync(path.join(__dirname,'..','src','db','schema.sql'),'utf8');
  await pool.query(sql);
  console.log('✅ Done! Run: npm run dev');
}

main().catch(err => { console.error('❌',err.message); process.exit(1); }).finally(() => pool.end());
