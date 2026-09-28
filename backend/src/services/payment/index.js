// ============================================================
// PAYMENT PROVIDER INTERFACE
// ============================================================
// Every provider module (see razorpay.provider.js) must export:
//   isConfigured()               -> boolean
//   getPublicKeyId()             -> string | null   (safe to send to frontend)
//   createOrder({amount, currency, receipt, notes}) -> {providerOrderId, status}
//   verifyCheckoutSignature({orderId, paymentId, signature}) -> boolean
//   verifyWebhookSignature(rawBody, signatureHeader) -> boolean
//   refundPayment(providerPaymentId, amount) -> {providerRefundId, status}
//   fetchPayment(providerPaymentId) -> provider's raw payment object
//
// PAYMENT_PROVIDER env var selects which one loads (defaults to
// 'razorpay', currently the only implementation). The rest of the app
// — payment.controller.js, the webhook route, the frontend — only ever
// imports FROM THIS FILE, never a concrete provider directly. Adding a
// second provider later means writing one new file matching the
// contract above and adding one line to the switch below — nothing
// else in the payment flow changes.
// ============================================================
import * as razorpay from './razorpay.provider.js';

const providers = { razorpay };

export function getProvider(name = process.env.PAYMENT_PROVIDER || 'razorpay') {
  const p = providers[name];
  if (!p) throw new Error(`Unknown payment provider: ${name}`);
  return p;
}
