# SquadPay 💸

> Track Expenses. Save Friendships.

Social expense-tracking web app for friend squads — React + TypeScript + Tailwind v4 + Framer Motion frontend, Node/Express backend, PostgreSQL database.

## 💾 v6.5 — persistent file storage (uploads no longer vanish)

**The bug:** avatars and memory photos were stored on Render's local disk.
Render's free tier filesystem is ephemeral — every redeploy or restart
(which happens automatically after inactivity) silently wiped every
uploaded photo and avatar since the last deploy. This had been true since
the very first version and was never caught because it only shows up
*after* a restart, not immediately after uploading.

**The fix:** uploads now go to **Supabase Storage** — no new account
needed, since this project already runs its database on Supabase. Multer
switched from `diskStorage` to `memoryStorage`; the uploaded buffer goes
straight to a Supabase bucket and the returned public URL (already
absolute, `https://...supabase.co/...`) is stored in the database instead
of a local relative path.

**Zero frontend changes needed** — the `assetUrl()` helper from the
Memories-photos fix (v6.3) already passes absolute URLs through unchanged,
so this was a backend-only fix.

**One-time setup required** (nothing works without this):
1. Supabase dashboard → your project → Storage → **Create a new bucket**
   named `squadpay-uploads`, and mark it **Public** (uploaded photos need
   to be viewable without auth, same as any image host)
2. Project Settings → API → **Project URL** → `SUPABASE_URL`
3. Project Settings → API → **service_role key** (not the anon key — this
   needs write access) → `SUPABASE_SERVICE_KEY`

Without these two variables, avatar/photo uploads return a clear error —
everything else in the app is unaffected.

## ✏️ v6.5 — expense editing

Expenses could only be created or deleted before — no way to fix a typo in
the amount or title without deleting and losing the treasury link and
history. Now:

- `PATCH /expenses/:id` — same permission rule as delete (creator or admin).
- **Treasury handled correctly on edit**, not just recomputed blindly: if
  the expense was treasury-funded, editing refunds the old amount back to
  the treasury and deducts the new amount, each logged as its own audit
  trail entry (a `reversal` + a fresh `expense` transaction) — same pattern
  already used for delete's treasury refund.
