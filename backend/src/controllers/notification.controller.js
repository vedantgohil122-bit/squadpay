import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { sendPushToUser, isPushEnabled, getVapidPublicKey } from '../services/push.service.js';

const TYPE_EMOJI = {
  expense_added: '🧾',
  expense_edited: '✏️',
  settlement_pending: '💸',
  settlement_completed: '✅',
  settlement_reminder: '🔔',
  member_joined: '👋',
  member_left: '👋',
  squad_deleted: '🗑️',
  treasury_contribution: '🏦',
  memory_uploaded: '📸',
  achievement: '🏆',
  default: '🔔',
};

// Creates one notification row + fires a real push if the user has a
// subscribed device. Called from other controllers (expense, settlement,
// squad, treasury) whenever something notification-worthy happens.
export async function createNotification({ userId, squadId, type, message, metadata = {} }) {
  try {
    const { rows } = await query(
      `INSERT INTO notifications (user_id, squad_id, type, message, metadata) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, squadId || null, type, message, JSON.stringify(metadata)]
    );
    sendPushToUser(userId, {
      title: `${TYPE_EMOJI[type] || TYPE_EMOJI.default} SquadPay`,
      body: message,
      url: squadId ? `/app/squad/${squadId}` : '/app',
      notificationId: rows[0]?.id,
    }).catch(() => {}); // never let a push failure break the request that triggered it
  } catch (err) {
    console.error('Notification create failed:', err.message);
  }
}

// Same, but fans out to every active member of a squad except the one
// who caused the event (no need to notify yourself that you added an expense).
export async function createNotificationForSquad({ squadId, excludeUserId, type, message, metadata = {} }) {
  try {
    const members = (await query(
      `SELECT user_id FROM squad_members WHERE squad_id=$1 AND status='active' AND user_id <> $2`,
      [squadId, excludeUserId || '00000000-0000-0000-0000-000000000000']
    )).rows;
    await Promise.all(members.map((m) => createNotification({ userId: m.user_id, squadId, type, message, metadata })));
  } catch (err) {
    console.error('Bulk notification failed:', err.message);
  }
}

export async function listNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const { squadId, unreadOnly } = req.query;
    let where = `WHERE n.user_id = $1`;
    const params = [userId];
    let idx = 2;
    if (squadId) { where += ` AND n.squad_id = $${idx++}`; params.push(squadId); }
    if (unreadOnly === 'true') where += ` AND n.is_read = FALSE`;

    const { rows } = await query(
      `SELECT n.*, s.name AS squad_name, s.emoji AS squad_emoji
       FROM notifications n LEFT JOIN squads s ON s.id = n.squad_id
       ${where} ORDER BY n.created_at DESC LIMIT 50`,
      params
    );
    const unreadCount = (await query(
      `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND is_read=FALSE`, [userId]
    )).rows[0].c;

    res.json({ success: true, notifications: rows, unreadCount });
  } catch (err) { next(err); }
}

export async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2 RETURNING id`,
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
    await query(`DELETE FROM notifications WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ---------------- PUSH SUBSCRIPTION MANAGEMENT ----------------

export async function getVapidKey(req, res) {
  res.json({ success: true, publicKey: getVapidPublicKey(), enabled: isPushEnabled() });
}

export async function subscribe(req, res, next) {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) throw new ApiError(400, 'Invalid subscription');
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth=$4`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function unsubscribe(req, res, next) {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) await query(`DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2`, [endpoint, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}
