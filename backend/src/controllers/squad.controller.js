import crypto from 'crypto';
import { query, pool } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { getBalances, simplifyDebts } from '../services/balance.service.js';
import { awardXp, XP } from '../services/xp.service.js';

const inviteCode = () => crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g. 9F3A1C2B

export async function createSquad(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, emoji } = req.body || {};
    if (!name?.trim()) throw new ApiError(400, 'Squad name required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO squads (name, emoji, invite_code, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name.trim(), emoji || '🎉', inviteCode(), req.user.id]
    );
    await client.query(
      `INSERT INTO squad_members (squad_id, user_id, role) VALUES ($1,$2,'admin')`,
      [rows[0].id, req.user.id]
    );
    await client.query('COMMIT');
    await awardXp(rows[0].id, req.user.id, 'squad.created', XP.SQUAD_CREATED, { name });
    res.status(201).json({ success: true, squad: rows[0] });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
}

export async function joinSquad(req, res, next) {
  try {
    const { code } = req.body || {};
    if (!code?.trim()) throw new ApiError(400, 'Invite code required');
    const { rows } = await query(`SELECT * FROM squads WHERE invite_code = $1`, [code.trim().toUpperCase()]);
    if (!rows[0]) throw new ApiError(404, 'No squad found with that invite code');
    await query(
      `INSERT INTO squad_members (squad_id, user_id) VALUES ($1,$2)
       ON CONFLICT (squad_id, user_id) DO UPDATE SET status = 'active'`,
      [rows[0].id, req.user.id]
    );
    await awardXp(rows[0].id, req.user.id, 'member.joined', XP.MEMBER_JOINED, {});
    res.json({ success: true, squad: rows[0] });
  } catch (err) { next(err); }
}

export async function mySquads(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT s.*, (SELECT COUNT(*) FROM squad_members m WHERE m.squad_id = s.id AND m.status='active') AS member_count,
              (SELECT COALESCE(SUM(amount),0) FROM expenses e WHERE e.squad_id = s.id AND e.is_deleted = FALSE) AS total_spend
       FROM squads s
       JOIN squad_members sm ON sm.squad_id = s.id
       WHERE sm.user_id = $1 AND sm.status = 'active'
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, squads: rows });
  } catch (err) { next(err); }
}

export async function squadDetail(req, res, next) {
  try {
    const { id } = req.params;
    const member = await query(
      `SELECT 1 FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`, [id, req.user.id]);
    if (!member.rows.length) throw new ApiError(403, 'You are not a member of this squad');

    const squad = (await query(`SELECT * FROM squads WHERE id=$1`, [id])).rows[0];
    const members = (await query(
      `SELECT u.id, COALESCE(sm.nickname, u.name) AS name, u.avatar_url, u.upi_id, sm.role, sm.xp,
              (SELECT l.title FROM levels l WHERE l.xp_required <= sm.xp ORDER BY l.xp_required DESC LIMIT 1) AS level_title,
              (SELECT l.level FROM levels l WHERE l.xp_required <= sm.xp ORDER BY l.xp_required DESC LIMIT 1) AS level
       FROM squad_members sm JOIN users u ON u.id = sm.user_id
       WHERE sm.squad_id=$1 AND sm.status='active' ORDER BY sm.xp DESC`, [id])).rows;

    const balances = await getBalances(id);
    const suggestions = simplifyDebts(balances);

    const pendingSettlements = (await query(
      `SELECT s.id, s.from_user, s.to_user, s.amount, s.method, s.created_at, fu.name AS from_name, tu.name AS to_name
       FROM settlements s JOIN users fu ON fu.id = s.from_user JOIN users tu ON tu.id = s.to_user
       WHERE s.squad_id=$1 AND s.status='pending' ORDER BY s.created_at DESC`, [id])).rows;

    const activity = (await query(
      `SELECT a.action, a.metadata, a.created_at, u.name
       FROM activity_log a JOIN users u ON u.id = a.user_id
       WHERE a.squad_id=$1 ORDER BY a.created_at DESC LIMIT 15`, [id])).rows;

    res.json({ success: true, squad, members, balances, suggestions, pendingSettlements, activity });
  } catch (err) { next(err); }
}


