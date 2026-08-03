// ============================================================
// PUSH SERVICE — sends real browser push notifications (Web Push
// protocol) so users get a notification even with the tab/app
// closed, same as WhatsApp Web or any installed PWA.
//
// Needs VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in .env (generate
// once with: node -e "console.log(require('web-push').generateVAPIDKeys())").
// Without them, this quietly no-ops — the in-app notification bell
// (notifications table) still works fine on its own.
// ============================================================
import webpush from 'web-push';
import { query } from '../config/db.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@squadpay.app';

let enabled = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  enabled = true;
} else {
  console.warn('⚠️  VAPID keys not set — push notifications disabled (in-app bell still works)');
}

export function isPushEnabled() { return enabled; }
export function getVapidPublicKey() { return VAPID_PUBLIC || null; }

// Sends a push to every device a user has subscribed on. Cleans up
// subscriptions that are dead (410 Gone / 404) so they don't pile up.
export async function sendPushToUser(userId, payload) {
  if (!enabled) return;
  const { rows } = await query(`SELECT * FROM push_subscriptions WHERE user_id=$1`, [userId]);
  await Promise.all(rows.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await query(`DELETE FROM push_subscriptions WHERE id=$1`, [sub.id]);
      } else {
        console.error('Push send failed:', err.message);
      }
    }
  }));
}
