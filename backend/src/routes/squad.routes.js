import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createSquad, joinSquad, mySquads, squadDetail, memberProfile, setMemberUpi, leaveSquad, deleteSquad } from '../controllers/squad.controller.js';

const r = Router();
r.use(requireAuth);
r.post('/', createSquad);
r.post('/join', joinSquad);
r.get('/', mySquads);
// CRITICAL: specific sub-routes BEFORE the /:id wildcard
r.get('/:id/member/:userId', memberProfile);
r.patch('/:id/member/:userId/upi', setMemberUpi);
r.post('/:id/leave', leaveSquad);
r.delete('/:id', deleteSquad);
r.get('/:id', squadDetail);
export default r;
