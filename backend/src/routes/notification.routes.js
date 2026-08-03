import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listNotifications, markRead, markAllRead, deleteNotification,
  getVapidKey, subscribe, unsubscribe,
} from '../controllers/notification.controller.js';

const r = Router();
r.use(requireAuth);
r.get('/', listNotifications);
r.patch('/:id/read', markRead);
r.post('/read-all', markAllRead);
r.delete('/:id', deleteNotification);

// Push subscription management
r.get('/push/vapid-key', getVapidKey);
r.post('/push/subscribe', subscribe);
r.post('/push/unsubscribe', unsubscribe);

export default r;
