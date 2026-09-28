// ============================================================
// RAZORPAY PROVIDER — the one concrete implementation of the
// payment-provider interface (see provider.interface.js for the
// contract every provider must satisfy). Razorpay was chosen because
// it's the standard Indian payment gateway, has strong native UPI
// support (fits SquadPay's whole identity), and gives free instant
// test-mode API keys with no business KYC required to start building.
//
// Needs RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET + RAZORPAY_WEBHOOK_SECRET
// in .env. Without them, every method below throws a clear "not
// configured" error rather than silently pretending to work — a
// missing payment provider should never be invisible.
// ============================================================
import Razorpay from 'razorpay';
import crypto from 'crypto';

let client = null;
function getClient() {
  if (client) return client;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error('Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
  }
  client = new Razorpay({ key_id, key_secret });
  return client;
}

export function isConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getPublicKeyId() {
  return process.env.RAZORPAY_KEY_ID || null;
}

// amount is in PAISE already (SquadPay's unit throughout) — Razorpay's
// API also expects the smallest currency unit, so no conversion needed.
export async function createOrder({ amount, currency = 'INR', receipt, notes }) {
  const rzp = getClient();
  const order = await rzp.orders.create({ amount, currency, receipt, notes });
  return { providerOrderId: order.id, status: order.status };
}

// Verifies the signature Razorpay's CHECKOUT sends back to the client on
// success (order_id|payment_id signed with the key secret). This is NOT
// what credits the treasury — it's only used to know whether it's worth
// polling for the webhook result sooner, since per spec the webhook alone
// is the source of truth for actually crediting money.
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

// Verifies a webhook delivery is genuinely from Razorpay (HMAC over the
// RAW request body using the separate webhook secret you set when adding
// the webhook URL in the Razorpay dashboard — different from the API key
// secret). Must run against the raw, unparsed body bytes, not the
// JSON-parsed object, or the signature will never match.
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET not set');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // timingSafeEqual needs equal-length buffers, or it throws — signatureHeader
  // could theoretically be any length from an attacker, so guard the length
  // first rather than let a mismatched-length input throw past this check.
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function refundPayment(providerPaymentId, amount) {
  const rzp = getClient();
  const refund = await rzp.payments.refund(providerPaymentId, { amount });
  return { providerRefundId: refund.id, status: refund.status };
}

export async function fetchPayment(providerPaymentId) {
  const rzp = getClient();
  return rzp.payments.fetch(providerPaymentId);
}
