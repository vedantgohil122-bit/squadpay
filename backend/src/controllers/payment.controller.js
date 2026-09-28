// ============================================================
// PAYMENT CONTROLLER — live treasury contributions via a real
// payment gateway. The core rule this entire file is built around:
// the FRONTEND NEVER CREDITS MONEY. Only the webhook handler,
// after verifying the provider's signature, ever updates a treasury
// balance. Everything else (order creation, status polling) is UI
// convenience around that one source of truth.
// ============================================================
import { query, pool } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { getProvider } from '../services/payment/index.js';
import { awardXp } from '../services/xp.service.js';
import { createNotification, createNotificationForSquad } from './notification.controller.js';
import { broadcastToSquad } from '../realtime.js';

const fmt = (p) => (p / 100).toFixed(2);

async function assertMember(squadId, userId) {
  const { rows } = await query(
    `SELECT role FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`, [squadId, userId]);
  if (!rows.length) throw new ApiError(403, 'Not a member of this squad');
  return rows[0].role;
}

// ---------------- CREATE ORDER ----------------
// Step 1 of the flow: user taps "Pay ₹500 to Treasury". This creates a
// payment_orders row (status='created') and a matching order with the
// provider, and hands back just enough for the frontend to open
// Razorpay's checkout — never anything that could move money on its own.
export async function createTreasuryOrder(req, res, next) {
  try {
    const { squadId, amount } = req.body || {};
    // Amount is validated server-side, in full, regardless of what the
    // client sends — the client's number is a suggestion, not a fact.
    const amt = Math.round(Number(amount));
    if (!squadId || !Number.isFinite(amt) || amt < 100) throw new ApiError(400, 'Minimum ₹1 required'); // 100 paise
    if (amt > 10000000) throw new ApiError(400, 'Amount too large'); // ₹1,00,000 sanity ceiling

    await assertMember(squadId, req.user.id);

    const provider = getProvider();
    if (!provider.isConfigured()) {
      throw new ApiError(503, 'Online payments abhi configure nahi hain — admin ko bolo RAZORPAY keys set karein');
    }

    const receipt = `sq_${squadId.slice(0, 8)}_${Date.now()}`;
    const order = await provider.createOrder({
      amount: amt, currency: 'INR', receipt,
      notes: { squadId, userId: req.user.id, purpose: 'treasury_contribution' },
    });

    const { rows } = await query(
      `INSERT INTO payment_orders (squad_id, user_id, purpose, amount, provider, provider_order_id, status)
       VALUES ($1,$2,'treasury_contribution',$3,'razorpay',$4,'created') RETURNING *`,
      [squadId, req.user.id, amt, order.providerOrderId]
    );

    res.status(201).json({
      success: true,
      order: {
        id: rows[0].id,
        providerOrderId: order.providerOrderId,
        amount: amt,
        currency: 'INR',
        keyId: provider.getPublicKeyId(),
      },
    });
  } catch (err) { next(err); }
}

