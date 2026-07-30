# SquadPay 💸

> Track Expenses. Save Friendships.

Social expense-tracking web app for friend squads — React + TypeScript + Tailwind v4 + Framer Motion frontend, Node/Express backend, PostgreSQL database.

## 🩹 v6.0 — bug fix pass

Full code review turned up a handful of real bugs, several of them breaking
things silently in production. All fixed:

- **Avatar & memory-photo uploads were broken in production.** Both called a
  bare relative `fetch('/api/...')` instead of going through the app's API
  client, so on Vercel (frontend) they hit the wrong origin instead of the
  Render backend. Fixed via a new `apiUpload()` helper in `lib/api.ts` that
  every upload now uses.
- **AI captions on Squad Wrapped never worked.** The old code called
  `api.anthropic.com` directly from the browser with no API key. Caption
  generation now goes through a new backend endpoint
  (`POST /api/stats/:id/wrapped/caption`) that holds the key server-side and
  degrades gracefully if it's not configured.
- **Personal Finance was unreachable.** The component existed and worked, but
  was never actually rendered on the Dashboard. It's now mounted there.
- **`setMemberUpi` always failed.** It read `req.params.squadId`, but the
  route only provides `:id` — the squad ID was always `undefined`.
- **Deleting a treasury-funded expense didn't refund the treasury.** The
  balance stayed debited forever. Deletion now reverses the treasury
  transaction atomically.
- **`schema.sql` had duplicate, conflicting table definitions** (trips,
  treasury, contributions, treasury_transactions each appeared twice) and was
  missing `personal_expenses`/`personal_budget` entirely — a brand-new
  database built from this file alone would have a broken Trip Mode
  (no `budget`/`status` columns) and no Personal Finance tables at all.
  Rewritten as one clean, deduplicated schema matching what the migration
  script (`setup-db.js`) actually produces.
- Minor cleanup: removed a leftover debug `console.log` in `MemberSheet`, a
  debug field leaking squad/user IDs in a 403 response, a redundant reaction
  upsert doing 2-3 queries where one does the job, dead variables in the
  stats controller, a duplicated prop in `FunTab`, and relabeled the avatar
  "AI Generate" tab (it's prompt-seeded DiceBear variation, not real AI) so
  it doesn't overpromise.

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
