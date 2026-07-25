import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { awardXp, unlockAchievement, XP } from '../services/xp.service.js';

// Step 1: the PAYER says "I've paid" -> creates a PENDING settlement.
// Balances do NOT change yet. The receiver must confirm.
export async function createSettlement(req, res, next) {
  try {
    const { squadId, toUser, amount, method, note } = req.body || {};
    const amt = Math.round(Number(amount));
    if (!squadId || !toUser || !amt || amt <= 0) throw new ApiError(400, 'squadId, toUser and a positive amount are required');
    if (toUser === req.user.id) throw new ApiError(400, 'You cannot settle with yourself');
    const METHODS = ['upi','cash','card','netbanking','other'];
    const payMethod = METHODS.includes(method) ? method : 'other';

    for (const uid of [req.user.id, toUser]) {
      const m = await query(`SELECT 1 FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`, [squadId, uid]);
      if (!m.rows.length) throw new ApiError(403, 'Both people must be members of this squad');
    }

    // Don't allow duplicate pending claims for the same pair
    const dup = await query(
      `SELECT 1 FROM settlements WHERE squad_id=$1 AND from_user=$2 AND to_user=$3 AND status='pending'`,
      [squadId, req.user.id, toUser]);
    if (dup.rows.length) throw new ApiError(409, 'You already have a payment waiting for their confirmation');

    const { rows } = await query(
      `INSERT INTO settlements (squad_id, from_user, to_user, amount, method, note, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [squadId, req.user.id, toUser, amt, payMethod, note || '']
    );
    res.status(201).json({ success: true, settlement: rows[0] });
  } catch (err) { next(err); }
}

// Step 2a: the RECEIVER confirms -> money officially moved.
export async function confirmSettlement(req, res, next) {
  try {
    const s = (await query(`SELECT * FROM settlements WHERE id=$1`, [req.params.id])).rows[0];
    if (!s) throw new ApiError(404, 'Settlement not found');
    if (s.status !== 'pending') throw new ApiError(400, 'This settlement is not pending');
    if (s.to_user !== req.user.id) throw new ApiError(403, 'Only the person receiving the money can confirm it');

    const { rows } = await query(
      `UPDATE settlements SET status='completed', settled_at=now() WHERE id=$1 RETURNING *`, [s.id]);

    await awardXp(s.squad_id, s.from_user, 'settlement.completed', XP.SETTLEMENT_DONE, { amount: Number(s.amount) });
    await unlockAchievement(s.squad_id, s.from_user, 'FIRST_SETTLEMENT');
    res.json({ success: true, settlement: rows[0] });
  } catch (err) { next(err); }
}

// Step 2b: the RECEIVER denies -> claim cancelled, debt stays.
export async function denySettlement(req, res, next) {
  try {
    const s = (await query(`SELECT * FROM settlements WHERE id=$1`, [req.params.id])).rows[0];
    if (!s) throw new ApiError(404, 'Settlement not found');
    if (s.status !== 'pending') throw new ApiError(400, 'This settlement is not pending');
    if (s.to_user !== req.user.id) throw new ApiError(403, 'Only the person receiving the money can deny it');

    const { rows } = await query(
      `UPDATE settlements SET status='cancelled' WHERE id=$1 RETURNING *`, [s.id]);
    res.json({ success: true, settlement: rows[0] });
  } catch (err) { next(err); }
}

export async function listSettlements(req, res, next) {
  try {
    const { squadId } = req.params;
    const m = await query(`SELECT 1 FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`, [squadId, req.user.id]);
    if (!m.rows.length) throw new ApiError(403, 'Not a member of this squad');
    const { rows } = await query(
      `SELECT s.*, fu.name AS from_name, tu.name AS to_name
       FROM settlements s JOIN users fu ON fu.id = s.from_user JOIN users tu ON tu.id = s.to_user
       WHERE s.squad_id = $1 ORDER BY s.created_at DESC LIMIT 30`,
      [squadId]
    );
    res.json({ success: true, settlements: rows });
  } catch (err) { next(err); }
}