// ---------------- WEBHOOK — THE SOURCE OF TRUTH ----------------
// Razorpay calls this directly, server-to-server — the frontend is never
// involved in this request at all. Every step matters, in this order:
//  1. Verify the signature against the RAW body (proves it's really
//     Razorpay, not anyone who found this URL).
//  2. Insert into payment_events with the provider's event id UNIQUE —
//     if Razorpay redelivers the same event (which it does on purpose
//     for reliability), this insert fails harmlessly and we stop, so
//     the same payment can never be credited twice.
//  3. Only THEN touch the treasury balance, inside a transaction.
export async function razorpayWebhook(req, res, next) {
  try {
    const provider = getProvider('razorpay');
    const signature = req.headers['x-razorpay-signature'];
    const valid = provider.verifyWebhookSignature(req.rawBody, signature);
    if (!valid) {
      // Don't leak *why* it failed — just refuse it. Logged server-side for debugging.
      console.error('Razorpay webhook: invalid signature');
      return res.status(400).json({ success: false });
    }

    const event = JSON.parse(req.rawBody.toString('utf8'));
    const eventId = req.headers['x-razorpay-event-id'] || `${event.event}_${event.payload?.payment?.entity?.id}`;

    // Idempotency gate: this INSERT is the actual defense against double
    // crediting, not just a nice-to-have log. ON CONFLICT DO NOTHING +
    // checking rowCount tells us whether this event was already handled.
    const inserted = await pool.query(
      `INSERT INTO payment_events (provider, provider_event_id, event_type, payload)
       VALUES ('razorpay',$1,$2,$3) ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
      [eventId, event.event, JSON.stringify(event)]
    );
    if (inserted.rowCount === 0) {
      // Already processed this exact event before — acknowledge and stop.
      return res.json({ success: true, duplicate: true });
    }
    const paymentEventRowId = inserted.rows[0].id;

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      await handlePaymentCaptured(event, paymentEventRowId);
    } else if (event.event === 'payment.failed') {
      await handlePaymentFailed(event, paymentEventRowId);
    }
    // Other event types (refund.processed etc.) are logged in payment_events
    // above but don't need further action here — refunds are initiated
    // FROM this app (see refundTreasuryPayment), not driven by inbound webhooks.

    res.json({ success: true });
  } catch (err) {
    // A webhook handler should never 500 in a way that makes the provider
    // think it needs to keep retrying forever for a bug on our end that
    // retrying won't fix — but genuine unexpected errors still get logged.
    console.error('Webhook processing error:', err.message);
    next(err);
  }
}

async function handlePaymentCaptured(event, paymentEventRowId) {
  const payment = event.payload?.payment?.entity;
  if (!payment) return;
  const providerOrderId = payment.order_id;

  const client = await pool.connect();
  try {
    const order = (await client.query(
      `SELECT * FROM payment_orders WHERE provider_order_id=$1 FOR UPDATE`, [providerOrderId]
    )).rows[0];
    if (!order) { console.error('Webhook: no matching order for', providerOrderId); return; }
    if (order.status === 'paid') return; // second layer of idempotency, belt-and-suspenders with payment_events

    // The amount actually paid must match what the order was created
    // for — never trust the webhook's amount blindly either.
    if (Number(payment.amount) !== Number(order.amount)) {
      console.error('Webhook: amount mismatch', payment.amount, 'vs order', order.amount);
      await client.query(`UPDATE payment_orders SET status='failed', updated_at=now() WHERE id=$1`, [order.id]);
      return;
    }

    await client.query('BEGIN');
    await client.query(`UPDATE payment_orders SET status='paid', updated_at=now() WHERE id=$1`, [order.id]);
    await client.query(`INSERT INTO treasury (squad_id) VALUES ($1) ON CONFLICT (squad_id) DO NOTHING`, [order.squad_id]);
    await client.query(`UPDATE treasury SET balance=balance+$1, updated_at=now() WHERE squad_id=$2`, [order.amount, order.squad_id]);
    // contributions row too — keeps the existing member-wallet stats (getTreasury) accurate for online payments as well as manual ones
    await client.query(
      `INSERT INTO contributions (squad_id, user_id, amount, note) VALUES ($1,$2,$3,'Online payment via Razorpay')`,
      [order.squad_id, order.user_id, order.amount]
    );
    const txn = (await client.query(
      `INSERT INTO treasury_transactions (squad_id, type, amount, description, user_id, payment_order_id)
       VALUES ($1,'deposit',$2,$3,$4,$5) RETURNING *`,
      [order.squad_id, order.amount, `Online payment verified — ₹${fmt(order.amount)} 💳`, order.user_id, order.id]
    )).rows[0];
    await client.query(`UPDATE payment_events SET processed_at=now() WHERE id=$1`, [paymentEventRowId]);
    await client.query('COMMIT');

    const newBalance = (await client.query(`SELECT balance FROM treasury WHERE squad_id=$1`, [order.squad_id])).rows[0].balance;

    // Below this point is all side effects OUTSIDE the transaction — the
    // money is already safely committed, so a notification/socket failure
    // here can never leave the ledger in a bad state.
    const payer = (await query(`SELECT name FROM users WHERE id=$1`, [order.user_id])).rows[0];

    createNotification({
      userId: order.user_id, squadId: order.squad_id, type: 'treasury_contribution',
      message: `Payment successful 🎉 ₹${fmt(order.amount)} treasury mein add ho gaya`,
      metadata: { amount: order.amount, orderId: order.id },
    });
    createNotificationForSquad({
      squadId: order.squad_id, excludeUserId: order.user_id, type: 'treasury_contribution',
      message: `${payer?.name || 'Someone'} ne treasury mein ₹${fmt(order.amount)} online pay kiya 💳`,
      metadata: { amount: order.amount },
    });

    awardXp(order.squad_id, order.user_id, 'treasury.contributed', 30, { amount: order.amount }).catch(() => {});

    broadcastToSquad(order.squad_id, 'treasury:update', {
      transaction: txn, newBalance: Number(newBalance), userName: payer?.name,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('handlePaymentCaptured failed:', err.message);
  } finally {
    client.release();
  }
}

async function handlePaymentFailed(event, paymentEventRowId) {
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return;
  await query(`UPDATE payment_orders SET status='failed', updated_at=now() WHERE provider_order_id=$1 AND status <> 'paid'`, [payment.order_id]);
  await query(`UPDATE payment_events SET processed_at=now() WHERE id=$1`, [paymentEventRowId]);
}

// ---------------- ORDER STATUS (fallback polling) ----------------
// The frontend's checkout success handler is NOT proof of payment (per
// spec) — after Razorpay's checkout closes, the frontend polls this
// instead of crediting anything itself, as a fallback in case the
// socket broadcast is missed for any reason.
export async function getOrderStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const order = (await query(`SELECT * FROM payment_orders WHERE id=$1`, [orderId])).rows[0];
    if (!order) throw new ApiError(404, 'Order not found');
    if (order.user_id !== req.user.id) throw new ApiError(403, 'Not your order');
    res.json({ success: true, status: order.status, amount: Number(order.amount) });
  } catch (err) { next(err); }
}

// ---------------- CONTRIBUTION TRACKING ----------------
// Derived, not stored — "paid" is always SUM(treasury_transactions) for
// that member, so it can never drift out of sync with the actual ledger.
// No separate member_contributions table: it would just be a cache of
// something this query already computes correctly on every call.
export async function getContributions(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);

    const treasury = (await query(`SELECT contribution_target FROM treasury WHERE squad_id=$1`, [squadId])).rows[0];
    const target = treasury?.contribution_target ? Number(treasury.contribution_target) : null;

    const rows = (await query(`
      SELECT u.id, COALESCE(sm.nickname,u.name) AS name, u.avatar_url,
        COALESCE(SUM(tt.amount) FILTER (WHERE tt.type='deposit'),0)::bigint AS paid
      FROM squad_members sm
      JOIN users u ON u.id = sm.user_id
      LEFT JOIN treasury_transactions tt ON tt.user_id = sm.user_id AND tt.squad_id = sm.squad_id AND tt.type='deposit'
      WHERE sm.squad_id=$1 AND sm.status='active'
      GROUP BY u.id, u.name, u.avatar_url, sm.nickname
      ORDER BY paid DESC
    `, [squadId])).rows;

    const members = rows.map((r) => {
      const paid = Number(r.paid);
      const required = target ?? 0;
      return {
        id: r.id, name: r.name, avatar_url: r.avatar_url, paid, required,
        remaining: Math.max(0, required - paid),
        status: !target ? 'no_target' : paid >= required ? 'paid' : paid > 0 ? 'pending' : 'not_paid',
      };
    });

    res.json({ success: true, target, members });
  } catch (err) { next(err); }
}

export async function setContributionTarget(req, res, next) {
  try {
    const { squadId } = req.params;
    const { amount } = req.body || {};
    const role = await assertMember(squadId, req.user.id);
    if (role !== 'admin') throw new ApiError(403, 'Sirf admin target set kar sakta hai');
    const amt = amount ? Math.round(Number(amount)) : null;
    if (amt !== null && (!Number.isFinite(amt) || amt <= 0)) throw new ApiError(400, 'Invalid amount');
    await query(`INSERT INTO treasury (squad_id) VALUES ($1) ON CONFLICT (squad_id) DO NOTHING`, [squadId]);
    await query(`UPDATE treasury SET contribution_target=$1, updated_at=now() WHERE squad_id=$2`, [amt, squadId]);
    res.json({ success: true, target: amt });
  } catch (err) { next(err); }
}

// ---------------- REFUNDS ----------------
// Admin-only. Never deletes or edits the original transaction — records
// the refund as its own ledger event (type='refund') and lets the
// balance math (which is just SUM of all transactions by type) work
// out correctly, same pattern already used for expense-delete reversals.
export async function refundPayment(req, res, next) {
  try {
    const { transactionId } = req.params;
    const txn = (await query(`SELECT * FROM treasury_transactions WHERE id=$1`, [transactionId])).rows[0];
    if (!txn) throw new ApiError(404, 'Transaction not found');
    if (!txn.payment_order_id) throw new ApiError(400, 'Ye ek online payment nahi thi, isse refund nahi kiya ja sakta yahan se');

    const role = await assertMember(txn.squad_id, req.user.id);
    if (role !== 'admin') throw new ApiError(403, 'Sirf admin refund process kar sakta hai');

    const order = (await query(`SELECT * FROM payment_orders WHERE id=$1`, [txn.payment_order_id])).rows[0];
    const provider = getProvider(order.provider);

    // Find the actual Razorpay payment id linked to this order — Razorpay's
    // refund API needs the payment id, not the order id.
    const events = (await query(
      `SELECT payload FROM payment_events WHERE payment_order_id=$1 AND event_type IN ('payment.captured','order.paid') ORDER BY created_at DESC LIMIT 1`,
      [order.id]
    )).rows;
    const providerPaymentId = events[0]?.payload?.payload?.payment?.entity?.id;
    if (!providerPaymentId) throw new ApiError(400, 'Payment record incomplete, refund nahi ho sakta');

    const refund = await provider.refundPayment(providerPaymentId, Number(txn.amount));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bal = Number((await client.query(`SELECT balance FROM treasury WHERE squad_id=$1`, [txn.squad_id])).rows[0].balance);
      if (bal < Number(txn.amount)) throw new ApiError(400, 'Treasury balance is less than the refund amount — spend elsewhere may need reversing first');
      await client.query(`UPDATE treasury SET balance=balance-$1, updated_at=now() WHERE squad_id=$2`, [txn.amount, txn.squad_id]);
      await client.query(
        `INSERT INTO treasury_transactions (squad_id,type,amount,description,user_id,payment_order_id) VALUES ($1,'refund',$2,$3,$4,$5)`,
        [txn.squad_id, txn.amount, `Refund processed for ₹${fmt(Number(txn.amount))} payment (${refund.providerRefundId})`, txn.user_id, order.id]
      );
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    createNotification({
      userId: txn.user_id, squadId: txn.squad_id, type: 'treasury_contribution',
      message: `₹${fmt(Number(txn.amount))} ka refund process ho gaya`,
    });
    broadcastToSquad(txn.squad_id, 'treasury:refund', { amount: Number(txn.amount) });

    res.json({ success: true, refund });
  } catch (err) { next(err); }
}
