// ============================================================
// TRIP MODE CONTROLLER
// Groups expenses + memories under a named trip/event
// ============================================================
import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';

async function assertMember(squadId, userId) {
  const m = await query(`SELECT role FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`,[squadId,userId]);
  if (!m.rows.length) throw new ApiError(403,'Not a member of this squad');
}

// ── LIST TRIPS FOR A SQUAD ──────────────────────────────────
export async function listTrips(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);

    const { rows } = await query(`
      SELECT t.*,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.trip_id=t.id AND e.is_deleted=FALSE), 0)::bigint AS total_spend,
        COALESCE((SELECT COUNT(*)::int FROM expenses e WHERE e.trip_id=t.id AND e.is_deleted=FALSE), 0) AS expense_count,
        COALESCE((SELECT COUNT(*)::int FROM photos p WHERE p.trip_id=t.id), 0) AS photo_count
      FROM trips t WHERE t.squad_id=$1 ORDER BY t.created_at DESC
    `,[squadId]);

    res.json({ success:true, trips: rows });
  } catch(err) { next(err); }
}

// ── CREATE TRIP ──────────────────────────────────────────────
export async function createTrip(req, res, next) {
  try {
    const { squadId, name, emoji, startDate, endDate, budget } = req.body || {};
    if (!squadId || !name?.trim()) throw new ApiError(400,'squadId and name required');
    await assertMember(squadId, req.user.id);

    const { rows } = await query(`
      INSERT INTO trips (squad_id, name, emoji, start_date, end_date, budget, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `,[squadId, name.trim(), emoji||'🧳', startDate||null, endDate||null, budget||null, req.user.id]);

    await query(
      `INSERT INTO activity_log (squad_id,user_id,action,metadata) VALUES ($1,$2,'trip.created',$3)`,
      [squadId, req.user.id, JSON.stringify({ name: rows[0].name, emoji: rows[0].emoji })]
    );

    res.status(201).json({ success:true, trip: rows[0] });
  } catch(err) { next(err); }
}

