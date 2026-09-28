import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';

export async function addPersonalExpense(req, res, next) {
  try {
    const { title, amount, category = 'other', note, expenseDate } = req.body || {};
    if (!title || !amount) throw new ApiError(400, 'title and amount required');
    if (Number(amount) <= 0) throw new ApiError(400, 'Amount must be greater than 0');
    const { rows } = await query(
      `INSERT INTO personal_expenses (user_id, title, amount, category, note, expense_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, title.trim(), Math.round(Number(amount)), category, note || null, expenseDate || new Date().toISOString().split('T')[0]]
    );
    res.status(201).json({ success: true, expense: rows[0] });
  } catch (err) { next(err); }
}

export async function listPersonalExpenses(req, res, next) {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const month = req.query.month;
    let whereClause = `WHERE user_id = $1`;
    const params = [req.user.id];
    if (month) { params.push(month); whereClause += ` AND to_char(expense_date,'YYYY-MM') = $${params.length}`; }
    const { rows } = await query(
      `SELECT * FROM personal_expenses ${whereClause} ORDER BY expense_date DESC, created_at DESC LIMIT ${limit} OFFSET ${(page-1)*limit}`,
      params
    );
    const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM personal_expenses ${whereClause}`, params);
    res.json({ success: true, expenses: rows, pagination: { page, limit, total: countRows[0].total, hasMore: (page-1)*limit + rows.length < countRows[0].total } });
  } catch (err) { next(err); }
}

export async function deletePersonalExpense(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await query(`DELETE FROM personal_expenses WHERE id=$1 AND user_id=$2 RETURNING id`, [id, req.user.id]);
    if (!rows[0]) throw new ApiError(404, 'Expense not found');
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function personalAnalytics(req, res, next) {
  try {
    const userId = req.user.id;
    const { rows: thisMonth } = await query(
      `SELECT COALESCE(SUM(amount),0)::bigint AS total, COUNT(*)::int AS count FROM personal_expenses
       WHERE user_id=$1 AND to_char(expense_date,'YYYY-MM')=to_char(CURRENT_DATE,'YYYY-MM')`, [userId]);
    const { rows: cats } = await query(
      `SELECT category, SUM(amount)::bigint AS total, COUNT(*)::int AS count FROM personal_expenses
       WHERE user_id=$1 GROUP BY category ORDER BY total DESC`, [userId]);
    const { rows: monthly } = await query(
      `SELECT to_char(expense_date,'YYYY-MM') AS month, SUM(amount)::bigint AS total
       FROM personal_expenses WHERE user_id=$1 AND expense_date >= CURRENT_DATE - INTERVAL '6 months'
       GROUP BY month ORDER BY month ASC`, [userId]);
    const { rows: squadPaid } = await query(
      `SELECT COALESCE(SUM(e.amount),0)::bigint AS total_paid, COUNT(*)::int AS expense_count
       FROM expenses e JOIN squad_members sm ON sm.squad_id = e.squad_id AND sm.user_id = $1
       WHERE e.paid_by = $1 AND e.is_deleted = FALSE`, [userId]);
    const { rows: squadOwed } = await query(
      `SELECT COALESCE(SUM(ep.share_amount),0)::bigint AS total_owed
       FROM expense_participants ep JOIN expenses e ON e.id = ep.expense_id
       WHERE ep.user_id = $1 AND e.is_deleted = FALSE AND e.paid_by != $1`, [userId]);
    const { rows: squadBreakdown } = await query(
      `SELECT s.name AS squad_name, s.emoji,
         COALESCE(SUM(CASE WHEN e.paid_by=$1 THEN e.amount ELSE 0 END),0)::bigint AS paid,
         COALESCE(SUM(ep.share_amount),0)::bigint AS owed
       FROM squad_members sm JOIN squads s ON s.id = sm.squad_id
       LEFT JOIN expenses e ON e.squad_id = s.id AND e.is_deleted=FALSE
       LEFT JOIN expense_participants ep ON ep.expense_id=e.id AND ep.user_id=$1
       WHERE sm.user_id=$1 AND sm.status='active'
       GROUP BY s.id, s.name, s.emoji ORDER BY paid DESC`, [userId]);
    const { rows: budget } = await query(`SELECT * FROM personal_budget WHERE user_id=$1`, [userId]);
    res.json({ success: true, thisMonth: thisMonth[0], categories: cats, monthly, crossSquad: { totalPaid: squadPaid[0].total_paid, expenseCount: squadPaid[0].expense_count, totalOwed: squadOwed[0].total_owed, breakdown: squadBreakdown }, budget: budget[0] || null });
  } catch (err) { next(err); }
}

export async function setBudget(req, res, next) {
  try {
    const { monthlyLimit, savingsGoal, savingsSaved } = req.body || {};
    const { rows } = await query(
      `INSERT INTO personal_budget (user_id, monthly_limit, savings_goal, savings_saved, updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id) DO UPDATE SET
         monthly_limit = COALESCE($2, personal_budget.monthly_limit),
         savings_goal  = COALESCE($3, personal_budget.savings_goal),
         savings_saved = COALESCE($4, personal_budget.savings_saved),
         updated_at    = now()
       RETURNING *`,
      [req.user.id, monthlyLimit || null, savingsGoal || null, savingsSaved || null]
    );
    res.json({ success: true, budget: rows[0] });
  } catch (err) { next(err); }
}

export async function exportPersonalExpenses(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT title, amount, category, note, expense_date FROM personal_expenses WHERE user_id=$1 ORDER BY expense_date DESC`,
      [req.user.id]
    );
    const header = 'Title,Amount (Rs),Category,Note,Date';
    const csv = [header, ...rows.map(r => `"${r.title}",${(Number(r.amount)/100).toFixed(2)},"${r.category}","${r.note||''}","${r.expense_date}"`)].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="personal-expenses.csv"');
    res.send(csv);
  } catch (err) { next(err); }
}
