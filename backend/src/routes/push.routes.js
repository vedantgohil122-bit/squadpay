import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { saveSubscription, listSubscriptions, deleteSubscription } from '../controllers/push.controller.js';

const r = Router();
r.use(requireAuth);
r.post('/subscribe', saveSubscription);
r.get('/', listSubscriptions);
r.delete('/', deleteSubscription);

export default r;