// ── TRIP DETAIL (expenses + balances scoped to this trip) ──────
export async function tripDetail(req, res, next) {
  try {
    const { tripId } = req.params;
    const trip = (await query(`SELECT * FROM trips WHERE id=$1`,[tripId])).rows[0];
    if (!trip) throw new ApiError(404,'Trip not found');
    await assertMember(trip.squad_id, req.user.id);

    const expenses = (await query(`
      SELECT e.*, u.name AS paid_by_name,
        COALESCE((
          SELECT json_agg(json_build_object('userId',ep.user_id,'name',u2.name,'shareAmount',ep.share_amount))
          FROM expense_participants ep JOIN users u2 ON u2.id=ep.user_id
          WHERE ep.expense_id=e.id
        ), '[]') AS participants
      FROM expenses e JOIN users u ON u.id=e.paid_by
      WHERE e.trip_id=$1 AND e.is_deleted=FALSE
      ORDER BY e.expense_date DESC, e.created_at DESC
    `,[tripId])).rows;

    const photos = (await query(`
      SELECT p.id, p.url, p.caption, p.created_at, u.name AS uploader_name, u.avatar_url AS uploader_avatar
      FROM photos p JOIN users u ON u.id=p.uploaded_by
      WHERE p.trip_id=$1 ORDER BY p.created_at DESC
    `,[tripId])).rows;

    // Trip-scoped balances — only expenses tagged to this trip
    const members = (await query(`
      SELECT u.id, u.name, u.avatar_url
      FROM squad_members sm JOIN users u ON u.id=sm.user_id
      WHERE sm.squad_id=$1 AND sm.status='active'
    `,[trip.squad_id])).rows;

    const balances = members.map(m => {
      const paid = expenses.filter(e => e.paid_by===m.id).reduce((s,e) => s+Number(e.amount),0);
      const share = expenses.reduce((s,e) => {
        const p = (typeof e.participants==='string'?JSON.parse(e.participants):e.participants).find(p=>p.userId===m.id);
        return s + (p ? Number(p.shareAmount) : 0);
      },0);
      return { userId:m.id, name:m.name, avatarUrl:m.avatar_url, totalPaid:paid, totalShare:share, net:paid-share };
    });

    const totalSpend = expenses.reduce((s,e) => s+Number(e.amount),0);
    const budgetUsedPct = trip.budget ? Math.round((totalSpend/Number(trip.budget))*100) : null;

    // ── MINI-LEADERBOARD (trip-scoped, not squad-wide) ──────
    const biggestSpender = [...balances].sort((a,b) => b.totalPaid - a.totalPaid)[0];
    const mostExpenses = members
      .map(m => ({ ...m, count: expenses.filter(e => e.paid_by === m.id).length }))
      .sort((a,b) => b.count - a.count)[0];
    const photoCounts = {};
    photos.forEach(p => { photoCounts[p.uploader_name] = (photoCounts[p.uploader_name]||0) + 1; });
    const topPhotographerName = Object.entries(photoCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
    const topPhotographer = topPhotographerName
      ? members.find(m => m.name === topPhotographerName)
      : null;

    const leaderboard = {
      biggestSpender: biggestSpender && biggestSpender.totalPaid > 0
        ? { userId: biggestSpender.userId, name: biggestSpender.name, avatarUrl: biggestSpender.avatarUrl, amount: biggestSpender.totalPaid }
        : null,
      mostActive: mostExpenses && mostExpenses.count > 0
        ? { userId: mostExpenses.id, name: mostExpenses.name, avatarUrl: mostExpenses.avatar_url, count: mostExpenses.count }
        : null,
      topPhotographer: topPhotographer
        ? { userId: topPhotographer.id, name: topPhotographer.name, avatarUrl: topPhotographer.avatar_url, count: photoCounts[topPhotographerName] }
        : null,
    };

    res.json({ success:true, trip:{
      ...trip, totalSpend, budgetUsedPct,
    }, expenses, photos, balances, leaderboard });
  } catch(err) { next(err); }
}

// ── UPDATE TRIP STATUS (mark completed/archived) ────────────
export async function updateTripStatus(req, res, next) {
  try {
    const { tripId } = req.params;
    const { status } = req.body || {};
    if (!['active','completed','archived'].includes(status)) throw new ApiError(400,'Invalid status');

    const trip = (await query(`SELECT squad_id FROM trips WHERE id=$1`,[tripId])).rows[0];
    if (!trip) throw new ApiError(404,'Trip not found');
    await assertMember(trip.squad_id, req.user.id);

    await query(`UPDATE trips SET status=$1 WHERE id=$2`,[status, tripId]);
    res.json({ success:true });
  } catch(err) { next(err); }
}

// ── DELETE TRIP (un-assigns expenses, doesn't delete them) ──
export async function deleteTrip(req, res, next) {
  try {
    const { tripId } = req.params;
    const trip = (await query(`SELECT squad_id, created_by FROM trips WHERE id=$1`,[tripId])).rows[0];
    if (!trip) throw new ApiError(404,'Trip not found');
    await assertMember(trip.squad_id, req.user.id);

    await query(`UPDATE expenses SET trip_id=NULL WHERE trip_id=$1`,[tripId]);
    await query(`UPDATE photos SET trip_id=NULL WHERE trip_id=$1`,[tripId]);
    await query(`DELETE FROM trips WHERE id=$1`,[tripId]);

    res.json({ success:true });
  } catch(err) { next(err); }
}


// ── REASSIGN EXPENSE TO A TRIP (retroactive tagging) ─────────
// Lets users tag old, already-created expenses into a trip after the fact
export async function reassignExpense(req, res, next) {
  try {
    const { expenseId } = req.params;
    const { tripId } = req.body || {}; // null/empty = un-assign from any trip

    const expense = (await query(`SELECT squad_id FROM expenses WHERE id=$1 AND is_deleted=FALSE`,[expenseId])).rows[0];
    if (!expense) throw new ApiError(404, 'Expense not found');
    await assertMember(expense.squad_id, req.user.id);

    if (tripId) {
      // verify the trip belongs to the same squad
      const trip = (await query(`SELECT squad_id FROM trips WHERE id=$1`,[tripId])).rows[0];
      if (!trip || trip.squad_id !== expense.squad_id) throw new ApiError(400, 'Trip squad se match nahi karti');
    }

    await query(`UPDATE expenses SET trip_id=$1 WHERE id=$2`, [tripId || null, expenseId]);
    res.json({ success: true, tripId: tripId || null });
  } catch (err) { next(err); }
}

// ── LIST UNASSIGNED EXPENSES (for retroactive tagging UI) ────
export async function listUnassignedExpenses(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);

    const { rows } = await query(`
      SELECT e.id, e.title, e.amount, e.category, e.expense_date, u.name AS paid_by_name
      FROM expenses e JOIN users u ON u.id = e.paid_by
      WHERE e.squad_id=$1 AND e.trip_id IS NULL AND e.is_deleted=FALSE
      ORDER BY e.expense_date DESC, e.created_at DESC
    `, [squadId]);

    res.json({ success: true, expenses: rows });
  } catch (err) { next(err); }
}
