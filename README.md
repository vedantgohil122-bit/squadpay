# SquadPay 💸

> Track Expenses. Save Friendships.

Social expense-tracking web app for friend squads — React + TypeScript + Tailwind v4 + Framer Motion frontend, Node/Express backend, PostgreSQL database.

## ✅ Current status

### ZIP 1 (this zip) — COMPLETE WORKING CORE ✅
- [x] Project scaffold + security middleware + health checks
- [x] Database schema (14 tables, tested on PostgreSQL 16)
- [x] Auth — register, login, JWT, protected routes (Google login comes in Zip 3 — needs your own Google Cloud keys)
- [x] Squads — create, invite codes, join, member list with XP & levels
- [x] Expenses — all 4 split types (equal / percentage / shares / custom), exact-paise math
- [x] Balance Engine — live net balances per member
- [x] Settlement Optimizer — minimum-transfer suggestions + one-tap settle
- [x] XP system + first achievements + activity feed
- [x] Full dark glassmorphism UI — landing, auth, dashboard, squad page (4 tabs), animations

### ZIP 2 (next) — Trips, Memory Wall, full achievements, leaderboards
### ZIP 3 (after) — Squad Wrapped, AI Roasts, themes, UPI links, analytics, Google login

## 🚀 Setup — 4 commands total

Your `.env` is already inside `backend/` fully filled in. Do NOT edit anything.

**Terminal 1 (backend):**
```powershell
cd backend
npm install
npm run setup
npm run dev
```
`npm run setup` creates all 14 database tables automatically. Wait for `🚀 SquadPay API running`.

**Terminal 2 (frontend) — click + in VS Code terminal panel:**
```powershell
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 in your browser (never double-click index.html).

⚠️ `backend/.env` contains your database password — never upload it to GitHub (it's already in .gitignore).

## 🧠 Key decisions (read this, future Vedant)

1. **Money is stored in PAISE (integers), never decimals.** ₹18.50 = `1850`. Floating-point math silently loses paise; integer math never does.
2. **XP lives on `squad_members`, not `users`** — you can be level 20 in one squad and level 1 in another.
3. **Level is never stored** — it's derived from XP via the `levels` table, so it can never go stale.
4. **Expenses are soft-deleted** (`is_deleted` flag) so balances stay auditable.
5. **`expense_participants.share_amount` is always final paise** — percentage/share math happens once at insert time, so the balance engine only ever sums integers.
6. **bcryptjs instead of bcrypt** — identical API, no native compilation pain on Windows.

## 📁 Structure
```
squadpay/
├── backend/
│   └── src/
│       ├── config/        db connection pool
│       ├── db/            schema.sql (14 tables)
│       ├── middleware/    central error handler (+ auth in Step 3)
│       ├── routes/        health (+ auth, squads, expenses soon)
│       ├── controllers/   (Step 3+)
│       ├── services/      balance engine will live here (Step 6)
│       └── utils/
└── frontend/
    └── src/
        ├── components/    reusable UI
        ├── pages/         route screens
        ├── store/         Zustand stores
        ├── lib/           api client, helpers
        └── index.css      design tokens (dark glassmorphism)
```

## 🔧 Fix: "Not a member of this squad" error on member profile

If you see this error when tapping a member avatar, your current logged-in account
is not in the squad_members table. Run this in Supabase SQL Editor:

```sql
-- Replace the email with YOUR current logged-in email
INSERT INTO squad_members (squad_id, user_id, role, status)
SELECT 
  s.id as squad_id,
  u.id as user_id,
  'admin' as role,
  'active' as status
FROM squads s, users u
WHERE u.email = 'meenaenterprise88@gmail.com'
ON CONFLICT (squad_id, user_id) DO UPDATE SET status = 'active';
```

Or simply log out and log back in with: vedantgohil122@gmail.com
