import { z } from 'zod';
import { query, pool } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { computeShares } from '../services/split.service.js';
import { awardXp, unlockAchievement, XP } from '../services/xp.service.js';
import { createNotificationForSquad } from './notification.controller.js';
import { runDueRecurring } from './recurring.controller.js';

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

    createNotificationForSquad({
      squadId: d.squadId,
      excludeUserId: req.user.id,
      type: 'expense_added',
      message: `${req.user.name} ne "${d.title}" add kiya — ₹${(d.amount / 100).toFixed(0)}`,
      metadata: { expenseId: rows[0].id, amount: d.amount },
    });

    res.status(201).json({ success: true, expense: rows[0], shares });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
}

export async function listExpenses(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);
    await runDueRecurring(squadId).catch((e) => console.error('runDueRecurring:', e.message));

    // Pagination: caps the result set instead of loading every expense a
    // squad has ever logged. Defaults to 50/page — generous for normal use,
    // bounded so a 2-year-old squad with thousands of rows doesn't load
    // them all on every page visit. ?page=2 etc. for older history.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    // Optional filters — all additive, none required. Category/payer are
    // exact matches; q is a case-insensitive substring match on title/notes;
    // from/to bound expense_date inclusively.
    const { category, payerId, q, from, to } = req.query;
    const where = [`e.squad_id = $1`, `e.is_deleted = FALSE`];
    const params = [squadId];
    let idx = 2;
    if (category) { where.push(`e.category = $${idx++}`); params.push(category); }
    if (payerId) { where.push(`e.paid_by = $${idx++}`); params.push(payerId); }
    if (q) { where.push(`(e.title ILIKE $${idx} OR e.notes ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
    if (from) { where.push(`e.expense_date >= $${idx++}`); params.push(from); }
    if (to) { where.push(`e.expense_date <= $${idx++}`); params.push(to); }
    const whereSql = where.join(' AND ');

    const { rows } = await query(
      `SELECT e.*, u.name AS paid_by_name, u.avatar_url AS paid_by_avatar,
        (SELECT json_agg(json_build_object('userId', ep.user_id, 'name', pu.name, 'shareAmount', ep.share_amount))
         FROM expense_participants ep JOIN users pu ON pu.id = ep.user_id WHERE ep.expense_id = e.id) AS participants
       FROM expenses e JOIN users u ON u.id = e.paid_by
       WHERE ${whereSql}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM expenses e WHERE ${whereSql}`,
      params
    );
    const total = countRows[0].total;

    res.json({
      success: true,
      expenses: rows,
      pagination: { page, limit, total, hasMore: offset + rows.length < total },
    });
  } catch (err) { next(err); }
}

// Squad-wide statement: every expense plus every completed settlement, one
// CSV — mirrors the same export pattern already used for Personal Finance.
export async function exportSquadStatement(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);

    const expenses = (await query(
      `SELECT e.expense_date, e.title, e.category, e.amount, u.name AS paid_by_name
       FROM expenses e JOIN users u ON u.id = e.paid_by
       WHERE e.squad_id=$1 AND e.is_deleted=FALSE ORDER BY e.expense_date`,
      [squadId]
    )).rows;
    const settlements = (await query(
      `SELECT s.created_at, fu.name AS from_name, tu.name AS to_name, s.amount, s.method
       FROM settlements s JOIN users fu ON fu.id=s.from_user JOIN users tu ON tu.id=s.to_user
       WHERE s.squad_id=$1 AND s.status='completed' ORDER BY s.created_at`,
      [squadId]
    )).rows;

    const lines = ['Type,Date,Description,Amount,Detail'];
    expenses.forEach((e) => lines.push(
      `Expense,"${e.expense_date}","${e.title.replace(/"/g, '""')}",${(Number(e.amount)/100).toFixed(2)},"Paid by ${e.paid_by_name} (${e.category})"`
    ));
    settlements.forEach((s) => lines.push(
      `Settlement,"${new Date(s.created_at).toISOString().slice(0,10)}","${s.from_name} paid ${s.to_name}",${(Number(s.amount)/100).toFixed(2)},"via ${s.method}"`
    ));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="squad-statement.csv"');
    res.send(lines.join('\n'));
  } catch (err) { next(err); }
}

export async function deleteExpense(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const exp = (await client.query(`SELECT * FROM expenses WHERE id=$1 AND is_deleted=FALSE`, [id])).rows[0];
    if (!exp) throw new ApiError(404, 'Expense not found');
    const me = (await client.query(
      `SELECT role FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`,
      [exp.squad_id, req.user.id])).rows[0];
    if (!me) throw new ApiError(403, 'Not a member of this squad');
    if (me.role !== 'admin' && exp.created_by !== req.user.id)
      throw new ApiError(403, 'Only admins or the creator can delete this expense');

    await client.query('BEGIN');
    await client.query(`UPDATE expenses SET is_deleted=TRUE, updated_at=now() WHERE id=$1`, [id]);

    // Refund the treasury if this expense had spent from it — otherwise the
    // balance stays debited forever with nothing to show for it.
    const treasuryAmt = Number(exp.treasury_amount || 0);
    if (treasuryAmt > 0) {
      await client.query(`UPDATE treasury SET balance=balance+$1, updated_at=now() WHERE squad_id=$2`, [treasuryAmt, exp.squad_id]);
      await client.query(
        `INSERT INTO treasury_transactions (squad_id,type,amount,description,expense_id,user_id) VALUES ($1,'reversal',$2,$3,$4,$5)`,
        [exp.squad_id, treasuryAmt, `"${exp.title}" delete hone se treasury ko ₹${(treasuryAmt/100).toFixed(0)} wapas mila 🔄`, exp.id, req.user.id]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
}
