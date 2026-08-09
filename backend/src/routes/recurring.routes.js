import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createRecurring, listRecurring, toggleRecurring, deleteRecurring } from '../controllers/recurring.controller.js';

const r = Router();
r.use(requireAuth);
r.post('/', createRecurring);
r.get('/squad/:squadId', listRecurring);
r.patch('/:id/toggle', toggleRecurring);
r.delete('/:id', deleteRecurring);
export default r;
