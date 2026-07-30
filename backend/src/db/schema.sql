-- ============================================================
-- SQUADPAY DATABASE SCHEMA  (PostgreSQL)  —  v6.0
-- ============================================================
-- GOLDEN RULE: all money is stored in PAISE (integers).
-- ₹18.50 is stored as 1850. Floating point math loses paise
-- and a finance engine that loses paise is a broken engine.
-- Convert to rupees only when DISPLAYING, never when storing.
--
-- v6.0 note: this file used to have several tables defined
-- TWICE (trips, treasury, contributions, treasury_transactions)
-- with different columns each time. Because the *first* CREATE
-- TABLE always won on a brand-new database, the *second*
-- definition's extra columns (trips.budget, trips.status) were
-- silently never created — a fresh install would build a Trip
-- Mode that immediately 500'd. personal_expenses/personal_budget
-- were missing from this file entirely (they only existed in
-- scripts/setup-db.js's migration path), so a fresh install
-- broke Personal Finance too. This version is deduplicated and
-- matches what setup-db.js's migrations produce on an existing
-- database — fresh installs and upgraded installs now end up
-- with an identical schema.
-- ============================================================

-- Run this file once:  psql -d squadpay -f schema.sql
-- (or paste into Supabase SQL editor)
-- Existing databases: don't re-run this — use `npm run setup-db`
-- (scripts/setup-db.js), which migrates in place instead.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ------------------------------------------------------------
-- 1. USERS — one row per real human account (global identity)
-- ------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,                    -- NULL when Google-only login
  google_id     TEXT UNIQUE,             -- NULL when email/password login
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  bio           TEXT DEFAULT '',
  upi_id        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);

-- ------------------------------------------------------------
-- 2. SQUADS — a friend group
-- ------------------------------------------------------------
CREATE TABLE squads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '🎉',
  invite_code TEXT UNIQUE NOT NULL,      -- short code for invite links
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. SQUAD_MEMBERS — a user *inside* a squad.
-- XP, level and nickname live HERE, not on users, because the
-- same person can be "Expense Warrior" in one squad and a
-- level-1 "Chai Sponsor" in another.
-- ------------------------------------------------------------
CREATE TABLE squad_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id  UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname  TEXT,                        -- falls back to users.name
  role      TEXT NOT NULL DEFAULT 'member'
            CHECK (role IN ('admin','member')),
  status    TEXT NOT NULL DEFAULT 'active'
            CHECK (status IN ('active','left')),
  xp        INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (squad_id, user_id)
);

-- ------------------------------------------------------------
-- 4. LEVELS — reference table. Level is DERIVED from xp by
-- looking up the highest level whose xp_required <= member xp.
-- We never store level directly = it can never go stale.
-- ------------------------------------------------------------
CREATE TABLE levels (
  level       INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  xp_required INTEGER NOT NULL UNIQUE
);

INSERT INTO levels (level, title, xp_required) VALUES
  (1,  'Chai Sponsor',       0),
  (5,  'Party Contributor',  500),
  (10, 'Expense Warrior',    1500),
  (20, 'Squad Veteran',      4000),
  (50, 'Financial God',      15000);

