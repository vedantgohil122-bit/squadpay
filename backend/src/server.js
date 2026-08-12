// ============================================================
// SQUADPAY API — server entry point
// Think of this file as the hotel reception: every request
// walks in here first, gets security-checked (helmet, cors,
// rate limit), then gets directed to the right room (routes).
// ============================================================
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
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
import personalRoutes from './routes/personal.routes.js';
import memoryRoutes from './routes/memory.routes.js';
import recurringRoutes from './routes/recurring.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { query } from './config/db.js';
import { setIO } from './realtime.js';

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
// The `verify` callback captures the raw, unparsed request body onto
// req.rawBody alongside the normal JSON parse. This ONLY matters for the
// Razorpay webhook route (payment.controller.js razorpayWebhook), whose
// signature is an HMAC over the exact raw bytes — computing it from
// JSON.stringify(req.body) instead would silently produce a signature
// that never matches, since key order / whitespace isn't guaranteed to
// round-trip identically. Capturing it here (once, globally) is simpler
// and less error-prone than trying to special-case body parsing per route.
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

// ---- Routes ----
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/squads', squadRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/treasury', treasuryRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/personal', personalRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/uploads', express.static('uploads'));

// ---- 404 + central error handling (always LAST) ----
app.use(notFound);
app.use(errorHandler);

// Socket.IO needs the raw HTTP server (not just the Express app) to
// attach to, since WebSocket upgrades happen at the HTTP layer below
// Express's own routing.
const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [process.env.CLIENT_URL || 'http://localhost:5173', /\.vercel\.app$/, /localhost/],
    credentials: true,
  },
});
setIO(io);

// Every socket connection must present the same JWT used for normal API
// calls — there's no separate, weaker auth path for realtime.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Login required'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.sub;
    next();
  } catch {
    next(new Error('Session expired'));
  }
});

io.on('connection', (socket) => {
  // Client asks to join a specific squad's room — verified against real
  // membership before joining, so a socket can never listen in on a
  // squad this user isn't actually part of.
  socket.on('join-squad', async (squadId) => {
    try {
      if (!squadId) return;
      const { rows } = await query(
        `SELECT 1 FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`,
        [squadId, socket.userId]
      );
      if (rows.length) socket.join(`squad:${squadId}`);
    } catch { /* non-fatal — worst case, this socket just doesn't get live updates */ }
  });

  socket.on('leave-squad', (squadId) => { if (squadId) socket.leave(`squad:${squadId}`); });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 SquadPay API running on http://localhost:${PORT}`);
});
