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

## 📐 v6.7.3 — whole-page horizontal shift on mobile, further nav trim

Reported: on a real phone, the entire squad page was shifted left with
text cut off ("asury" instead of "Treasury"), and the top nav still
showed the full Analytics/invite-code button row that should've been
hidden on mobile since v6.3.

- **Root cause of the shift:** no safeguard existed anywhere against the
  page becoming horizontally scrollable — if any element, anywhere in a
  deep component tree, ever rendered even slightly wider than the
  viewport, the *entire page* became side-scrollable, and any nonzero
  scroll position would shift everything left in sync (which is exactly
  what the screenshot showed). Added `overflow-x: hidden` + `max-width:
  100vw` on `html, body` as a global safety net — this class of bug can't
  recur regardless of which future component causes the overflow.
- **The crowded nav row was source-code-correct** (verified directly —
  `hidden sm:inline-flex` was already properly in place from v6.3) but
  the phone was almost certainly showing a **stale cached PWA shell**.
  Bumped the service worker's cache version (`v1` → `v2`) to force any
  phone stuck on an old cached build to clean it up and fetch fresh —
  the cleanup logic already existed, it just needed a version bump to
  trigger.
- **Trimmed the mobile nav further** per request: dark-mode and sound
  toggles moved out of the main row into the `⋮` menu on mobile (still
  reachable, just not cluttering the tightest screen real estate) — down
  to just the notification bell and the menu button on small screens.

## 🎨 v6.7.2 — professional login page, mobile safe-area + alignment fixes

**Login/Register page:**
- Removed the meme marquee ticker that sat directly above the credential
  form — a joke banner right above a login form was the single biggest
  thing making it feel unprofessional
- Card shadow: swapped the hard neo-brutalist offset shadow for a
  standard soft drop shadow (`box-shadow: 0 8px 32px rgba(0,0,0,0.35)`),
  border toned down from a thick marigold outline to a subtle 1px one
