import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listNotifications, markRead, markAllRead, deleteNotification } from '../controllers/notification.controller.js';

const r = Router();
r.use(requireAuth);
r.get('/', listNotifications);
r.patch('/:id/read', markRead);
r.post('/read-all', markAllRead);
r.delete('/:id', deleteNotification);

export default r;
