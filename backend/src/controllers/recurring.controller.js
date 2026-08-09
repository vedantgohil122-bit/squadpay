import { query, pool } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { computeShares } from '../services/split.service.js';
import { awardXp, XP } from '../services/xp.service.js';
import { createNotificationForSquad } from './notification.controller.js';

async function assertMember(squadId, userId) {
  const { rows } = await query(
    `SELECT 1 FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`, [squadId, userId]);
  if (!rows.length) throw new ApiError(403, 'You are not a member of this squad');
}

// Given a day-of-month and "today", returns the next date that day falls on
// — this month if it hasn't passed yet, otherwise next month.
function nextRunDate(dayOfMonth, from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), dayOfMonth));
  if (d <= from) d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export async function createRecurring(req, res, next) {
  try {
    const { squadId, title, amount, category, paidBy, dayOfMonth } = req.body || {};
    if (!squadId || !title?.trim() || !amount || !paidBy || !dayOfMonth) throw new ApiError(400, 'Missing fields');
    const day = Math.min(28, Math.max(1, parseInt(dayOfMonth, 10)));
    await assertMember(squadId, req.user.id);

    const { rows } = await query(
      `INSERT INTO recurring_expenses (squad_id, title, amount, category, paid_by, day_of_month, next_run_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [squadId, title.trim().slice(0, 80), Math.round(amount), category || 'other', paidBy, day, nextRunDate(day), req.user.id]
    );
    res.status(201).json({ success: true, recurring: rows[0] });
  } catch (err) { next(err); }
}

export async function listRecurring(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);
    const { rows } = await query(
      `SELECT r.*, u.name AS paid_by_name FROM recurring_expenses r
       JOIN users u ON u.id = r.paid_by WHERE r.squad_id=$1 ORDER BY r.created_at DESC`,
      [squadId]
    );
    res.json({ success: true, recurring: rows });
  } catch (err) { next(err); }
}

export async function toggleRecurring(req, res, next) {
  try {
    const { id } = req.params;
    const r = (await query(`SELECT * FROM recurring_expenses WHERE id=$1`, [id])).rows[0];
    if (!r) throw new ApiError(404, 'Not found');
    await assertMember(r.squad_id, req.user.id);
    await query(`UPDATE recurring_expenses SET active = NOT active WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function deleteRecurring(req, res, next) {
  try {
    const { id } = req.params;
    const r = (await query(`SELECT * FROM recurring_expenses WHERE id=$1`, [id])).rows[0];
    if (!r) throw new ApiError(404, 'Not found');
    await assertMember(r.squad_id, req.user.id);
    await query(`DELETE FROM recurring_expenses WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// Called at the top of the expenses list fetch (see expense.controller.js
// listExpenses) — checks this squad's active recurring items and, for any
// whose next_run_date has arrived, creates the real expense (equal split
// across all currently-active members) and advances the schedule by one
// month. No background cron: Render's free tier can't reliably run one, so
// due items surface the next time someone actually opens the squad instead.
export async function runDueRecurring(squadId) {
  const due = (await query(
    `SELECT * FROM recurring_expenses WHERE squad_id=$1 AND active=TRUE AND next_run_date <= CURRENT_DATE`,
    [squadId]
  )).rows;
  if (!due.length) return;

  const members = (await query(
    `SELECT user_id FROM squad_members WHERE squad_id=$1 AND status='active'`, [squadId]
  )).rows;
  if (!members.length) return;

  const client = await pool.connect();
  try {
    for (const r of due) {
      const shares = computeShares(Number(r.amount), 'equal', members.map((m) => ({ userId: m.user_id })));
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO expenses (squad_id, title, amount, category, paid_by, split_type, created_by)
         VALUES ($1,$2,$3,$4,$5,'equal',$6) RETURNING id`,
        [squadId, r.title, r.amount, r.category, r.paid_by, r.created_by]
      );
      for (const s of shares) {
        await client.query(
          `INSERT INTO expense_participants (expense_id, user_id, share_amount, share_value) VALUES ($1,$2,$3,$4)`,
          [rows[0].id, s.userId, s.shareAmount, s.shareValue ?? null]
        );
      }
      // Advance to next month, capped at the same day-of-month rule as creation.
      await client.query(
        `UPDATE recurring_expenses SET next_run_date=$1 WHERE id=$2`,
        [nextRunDate(r.day_of_month, new Date(r.next_run_date)), r.id]
      );
      await client.query('COMMIT');

      awardXp(squadId, r.created_by, 'expense.created', XP.EXPENSE_ADDED, { title: r.title, amount: r.amount }).catch(() => {});
      createNotificationForSquad({
        squadId, excludeUserId: null, type: 'expense_added',
        message: `🔁 "${r.title}" auto-added — ₹${(Number(r.amount)/100).toFixed(0)}`,
        metadata: { expenseId: rows[0].id, amount: r.amount },
      });
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Recurring expense generation failed:', err.message);
  } finally {
    client.release();
  }
}