- Copy cleanup: validator errors, password-strength labels ("Bahut weak
  😬" → "Weak"), and screen headings had their per-sentence emoji and
  meme-speak stripped. Kept the Hinglish language itself — that's the
  app's identity — just dropped the "😅😬🎉" layer specifically on the
  auth flow, since that's the one screen that reads as a serious
  trust-building moment (entering a password) rather than a fun one.

**Mobile safe-area handling (new — this genuinely didn't exist before):**
- Added `viewport-fit=cover` to the viewport meta tag — required for
  `env(safe-area-inset-*)` to resolve to anything other than 0
- Every fixed bottom element in the app (5 FAB buttons, 4 slide-up bottom
  sheets, the mobile tab bar) now respects the phone's safe area — on a
  notched iPhone, these no longer sit flush against or under the home
  indicator

**Two more backdrop-filter instances found and removed** (the mobile-lag
sweep in v6.7.1 used a hyphenated-CSS-property search, which missed
these two since they're written as camelCase `backdropFilter` in inline
JS style objects): the member-profile sheet's overlay, and — more
significantly — the **persistent mobile bottom tab bar**, which was
blurring continuously on every squad page view, not just briefly during
a modal. Both backgrounds were already 90%+ opaque, so removing the blur
costs nothing visually while cutting a real, continuous compositing cost.

**Alignment consistency:** every page in the app uses `px-5` horizontal
edge padding except `SquadPage.tsx`, which used `px-4` on mobile /
`sm:px-6` on desktop — meaning content shifted slightly every time you
navigated from Dashboard into a squad. Standardized to `px-5` everywhere.

## 📱 v6.7.1 — mobile performance fix

You reported the app feeling laggy on phone specifically. Found three real,
concrete causes rather than guessing — no visual redesign, all under-the-
hood:

1. **Zero code-splitting.** Every route was bundled into one 533KB file —
   opening the app just to check your Dashboard downloaded and parsed
   Treasury's Socket.IO/Razorpay integration, Wrapped's animation-heavy
   slideshow, and the BakraWheel game too, every single time. Routes past
   the entry pages (Dashboard, SquadPage, Wrapped, TreasuryPage, TripsPage,
   TripDetailPage) are now lazy-loaded per-page via `React.lazy` +
   `Suspense`. Main bundle: **533KB → 326KB (39% smaller)**, verified in
   the actual build output — everything else now fetches on demand.
2. **`backdrop-blur-sm` on the shared Modal component.** `backdrop-filter`
   is a known-expensive GPU operation on mobile, and this Modal opens
   constantly — every add-expense, every confirmation dialog, every
   profile edit. Removed the blur, kept the dark dimming overlay.
3. **No lazy-loading on any photo.** Memory wall photos, trip photos, and
   avatars were all downloading/decoding immediately regardless of
   whether they were on-screen. Added `loading="lazy" decoding="async"`
   across all of them — a Memories wall with many photos no longer forces
   the browser to decode everything upfront.

(Checked `.glass`/`backdrop-filter` usage elsewhere first — it turned out
unused everywhere except that one Modal, so this wasn't a wider sweep,
just the one real instance.)

## 💳 v6.7 — Live Treasury + Online Payment System (Razorpay)

Real money-in via a real payment gateway, verified server-side, broadcast
live to everyone viewing the Treasury. Existing manual/cash contribution
logging is untouched — this adds a second, parallel path into the *same*
ledger, it doesn't replace anything.

**Core rule everything here is built around: the frontend never credits
money.** Razorpay's checkout reporting "success" to the browser is treated
as a hint, not a fact — only a signature-verified webhook, hitting the
backend directly, ever updates a treasury balance.

### Files changed / added

**Backend — new:**
- `src/services/payment/index.js` — provider factory/interface (swap providers by adding one file, not touching the controller)
- `src/services/payment/razorpay.provider.js` — the concrete Razorpay implementation
- `src/controllers/payment.controller.js` — order creation, webhook handler, refunds, contribution tracking
- `src/routes/payment.routes.js`
- `src/realtime.js` — shared Socket.IO instance holder

**Backend — modified:**
- `src/server.js` — HTTP server now created explicitly (Socket.IO needs it), JWT-authenticated socket connections, `express.json()` now captures the raw body (needed for webhook signature verification), payment routes mounted
- `src/db/schema.sql`, `scripts/setup-db.js` — new tables + column additions (below)
- `.env.example` — Razorpay + webhook setup instructions

**Frontend — new:**
- `src/lib/socket.ts` — shared Socket.IO client connection
- `src/lib/razorpay.ts` — loads Razorpay's Checkout script, thin wrapper around opening it

**Frontend — modified:**
- `src/pages/TreasuryPage.tsx` — "Pay Online" flow, live balance via socket, Targets tab (contribution tracking), History tab gained search/filter + admin refund action

### Database changes

No existing table was dropped or restructured — only additions:
- **`payment_orders`** (new) — one row per "Pay ₹X" attempt. `provider_order_id` is `UNIQUE`, the anchor idempotency depends on.
- **`payment_events`** (new) — immutable webhook audit log. `(provider, provider_event_id)` is `UNIQUE` — this is what actually stops a re-delivered webhook from crediting money twice.
- **`treasury`** — added `contribution_target` (nullable, paise)
- **`treasury_transactions`** — added `payment_order_id` (nullable FK), so every online-payment-sourced ledger entry traces back to its order

**Deliberately NOT added:** a `member_contributions` table. Per-member paid/required/remaining is fully derivable from `SUM(treasury_transactions) GROUP BY user_id` against `treasury.contribution_target` — storing it separately would just be a cache that could drift out of sync with the real ledger, which is exactly the kind of duplicate money-tracking system the brief said to avoid.

### API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/payments/treasury/create-order` | JWT | Creates a `payment_orders` row + Razorpay order |
| POST | `/api/payments/webhook/razorpay` | Signature (no JWT) | Razorpay calls this directly, server-to-server |
| GET | `/api/payments/treasury/order/:orderId/status` | JWT | Fallback poll while waiting for the webhook |
| GET | `/api/payments/treasury/:squadId/contributions` | JWT | Derived paid/required/remaining per member |
| POST | `/api/payments/treasury/:squadId/contribution-target` | JWT, admin | Sets the per-member target |
| POST | `/api/payments/treasury/refund/:transactionId` | JWT, admin | Refunds a verified online payment |

### Payment flow

```
User taps "Pay ₹500"
  → POST /payments/treasury/create-order (amount validated server-side)
  → payment_orders row created (status='created')
  → Razorpay order created via their API
  → Frontend opens Razorpay Checkout with the order id
  → User pays (UPI/card/netbanking)
  → Checkout reports "success" to the browser — NOT trusted, just a hint
  → Frontend shows "Verifying payment..." and starts polling order status
  → [see Webhook flow below — this is what actually credits anything]
  → Once payment_orders.status flips to 'paid' (via webhook OR the socket
    event lands first), the modal closes and the balance is already live
```

### Webhook flow

```
Razorpay → POST /api/payments/webhook/razorpay (raw body + x-razorpay-signature header)
  1. Verify HMAC signature over the RAW body against RAZORPAY_WEBHOOK_SECRET
     → invalid? 400, stop. Nothing below runs.
  2. INSERT INTO payment_events (provider_event_id UNIQUE) ON CONFLICT DO NOTHING
     → already processed this exact event? Return 200, stop. (idempotency)
  3. Look up payment_orders by provider_order_id, lock the row (FOR UPDATE)
     → already 'paid'? stop. (second idempotency layer)
  4. Verify the PAID AMOUNT matches what the order was created for
     → mismatch? mark order 'failed', stop. Never trust the webhook's
       amount blindly either.
  5. BEGIN transaction:
     - payment_orders.status = 'paid'
     - treasury.balance += amount
     - INSERT treasury_transactions (type='deposit', payment_order_id=...)
     - INSERT contributions (keeps existing wallet stats accurate)
     COMMIT
  6. Outside the transaction (money is already safely committed):
     - notify the payer + the rest of the squad
     - award XP
     - broadcastToSquad(squadId, 'treasury:update', {...})
```

### Real-time event flow

```
TreasuryPage mounts
  → connects to Socket.IO (JWT sent at handshake — same token as every API call)
  → emits 'join-squad' with the squad id
  → server verifies real membership before letting the socket join that room
       (a socket can never listen in on a squad it isn't actually in)

Webhook confirms a payment
  → server emits 'treasury:update' to room `squad:{squadId}`
  → every connected member's TreasuryPage merges the update directly into
    state (balance + prepend the transaction) — no refetch, no refresh
```

**Render free-tier note:** WebSockets work fine on Render's free tier, but
the free tier spins the server down after ~15 min idle. A dropped socket
just reconnects automatically after the cold start (Socket.IO's client
does this natively) — usually 30-50s. The order-status poll and the
existing 30s notification-bell poll both serve as fallbacks for that gap.

### Environment variables required

```
RAZORPAY_KEY_ID=          # from Razorpay Dashboard -> Settings -> API Keys
RAZORPAY_KEY_SECRET=      # same place — keep this one server-side only, never send to frontend
RAZORPAY_WEBHOOK_SECRET=  # set when you add the webhook URL in their dashboard
```
All three optional — omit any and online payments cleanly disable
themselves (manual/cash logging is unaffected). See `.env.example` for the
exact dashboard steps.

### Security considerations

- **No card/UPI/CVV data ever touches this backend** — Razorpay's Checkout handles all of that on their own hosted, PCI-compliant page. This app only ever sees an order id and a payment id.
- **Amount validated server-side at order creation** (min ₹1, max ₹1,00,000 sanity ceiling) — the amount the client sends is a request, not a fact.
- **Webhook signature verified against the raw request body** using `crypto.timingSafeEqual` (not a plain `===`, which is vulnerable to timing attacks on the comparison itself).
- **Idempotency at the database level**, not just application logic — two `UNIQUE` constraints (`payment_orders.provider_order_id`, `payment_events(provider, provider_event_id)`) mean a duplicate can't get through even under concurrent requests.
- **Squad membership checked on every endpoint** — contributions, order creation, refunds all verify `req.user.id` is an active member of the squad in question before doing anything.
- **Refunds are admin-only**, verified via the same role check used everywhere else in the app.
- **Sockets authenticate with the same JWT** as REST calls — no separate, weaker realtime auth path — and `join-squad` re-verifies membership server-side rather than trusting whatever squad id the client asks to join.

### Testing steps (test mode, zero real money)

1. Add your **Test Mode** keys to `backend/.env`, restart the backend.
2. Locally, use a tool like `ngrok` to expose your backend so Razorpay's test webhooks can reach it: `ngrok http 5000`, then use that URL + `/api/payments/webhook/razorpay` in the Razorpay dashboard's webhook settings.
3. Open a squad's Treasury page, tap **Pay Online**, enter an amount.
4. Razorpay's checkout opens — use their [documented test card/UPI numbers](https://razorpay.com/docs/payments/payments/test-card-upi-details/) (e.g. card `4111 1111 1111 1111`, any future expiry, any CVV).
5. Confirm: the modal shows "Verifying...", then closes on its own once the webhook lands; the balance updates without a page refresh; a notification arrives.
6. Open the same squad in a second browser/incognito window (different account) — confirm it also updates live, without refreshing.
7. Test a **failed** payment (Razorpay's test cards include ones that deliberately decline) — confirm the order shows 'failed' and nothing gets credited.
8. As admin, test **Set Target**, then check the Targets tab shows PAID/PENDING/NOT PAID correctly across members.
9. As admin, test **Refund** on a completed online payment from the History tab — confirm the balance decreases and the original transaction stays in history untouched (a new `refund` row appears instead).

### Deployment changes — Vercel + Render

**Render (backend):**
- Add the three `RAZORPAY_*` env vars in the dashboard's Environment tab
- Add the production webhook URL in Razorpay's dashboard once deployed: `https://your-actual-render-url.onrender.com/api/payments/webhook/razorpay`
- No Render service-type change needed — Socket.IO runs on the same HTTP server as the existing Express app, same port, same "Web Service" type already in use
- Run `npm run setup` once against the live database for the new tables

**Vercel (frontend):** no configuration changes needed — the socket connection and Razorpay Checkout both talk directly to the Render backend's origin, the same way every other API call already does. A normal redeploy from the git push is sufficient.

## 🌗 v6.6 — dark / light mode

**Important context on how this was built:** the `arena` branch this was
requested from isn't actually a "dark mode branch" — it's a large
divergent fork (54 files, ~1800 lines) that evolved its own independent
notifications, push, and offline systems, on top of an old snapshot with
none of v6.0–v6.5's work in it. Merging it wholesale would have silently
wiped out Leave/Delete Squad, recurring expenses, expense editing, and
every bug fix since. Instead, only the theme-specific pieces were
extracted (`ThemeToggle.tsx`, `store/theme.ts`, the CSS variable
structure) and rebuilt cleanly against the current codebase.

**How it actually works:** the app's entire color system was already
built on CSS custom properties feeding into Tailwind v4's `@theme` block
(`--color-bone`, `--color-ink-900`, etc.) — so every existing Tailwind
class (`text-bone/50`, `bg-ink-900`) and every `.bcard`/`.bbtn`/`.binput`
rule automatically became theme-aware just by making those underlying
variables swap based on a `data-theme` attribute on `<html>`. No component
using those classes needed to change at all.

The real work was the **558 places across 17 files** using raw hardcoded
hex colors (`style={{ color: '#f5f0e8' }}`) that bypassed the variable
system entirely — those don't respond to anything. All were swapped for
the equivalent `var(--color-*)` reference. A handful of genuinely
decorative one-off colors (BakraWheel's spinning-wheel segment colors,
a couple of PersonalFinance chart accents) were deliberately left static
— they're vivid accent colors on small chart/wheel elements, not text or
backgrounds, and read fine unchanged in both themes.

Toggle (🌙/☀️) is in the header on Landing, Dashboard, and every Squad
page. Choice persists via `localStorage`; first-time visitors get their
OS preference; the toggle transitions smoothly (`transition: background-
color 0.2s, color 0.2s` on body/cards/inputs) instead of an abrupt flash.

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
