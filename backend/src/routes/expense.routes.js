import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createExpense, listExpenses, deleteExpense } from '../controllers/expense.controller.js';
const r = Router();
r.use(requireAuth);
r.post('/', createExpense);
r.get('/squad/:squadId', listExpenses);
r.delete('/:id', deleteExpense);
export default r;
