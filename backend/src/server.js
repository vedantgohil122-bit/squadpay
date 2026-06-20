// ============================================================
// SQUADPAY API — server entry point
// Think of this file as the hotel reception: every request
// walks in here first, gets security-checked (helmet, cors,
// rate limit), then gets directed to the right room (routes).
// ============================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import squadRoutes from './routes/squad.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import settlementRoutes from './routes/settlement.routes.js';
import statsRoutes from './routes/stats.routes.js';
import treasuryRoutes from './routes/treasury.routes.js';
import tripRoutes from './routes/trip.routes.js';
import memoryRoutes from './routes/memory.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy, so every request
// arrives with an X-Forwarded-For header set by Render itself. Express
// doesn't trust that header by default (correctly, since a malicious client
// could otherwise spoof its own IP) but express-rate-limit needs a real
// client IP to rate-limit per-user instead of per-proxy. `1` tells Express
// to trust exactly one hop of proxying — matching Render's actual setup —
// rather than blindly trusting the whole forwarded chain.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// ---- Security guards (same crew you used in Student Planner) ----
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || 'http://localhost:5173',
      /\.vercel\.app$/,
      /localhost/,
    ],
    credentials: true,
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,                 // 300 requests per window per IP — general API traffic
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Stricter limiter specifically for auth endpoints (login/register/OTP/reset).
// The global 300/15min above is fine for normal API use but far too loose to
// stop a credential-stuffing or OTP-brute-force script — 300 password guesses
// in 15 minutes is nothing for an automated attacker. This one caps the
// sensitive surface much tighter, independent of general traffic.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 auth attempts per IP per 15 min — generous for a real user, painful for a script
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Bahut zyada attempts ho gaye — thodi der baad try karo' },
});
app.use('/api/auth', authLimiter);

// ---- Body parsing ----
app.use(express.json({ limit: '1mb' }));

// ---- Routes ----
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/squads', squadRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/treasury', treasuryRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/uploads', express.static('uploads'));

// ---- 404 + central error handling (always LAST) ----
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 SquadPay API running on http://localhost:${PORT}`);
});
