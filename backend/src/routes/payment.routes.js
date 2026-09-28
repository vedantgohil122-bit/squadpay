import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createTreasuryOrder, razorpayWebhook, getOrderStatus,
  getContributions, setContributionTarget, refundPayment,
} from '../controllers/payment.controller.js';

const r = Router();

// Public — Razorpay calls this directly, no JWT. Verified by HMAC
// signature instead (see razorpayWebhook / verifyWebhookSignature).
// Mounted BEFORE requireAuth below so it never hits that middleware.
r.post('/webhook/razorpay', razorpayWebhook);

r.use(requireAuth);
r.post('/treasury/create-order', createTreasuryOrder);
r.get('/treasury/order/:orderId/status', getOrderStatus);
r.get('/treasury/:squadId/contributions', getContributions);
r.post('/treasury/:squadId/contribution-target', setContributionTarget);
r.post('/treasury/refund/:transactionId', refundPayment);

export default r;
