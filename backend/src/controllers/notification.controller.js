import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';

async function assertMember(squadId, userId) {
  if (!squadId) return;
  const m = await query(`SELECT 1 FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`, [squadId, userId]);
  if (!m.rows.length) throw new ApiError(403, 'Not a member of this squad');
}

export async function createNotification({ userId, squadId, type, message, metadata = {} }) {
  try {
    // Ensure metadata column exists (migration safety)
    await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`);
    await query(
      `INSERT INTO notifications (user_id, squad_id, type, message, metadata) VALUES ($1,$2,$3,$4,$5)`,
      [userId, squadId || null, type, message, JSON.stringify(metadata)]
    );
  } catch (err) {
    // Fallback if metadata column still missing
    try {
      await query(
        `INSERT INTO notifications (user_id, squad_id, type, message) VALUES ($1,$2,$3,$4)`,
        [userId, squadId || null, type, message]
      );
    } catch (e) {
      console.error('Notification create failed', e.message);
    }
  }
}

export async function createNotificationForSquad({ squadId, excludeUserId, type, message, metadata = {} }) {
  try {
    const members = (await query(
      `SELECT user_id FROM squad_members WHERE squad_id=$1 AND status='active' AND user_id <> $2`,
      [squadId, excludeUserId || '00000000-0000-0000-0000-000000000000']
    )).rows;
    for (const m of members) {
      await createNotification({ userId: m.user_id, squadId, type, message, metadata });
    }
  } catch (err) {
    console.error('Bulk notification failed', err.message);
  }
}

export async function listNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const { squadId, unreadOnly } = req.query;
    let where = `WHERE n.user_id = $1`;
    const params = [userId];
    let idx = 2;
    if (squadId) {
      where += ` AND n.squad_id = $${idx++}`;
      params.push(squadId);
    }
    if (unreadOnly === 'true') {
      where += ` AND n.is_read = FALSE`;
    }
    const { rows } = await query(
      `SELECT n.*, s.name AS squad_name, s.emoji AS squad_emoji
       FROM notifications n
       LEFT JOIN squads s ON s.id = n.squad_id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT 50`,
      params
    );
    const unreadCount = (
      await query(`SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND is_read=FALSE`, [userId])
    ).rows[0].c;

    res.json({ success: true, notifications: rows, unreadCount });
  } catch (err) { next(err); }
}

export async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2 RETURNING *`,
      [id, req.user.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Notification not found');
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function markAllRead(req, res, next) {
  try {
    const { squadId } = req.body || {};
    if (squadId) {
      await query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND squad_id=$2 AND is_read=FALSE`, [req.user.id, squadId]);
    } else {
      await query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND is_read=FALSE`, [req.user.id]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    await query(`DELETE FROM notifications WHERE id=$1 AND user_id=$2`, [id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}
