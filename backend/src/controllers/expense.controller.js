import { z } from 'zod';
import { query, pool } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { computeShares } from '../services/split.service.js';
import { awardXp, unlockAchievement, XP } from '../services/xp.service.js';

const expenseSchema = z.object({
  treasuryAmount: z.number().int().min(0).optional().default(0),
  tripId: z.string().uuid().optional().nullable(), // paise from treasury
  squadId: z.string().uuid(),
  title: z.string().min(1, 'Title required').max(80),
  amount: z.number().int().positive('Amount must be positive'), // PAISE
  category: z.enum(['food','travel','movies','fuel','events','shopping','stay','other']).default('other'),
  notes: z.string().max(500).optional().default(''),
  paidBy: z.string().uuid(),
  splitType: z.enum(['equal','percentage','custom','shares']).default('equal'),
  participants: z.array(z.object({ userId: z.string().uuid(), value: z.number().optional() })).min(1),
  expenseDate: z.string().optional(),
  treasuryAmount: z.number().int().min(0).optional().default(0),
  tripId: z.string().uuid().optional().nullable(),
});

async function assertMember(squadId, userId) {
  const { rows } = await query(
    `SELECT 1 FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`, [squadId, userId]);
  if (!rows.length) throw new ApiError(403, 'You are not a member of this squad');
}

export async function createExpense(req, res, next) {
  const client = await pool.connect();
  try {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
    const d = parsed.data;
    await assertMember(d.squadId, req.user.id);

    const shares = computeShares(d.amount, d.splitType, d.participants);

    await client.query('BEGIN');
    const tAmt = Math.min(d.treasuryAmount || 0, d.amount);
    // Deduct from treasury if treasury_amount > 0
    if (tAmt > 0) {
      const { rows: tRows } = await client.query(`SELECT balance FROM treasury WHERE squad_id=$1`,[d.squadId]);
      const bal = tRows[0] ? Number(tRows[0].balance) : 0;
      if (bal < tAmt) throw new ApiError(400, `Treasury mein sirf ₹${(bal/100).toFixed(0)} hai, ₹${(tAmt/100).toFixed(0)} nahi 😅`);
      await client.query(`UPDATE treasury SET balance=balance-$1, updated_at=now() WHERE squad_id=$2`,[tAmt, d.squadId]);
      await client.query(
        `INSERT INTO treasury_transactions (squad_id,type,amount,description,user_id) VALUES ($1,'expense',$2,$3,$4)`,
        [d.squadId, tAmt, `Treasury ne "${d.title}" ke liye ₹${(tAmt/100).toFixed(0)} diya 🏦`, req.user.id]
      );
    }
    const { rows } = await client.query(
      `INSERT INTO expenses (squad_id, title, amount, category, notes, paid_by, split_type, expense_date, created_by, treasury_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date, CURRENT_DATE),$9,$10) RETURNING *`,
      [d.squadId, d.title, d.amount, d.category, d.notes, d.paidBy, d.splitType, d.expenseDate || null, req.user.id, tAmt]);

    if (d.tripId) {
      await client.query(`UPDATE expenses SET trip_id=$1 WHERE id=$2`, [d.tripId, rows[0].id]);
      rows[0].trip_id = d.tripId;
    }
    for (const s of shares) {
      await client.query(
        `INSERT INTO expense_participants (expense_id, user_id, share_amount, share_value) VALUES ($1,$2,$3,$4)`,
        [rows[0].id, s.userId, s.shareAmount, s.shareValue ?? null]
      );
    }
    await client.query('COMMIT');

    await awardXp(d.squadId, req.user.id, 'expense.created', XP.EXPENSE_ADDED, { title: d.title, amount: d.amount });
    await unlockAchievement(d.squadId, req.user.id, 'FIRST_EXPENSE');

    res.status(201).json({ success: true, expense: rows[0], shares });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
}

export async function listExpenses(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);

    // Pagination: caps the result set instead of loading every expense a
    // squad has ever logged. Defaults to 50/page — generous for normal use,
    // bounded so a 2-year-old squad with thousands of rows doesn't load
    // them all on every page visit. ?page=2 etc. for older history.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const { rows } = await query(
      `SELECT e.*, u.name AS paid_by_name, u.avatar_url AS paid_by_avatar,
        (SELECT json_agg(json_build_object('userId', ep.user_id, 'name', pu.name, 'shareAmount', ep.share_amount))
         FROM expense_participants ep JOIN users pu ON pu.id = ep.user_id WHERE ep.expense_id = e.id) AS participants
       FROM expenses e JOIN users u ON u.id = e.paid_by
       WHERE e.squad_id = $1 AND e.is_deleted = FALSE
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [squadId, limit, offset]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM expenses WHERE squad_id = $1 AND is_deleted = FALSE`,
      [squadId]
    );
    const total = countRows[0].total;

    res.json({
      success: true,
      expenses: rows,
      pagination: { page, limit, total, hasMore: offset + rows.length < total },
    });
  } catch (err) { next(err); }
}

export async function deleteExpense(req, res, next) {
  try {
    const { id } = req.params;
    const exp = (await query(`SELECT * FROM expenses WHERE id=$1 AND is_deleted=FALSE`, [id])).rows[0];
    if (!exp) throw new ApiError(404, 'Expense not found');
    const me = (await query(
      `SELECT role FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`,
      [exp.squad_id, req.user.id])).rows[0];
    if (!me) throw new ApiError(403, 'Not a member of this squad');
    if (me.role !== 'admin' && exp.created_by !== req.user.id)
      throw new ApiError(403, 'Only admins or the creator can delete this expense');
    await query(`UPDATE expenses SET is_deleted=TRUE, updated_at=now() WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}