- **Participant shares are fully recomputed** from the edited split, not
  patched — old `expense_participants` rows are replaced outright so a
  switch from "equal" to "percentage" (or changing who's included) can't
  leave stale rows behind.
- Reused the existing `AddExpenseModal` for editing instead of building a
  second form — it now takes an optional `editingExpense` prop and prefills
  every field, including the original raw % / shares input (not just the
  computed amount), which required adding `shareValue` to what
  `listExpenses` returns — it existed in the database already, just wasn't
  in the API response.
- Edit button next to Delete in the Expenses tab (same "creator only"
  visibility rule already used for delete).

## 🆕 v6.4 — recurring expenses, reminders, search, statement export

Four new features. (Also considered squad polls and receipt-scanning OCR —
deliberately held off on those, since each needs a bigger new surface of
its own rather than extending what's already there.)

- **Recurring Expenses** — rent, WiFi, subscriptions. Set it once (amount,
  category, who pays, day of month) and it auto-generates as a real expense
  every month, split equally across whoever's active in the squad at the
  time. No background cron (Render's free tier can't run one reliably) —
  due items are generated lazily, the next time anyone opens the squad's
  expenses. New `recurring_expenses` table, `/api/recurring/*` routes,
  manage them from a card on the Overview tab.
- **Reminder / Nudge** — "🔔 Yaad dilao" button in Settle, shown to whoever's
  *owed* money in a suggestion. Sends the debtor a real notification+push.
  Reuses the existing notification pipeline entirely — no new
  infrastructure.
- **Expense search & filter** — search bar + category dropdown on the
  Expenses tab, debounced. Backend `listExpenses` now accepts `q`,
  `category`, `payerId`, `from`, `to` query params, all optional/additive.
- **Squad statement CSV export** — every expense + every completed
  settlement, one CSV, from the `⋮` squad menu. Note: this needed an
  authenticated fetch + blob download, not a plain link — a bare `<a href>`
  to an authenticated API route can't carry the JWT and would 401.

**Also confirmed already built, no work needed:** UPI deep-link "Pay via
UPI" — was already wired into the Settle tab from an earlier round.

## 🚪 v6.3 — Leave Squad, Delete Squad, mobile overflow fixes, broken images fixed

**Leave Squad** (new) — `POST /squads/:id/leave`. Blocked if you have a
nonzero balance (must settle up first), a pending settlement in-flight, or
you're the squad's only admin while other members remain (would strand the
squad). If you're the last member overall, leaving is allowed — nobody's
left stranded.

**Delete Squad** (new) — `DELETE /squads/:id`, admin-only, requires typing
the squad's exact name to confirm. Relies on the cascade-delete foreign
keys already in the schema (expenses, trips, photos, treasury, settlements,
etc. all clean up automatically) — no new schema needed.

**Memory photos not displaying — root cause found and fixed.** Uploaded
images are static files served by the *backend* (Render) at a relative
path like `/uploads/xxx.png`. The frontend (Vercel) is a different origin
in production, so `<img src="/uploads/...">` resolved against the wrong
domain and 404'd. This was silently breaking **avatars everywhere in the
app too** — same root cause, one shared `Avatar` component, so one fix
covers both. Added `assetUrl()` in `lib/api.ts`, applied to Avatar,
Memories, trip photos, and Wrapped photos.

**Mobile fixes** (verified at 320/375/390/414/768px):
- SquadPage's top nav (bell + sound toggle + Analytics + invite code)
  overflowed off-screen on narrow phones — consolidated into a `⋮` menu
  (also the new home for Leave/Delete Squad)
- Dashboard's header buttons and the create-squad emoji picker could
  overflow at 320px — now wrap instead of clipping
- The expense split-type picker ("equal/percentage/shares/custom") crammed
  "percentage" into an unreadably narrow cell below ~360px — now 2 columns
  on mobile, 4 on desktop (unchanged)
- **The shared `Modal` component had no scroll handling** — a tall form
  (Add Expense, with 8+ fields) could push its Submit button below the
  viewport with no way to scroll to it on a short screen. Fixed once, in
  the one shared component every modal uses.

## 🔔 v6.2 — password verifier fix, mobile-friendly notifications, memory alerts

- **Login's password field no longer falsely claims "Sahi hai ✓."** It used
  to show a green checkmark the instant you typed *anything*, implying the
  password had been verified — but nothing had actually been checked against
  the account yet. Register still shows it (there it's validating real
  format rules: length, has a number/capital), but login now stays neutral
  until the server actually confirms the credential.
- **Notification panel is now a proper mobile bottom sheet**, matching the
  app's existing pattern (same as the member profile sheet) — full-width,
  slides up from the bottom, drag handle, on phones. Desktop keeps the
  small anchored dropdown.
- **Uploading a memory now notifies the squad** — this was the one action
  in the app that didn't notify anyone.
- **Fixed a real crash bug from testing:** a malformed `VAPID_SUBJECT` (e.g.
  missing `mailto:`) or a mistyped VAPID key used to crash the **entire**
  backend on startup — login, expenses, everything — because of one
  optional feature's env var typo. Now it just disables push and logs a
  warning, same as if the keys were never set at all.

## 🔔 v6.1 — real push notifications

Notifications now work two ways:

1. **In-app bell** (top of Dashboard and every squad page) — shows recent
   activity, unread count badge, click to jump to that squad. Polls every
   30s. Backed by the `notifications` table (already existed in the schema,
   just never had an API on top of it before).
2. **Real browser push** — via the Web Push protocol (VAPID). Once a user
   taps "Allow" on the prompt, they get actual OS-level notifications —
   phone lock screen, desktop notification center — **even with the
   SquadPay tab/app fully closed**. This is the real thing, not a
   simulated/local notification.

**What triggers a notification:** someone adds an expense, sends or
confirms a settlement, joins your squad, contributes to the treasury, or
uploads a memory photo.

**Setup:** push notifications are fully optional — the in-app bell always
works. To enable real push, generate a VAPID keypair and add it to `.env`:
```
node -e "console.log(require('web-push').generateVAPIDKeys())"
```
Copy the `publicKey`/`privateKey` into `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`
in `backend/.env`, and set `VAPID_SUBJECT=mailto:you@yourdomain.com`
(the `mailto:` prefix is required — without it, older versions of this
crashed the backend; v6.2 fixes that, but the prefix is still needed for
push to actually work). Then run `npm run setup` to add the new
`push_subscriptions` table. Without these variables set, the backend just
skips sending pushes — nothing breaks, the bell still works.

**iOS note:** push only works on iPhone if SquadPay is added to the home
screen (Share → Add to Home Screen) on iOS 16.4+. A regular Safari tab
cannot receive push at all — that's an Apple platform restriction.

**Note on the `arena` branch:** this reuses the useful parts of the
unmerged notification work that was sitting in `arena/019fa459-squadpay`
(the bell UI, the backend CRUD) but replaces its non-functional push stub
— that branch's `lib/push.ts` had a literal placeholder VAPID key and no
server-side sending — with an actual working Web Push implementation.

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
