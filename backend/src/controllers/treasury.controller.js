// ============================================================
// SQUAD TREASURY CONTROLLER
// The engine that handles contributions, treasury spending,
// and smart settlement integration (credits reduce what you owe)
// ============================================================
import { query, pool } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { awardXp } from '../services/xp.service.js';

const fmt = (p) => (p / 100).toFixed(2);

async function assertMember(squadId, userId) {
  const m = await query(`SELECT role FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`,[squadId,userId]);
  if (!m.rows.length) throw new ApiError(403,'Not a member of this squad');
  return m.rows[0].role;
}

async function ensureTreasury(squadId, client) {
  const q = client || pool;
  await q.query(`INSERT INTO treasury (squad_id) VALUES ($1) ON CONFLICT (squad_id) DO NOTHING`,[squadId]);
  const { rows } = await q.query(`SELECT * FROM treasury WHERE squad_id=$1`,[squadId]);
  return rows[0];
}

// ── GET TREASURY DASHBOARD ──────────────────────────────────
export async function getTreasury(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);
    const treasury = await ensureTreasury(squadId);

    // Total contributed
    const totals = (await query(`SELECT COALESCE(SUM(amount),0)::bigint AS total_deposited FROM contributions WHERE squad_id=$1`,[squadId])).rows[0];
    const totalUsed = Number(totals.total_deposited) - Number(treasury.balance);

    // Per-member wallet stats
    const wallets = (await query(`
      SELECT u.id, COALESCE(sm.nickname,u.name) AS name, u.avatar_url,
        COALESCE(SUM(c.amount),0)::bigint AS contributed
      FROM squad_members sm
      JOIN users u ON u.id=sm.user_id
      LEFT JOIN contributions c ON c.user_id=sm.user_id AND c.squad_id=sm.squad_id
      WHERE sm.squad_id=$1 AND sm.status='active'
      GROUP BY u.id,u.name,u.avatar_url,sm.nickname
      ORDER BY contributed DESC
    `,[squadId])).rows;

    // Recent transactions
    const history = (await query(`
      SELECT tt.*, u.name AS user_name
      FROM treasury_transactions tt
      LEFT JOIN users u ON u.id=tt.user_id
      WHERE tt.squad_id=$1 ORDER BY tt.created_at DESC LIMIT 20
    `,[squadId])).rows;

    res.json({ success:true, treasury:{
      balance: Number(treasury.balance),
      totalDeposited: Number(totals.total_deposited),
      totalUsed,
      updatedAt: treasury.updated_at,
    }, wallets, history });
  } catch(err) { next(err); }
}

// ── ADD CONTRIBUTION ────────────────────────────────────────
export async function addContribution(req, res, next) {
  const client = await pool.connect();
  try {
    const { squadId, amount, note } = req.body || {};
    const amt = Math.round(Number(amount));
    if (!squadId || !amt || amt <= 0) throw new ApiError(400,'squadId and a positive amount required');
    await assertMember(squadId, req.user.id);

    await client.query('BEGIN');
    await ensureTreasury(squadId, client);

    // Record contribution
    const { rows } = await client.query(
      `INSERT INTO contributions (squad_id,user_id,amount,note) VALUES ($1,$2,$3,$4) RETURNING *`,
      [squadId, req.user.id, amt, note||'']
    );
    // Credit treasury
    await client.query(
      `UPDATE treasury SET balance=balance+$1, updated_at=now() WHERE squad_id=$2`,
      [amt, squadId]
    );
    // Log transaction
    await client.query(
      `INSERT INTO treasury_transactions (squad_id,type,amount,description,user_id) VALUES ($1,'deposit',$2,$3,$4)`,
      [squadId, amt, `${req.user.name} ne ₹${fmt(amt)} contribute kiya 💸`, req.user.id]
    );
    await client.query('COMMIT');

    await awardXp(squadId, req.user.id, 'treasury.contributed', 30, { amount: amt });
    res.status(201).json({ success:true, contribution: rows[0] });
  } catch(err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
}

// ── GET MEMBER WALLET ────────────────────────────────────────
export async function getMemberWallet(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);
    const { rows } = await query(`
      SELECT COALESCE(SUM(amount),0)::bigint AS total_contributed
      FROM contributions WHERE squad_id=$1 AND user_id=$2
    `,[squadId, req.user.id]);
    const history = (await query(`
      SELECT c.amount, c.note, c.created_at
      FROM contributions c WHERE c.squad_id=$1 AND c.user_id=$2
      ORDER BY c.created_at DESC
    `,[squadId, req.user.id])).rows;
    res.json({ success:true, wallet:{ totalContributed: Number(rows[0].total_contributed), history }});
  } catch(err) { next(err); }
}

// ── TREASURY ANALYTICS ───────────────────────────────────────
export async function getTreasuryAnalytics(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);

    const treasury = await ensureTreasury(squadId);
    const topContributor = (await query(`
      SELECT u.name, COALESCE(SUM(c.amount),0)::bigint AS total
      FROM contributions c JOIN users u ON u.id=c.user_id
      WHERE c.squad_id=$1 GROUP BY u.name ORDER BY total DESC LIMIT 1
    `,[squadId])).rows[0];

    const expensesFromTreasury = (await query(`
      SELECT COALESCE(SUM(treasury_amount),0)::bigint AS total FROM expenses
      WHERE squad_id=$1 AND is_deleted=FALSE AND treasury_amount>0
    `,[squadId])).rows[0];

    const memberBreakdown = (await query(`
      SELECT u.name, COALESCE(SUM(c.amount),0)::bigint AS contributed
      FROM squad_members sm JOIN users u ON u.id=sm.user_id
      LEFT JOIN contributions c ON c.user_id=sm.user_id AND c.squad_id=$1
      WHERE sm.squad_id=$1 AND sm.status='active'
      GROUP BY u.name ORDER BY contributed DESC
    `,[squadId])).rows;

    res.json({ success:true, analytics:{
      currentBalance: Number(treasury.balance),
      topContributor: topContributor ? { name: topContributor.name, amount: Number(topContributor.total) } : null,
      totalSpentFromTreasury: Number(expensesFromTreasury.total),
      memberBreakdown,
    }});
  } catch(err) { next(err); }
}