// Full member profile for the tap-on-avatar bottom sheet
export async function memberProfile(req, res, next) {
  try {
    const { id: squadId, userId } = req.params;
    const callerId = req.user.id;

    // Step 1: verify the CALLER is a member
    const callerCheck = await query(
      `SELECT role FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`,
      [squadId, callerId]
    );

    if (!callerCheck.rows.length) {
      return res.status(403).json({
        success: false,
        error: 'Not a member of this squad',
        debug: { squadId, callerId, userId }
      });
    }

    // Step 2: get the target member's full profile
    const { rows } = await query(`
      SELECT
        u.id, COALESCE(sm.nickname, u.name) AS name,
        u.avatar_url, u.bio, u.upi_id,
        sm.role, sm.xp, sm.joined_at,
        (SELECT l.title FROM levels l WHERE l.xp_required <= sm.xp ORDER BY l.xp_required DESC LIMIT 1) AS level_title,
        (SELECT l.level FROM levels l WHERE l.xp_required <= sm.xp ORDER BY l.xp_required DESC LIMIT 1) AS level,
        (SELECT l.xp_required FROM levels l WHERE l.xp_required > sm.xp ORDER BY l.xp_required ASC LIMIT 1) AS next_xp,
        COALESCE((
          SELECT SUM(e.amount) FROM expenses e
          WHERE e.squad_id = $1 AND e.paid_by = u.id AND e.is_deleted = FALSE
        ), 0)::bigint AS total_paid,
        COALESCE((
          SELECT SUM(ep.share_amount) FROM expense_participants ep
          JOIN expenses e ON e.id = ep.expense_id
          WHERE e.squad_id = $1 AND ep.user_id = u.id AND e.is_deleted = FALSE
        ), 0)::bigint AS total_share
      FROM squad_members sm
      JOIN users u ON u.id = sm.user_id
      WHERE sm.squad_id = $1 AND sm.user_id = $2 AND sm.status = 'active'
    `, [squadId, userId]);

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Member not found in this squad' });
    }

    const m = rows[0];

    // Step 3: settlement stats
    const sett = (await query(`
      SELECT
        COALESCE(SUM(CASE WHEN from_user = $2 THEN amount ELSE 0 END), 0)::bigint AS sent,
        COALESCE(SUM(CASE WHEN to_user = $2 THEN amount ELSE 0 END), 0)::bigint AS received
      FROM settlements
      WHERE squad_id = $1 AND status = 'completed'
    `, [squadId, userId])).rows[0];

    const net = Number(m.total_paid) - Number(m.total_share)
      + Number(sett.sent) - Number(sett.received);

    // Step 4: achievements
    const achievements = (await query(`
      SELECT a.name, a.emoji, ua.unlocked_at
      FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = $1 AND ua.squad_id = $2
      ORDER BY ua.unlocked_at DESC
    `, [userId, squadId])).rows;

    const expenseCount = Number((await query(
      `SELECT COUNT(*)::int AS n FROM expenses WHERE squad_id=$1 AND paid_by=$2 AND is_deleted=FALSE`,
      [squadId, userId]
    )).rows[0].n);

    res.json({
      success: true,
      member: {
        id: m.id,
        name: m.name,
        avatarUrl: m.avatar_url,
        bio: m.bio,
        upiId: m.upi_id,
        role: m.role,
        level: m.level || 1,
        levelTitle: m.level_title || 'Chai Sponsor',
        xp: m.xp || 0,
        nextXp: Number(m.next_xp) || 500,
        joinedAt: m.joined_at,
        totalPaid: Number(m.total_paid),
        totalShare: Number(m.total_share),
        net,
        expenseCount,
        achievements,
      }
    });
  } catch (err) { next(err); }
}


// Admin sets/updates member's UPI ID (only admin can set; all can view)
export async function setMemberUpi(req, res, next) {
  try {
    const { squadId, userId } = req.params;
    const { upiId } = req.body || {};
    // only the squad admin OR the user themselves can set it
    const me = (await query(`SELECT role FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`,[squadId, req.user.id])).rows[0];
    if (!me) throw new ApiError(403, 'Not a member');
    if (me.role !== 'admin' && req.user.id !== userId) throw new ApiError(403, 'Sirf admin ya khud apna UPI set kar sakta hai');
    if (upiId && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) throw new ApiError(400, 'UPI ID galat lag rahi hai');
    await query(`UPDATE users SET upi_id=$1 WHERE id=$2`, [upiId || null, userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
}