-- ------------------------------------------------------------
-- 5. TRIPS — Goa Trip, Movie Night, etc. Expenses can
-- optionally belong to a trip. (Unified — this used to be two
-- conflicting CREATE TABLE statements; see v6.0 note above.)
-- ------------------------------------------------------------
CREATE TABLE trips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id    UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '🧳',
  cover_url   TEXT,
  notes       TEXT DEFAULT '',
  start_date  DATE,
  end_date    DATE,
  budget      BIGINT,                    -- optional, PAISE
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','completed','archived')),
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 6. EXPENSES — the heart of the app.
-- soft delete (is_deleted) so balances can be recalculated
-- and history/audit is never lost. treasury_amount tracks how
-- much of this expense was paid straight out of squad treasury
-- (see #16), so it can be refunded if the expense is deleted.
-- ------------------------------------------------------------
CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id        UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  trip_id         UUID REFERENCES trips(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  amount          BIGINT NOT NULL CHECK (amount > 0),   -- PAISE
  category        TEXT NOT NULL DEFAULT 'other'
                  CHECK (category IN ('food','travel','movies','fuel',
                         'events','shopping','stay','other')),
  notes           TEXT DEFAULT '',
  receipt_url     TEXT,
  paid_by         UUID NOT NULL REFERENCES users(id),
  split_type      TEXT NOT NULL DEFAULT 'equal'
                  CHECK (split_type IN ('equal','percentage','custom','shares')),
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  treasury_amount BIGINT NOT NULL DEFAULT 0,             -- PAISE paid from treasury
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 7. EXPENSE_PARTICIPANTS — who shares each expense and for
-- how much. share_amount is ALWAYS the final paise owed —
-- percentages/shares are converted at insert time so the
-- balance engine only ever sums integers.
-- INVARIANT: SUM(share_amount) per expense == expenses.amount
-- ------------------------------------------------------------
CREATE TABLE expense_participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  share_amount BIGINT NOT NULL CHECK (share_amount >= 0),  -- PAISE
  share_value  NUMERIC,   -- the raw input: 25 (%), 2 (shares), etc. for display
  UNIQUE (expense_id, user_id)
);

-- ------------------------------------------------------------
-- 8. SETTLEMENTS — "Rahul paid Vedant ₹500". Supports partial
-- settlements: multiple rows can chip away at one debt.
-- ------------------------------------------------------------
CREATE TABLE settlements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id   UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  from_user  UUID NOT NULL REFERENCES users(id),  -- the payer (debtor)
  to_user    UUID NOT NULL REFERENCES users(id),  -- the receiver (creditor)
  amount     BIGINT NOT NULL CHECK (amount > 0),  -- PAISE
  method     TEXT NOT NULL DEFAULT 'cash'
             CHECK (method IN ('upi','cash','card','netbanking','other')),
  status     TEXT NOT NULL DEFAULT 'completed'
             CHECK (status IN ('pending','completed','cancelled')),
  note       TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  CHECK (from_user <> to_user)
);

-- ------------------------------------------------------------
-- 9. ACHIEVEMENTS — the catalogue of unlockable badges
-- ------------------------------------------------------------
CREATE TABLE achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,   -- 'FIRST_EXPENSE', machine-readable
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  xp_reward   INTEGER NOT NULL DEFAULT 50
);

INSERT INTO achievements (code, name, description, emoji, xp_reward) VALUES
  ('FIRST_EXPENSE',    'Chai Sponsor',       'Pehla kharcha add kiya — squad career shuru', '☕', 50),
  ('FIRST_SETTLEMENT', 'Debt Destroyer',     'Pehla udhaar khatam. Imaandari zinda hai',    '🔥', 50),
  ('TRIP_ORGANIZER',   'Trip Organizer',     'Created your first trip',             '🧳', 100),
  ('PAID_10K',         'Human Credit Card',  'Paid ₹10,000 total for the squad',    '💳', 200),
  ('EXPENSES_50',      'Finance Minister',   'Added 50 expenses',                   '📊', 200),
  ('SQUAD_LEGEND',     'Squad Legend',       'Reached level 20',                    '👑', 500),
  ('FINANCIAL_WIZARD', 'Financial Wizard',   'Settled all debts in a squad',        '🧙', 300);

-- ------------------------------------------------------------
-- 10. USER_ACHIEVEMENTS — unlocked per user PER SQUAD
-- ------------------------------------------------------------
CREATE TABLE user_achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  squad_id       UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id),
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, squad_id, achievement_id)
);

-- ------------------------------------------------------------
-- 11. PHOTOS — the Memory Wall. Can attach to a trip or float
-- free on the squad timeline.
-- ------------------------------------------------------------
CREATE TABLE photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id    UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  trip_id     UUID REFERENCES trips(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  url         TEXT NOT NULL,
  caption     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 12. COMMENTS — on photos or expenses (exactly one target)
-- ------------------------------------------------------------
CREATE TABLE comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id   UUID REFERENCES photos(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ( (photo_id IS NOT NULL)::int + (expense_id IS NOT NULL)::int = 1 )
);

-- ------------------------------------------------------------
-- 13. NOTIFICATIONS — "Vedant paid for the squad again 💀"
-- ------------------------------------------------------------
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  squad_id   UUID REFERENCES squads(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,            -- 'expense_added' | 'settlement' | 'achievement' | ...
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 14. ACTIVITY_LOG — powers the dashboard feed, admin audit
-- logs, AND is the source of truth for XP awards.
-- ------------------------------------------------------------
CREATE TABLE activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id   UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  action     TEXT NOT NULL,            -- 'expense.created' | 'settlement.completed' | ...
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 15. REACTIONS — emoji reactions on memory photos
-- ------------------------------------------------------------
CREATE TABLE reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('😂','🔥','💀','❤️','🍕','☕')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, photo_id, emoji)
);

