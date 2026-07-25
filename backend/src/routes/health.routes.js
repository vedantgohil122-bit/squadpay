// ============================================================
// HEALTH CHECK — the heartbeat monitor.
// GET /api/health        -> is the API alive?
// GET /api/health/db     -> can the API reach PostgreSQL?
// ============================================================
import { Router } from 'express';
import { pingDb } from '../config/db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ success: true, service: 'SquadPay API', status: 'alive 🟢' });
});

router.get('/db', async (req, res, next) => {
  try {
    const now = await pingDb();
    res.json({ success: true, database: 'connected 🟢', serverTime: now });
  } catch (err) {
    next(err);
  }
});

export default router;
