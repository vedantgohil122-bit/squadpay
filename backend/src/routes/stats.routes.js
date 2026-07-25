import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { leaderboards, roast, wrapped } from '../controllers/stats.controller.js';
const r = Router();
r.use(requireAuth);
r.get('/:id/leaderboards', leaderboards);
r.get('/:id/roast', roast);
r.get('/:id/wrapped', wrapped);
export default r;