-- ------------------------------------------------------------
-- 16. TREASURY — one row per squad, running balance in paise
-- ------------------------------------------------------------
CREATE TABLE treasury (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id   UUID NOT NULL UNIQUE REFERENCES squads(id) ON DELETE CASCADE,
  balance    BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 17. CONTRIBUTIONS — member puts money INTO the treasury
-- ------------------------------------------------------------
CREATE TABLE contributions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id   UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  amount     BIGINT NOT NULL CHECK (amount > 0),
  note       TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 18. TREASURY_TRANSACTIONS — every debit/credit on the treasury
-- type: 'deposit' (member contributes) | 'expense' (spent on an
-- expense) | 'refund' | 'reversal' (an expense that spent from
-- treasury was deleted, so the amount is credited back — v6.0)
-- ------------------------------------------------------------
CREATE TABLE treasury_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id    UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('deposit','expense','refund','reversal')),
  amount      BIGINT NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL DEFAULT '',
  expense_id  UUID REFERENCES expenses(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 19. OTP_CODES — email verification for login/register, password reset
-- purpose: 'login' | 'register' | 'reset_password'
-- ------------------------------------------------------------
CREATE TABLE otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,           -- bcrypt hash of the 6-digit code, never store plaintext
  purpose     TEXT NOT NULL CHECK (purpose IN ('login','register','reset_password')),
  attempts    INT NOT NULL DEFAULT 0,  -- failed verify attempts, locks after 5
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,             -- set once successfully used (prevents replay)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 20. PERSONAL_EXPENSES — a user's own expenses, outside any
-- squad. v6.0: this table (and #21) previously existed only in
-- scripts/setup-db.js's migrations, never in this file, so a
-- brand-new database was missing them entirely.
-- ------------------------------------------------------------
CREATE TABLE personal_expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  amount       BIGINT NOT NULL,        -- PAISE
  category     TEXT NOT NULL DEFAULT 'other',
  note         TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 21. PERSONAL_BUDGET — one row per user: monthly limit + savings goal
-- ------------------------------------------------------------
CREATE TABLE personal_budget (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthly_limit BIGINT,                -- PAISE
  savings_goal  BIGINT,                -- PAISE
  savings_saved BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- INDEXES — the queries we will run thousands of times
-- ------------------------------------------------------------
CREATE INDEX idx_members_squad          ON squad_members (squad_id) WHERE status = 'active';
CREATE INDEX idx_members_user           ON squad_members (user_id);
CREATE INDEX idx_expenses_squad         ON expenses (squad_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_expenses_trip          ON expenses (trip_id)  WHERE is_deleted = FALSE;
CREATE INDEX idx_participants_expense   ON expense_participants (expense_id);
CREATE INDEX idx_participants_user      ON expense_participants (user_id);
CREATE INDEX idx_settlements_squad      ON settlements (squad_id) WHERE status = 'completed';
CREATE INDEX idx_notifications_unread   ON notifications (user_id) WHERE is_read = FALSE;
CREATE INDEX idx_activity_squad_time    ON activity_log (squad_id, created_at DESC);
CREATE INDEX idx_photos_squad           ON photos (squad_id, created_at DESC);
CREATE INDEX idx_photos_trip            ON photos (trip_id);
CREATE INDEX idx_trips_squad            ON trips (squad_id, created_at DESC);
CREATE INDEX idx_contributions_squad    ON contributions (squad_id, created_at DESC);
CREATE INDEX idx_treasury_txns_squad    ON treasury_transactions (squad_id, created_at DESC);
CREATE INDEX idx_personal_expenses_user ON personal_expenses (user_id, expense_date DESC);
-- Partial index matching the exact shape of the verify-OTP query: it always
-- filters WHERE consumed_at IS NULL, so a partial index on just the unconsumed
-- rows is both smaller and a more precise match than indexing everything.
CREATE INDEX idx_otp_lookup ON otp_codes (email, purpose, created_at DESC) WHERE consumed_at IS NULL;
