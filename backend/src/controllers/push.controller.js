import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';

// Simple in-DB storage for push subscriptions.
// In production you'd use web-push library with VAPID keys, but this
// scaffold stores subscriptions and lets us list them for future push.

export async function saveSubscription(req, res, next) {
  try {
    const { endpoint, keys, expirationTime } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) throw new ApiError(400, 'Invalid push subscription');
    await query(
      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        expiration TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    );
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, expiration)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth=$4, expiration=$5`,
      [req.user.id, endpoint, keys.p256dh, keys.auth, expirationTime ? new Date(expirationTime) : null]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function listSubscriptions(req, res, next) {
  try {
    const { rows } = await query(`SELECT * FROM push_subscriptions WHERE user_id=$1`, [req.user.id]);
    res.json({ success: true, subscriptions: rows });
  } catch (err) { next(err); }
}

export async function deleteSubscription(req, res, next) {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) throw new ApiError(400, 'endpoint required');
    await query(`DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2`, [endpoint, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}
