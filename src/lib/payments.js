// Payment provider access: Razorpay over plain fetch, or a no-network mock for tests.
import { createHmac, randomBytes } from 'node:crypto';
import { ApiError } from './api';
import { safeEqual } from './tokens';

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const unavailable = () => new ApiError(503, 'Payments are not available right now. Please try again later.');

// Throwaway databases only; mock orders hand out real accounts, so never on real data.
const MOCK_DB_PATTERN = /_(selftest|security|review|test|dev)$/;

// Mock needs an explicit opt-in, a local (non-Vercel) server, a test database and no live key.
function mockAllowed() {
  return (
    process.env.ALLOW_MOCK_PAYMENTS === 'yes' &&
    !process.env.VERCEL &&
    MOCK_DB_PATTERN.test(process.env.MONGODB_DB_NAME || '') &&
    !String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_')
  );
}

// 'razorpay' (default) or 'mock'. mock-complete and admin "Mark paid" both depend on this guard.
export function paymentMode() {
  const mode = String(process.env.PAYMENT_MODE || 'razorpay').trim().toLowerCase();
  if (mode === 'mock') {
    if (!mockAllowed()) {
      console.error('[payments] mock refused');
      throw unavailable();
    }
    return 'mock';
  }
  if (mode !== 'razorpay') {
    console.error('[payments] unknown PAYMENT_MODE');
    throw unavailable();
  }
  return 'razorpay';
}

function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keyId || !keySecret) {
    console.error('[payments] Razorpay keys are not configured');
    throw unavailable();
  }
  // Live keys outside production would take real money from test runs.
  if (keyId.startsWith('rzp_live_') && process.env.VERCEL_ENV !== 'production') {
    console.error('[payments] refusing rzp_live_ key outside production');
    throw unavailable();
  }
  return { keyId, keySecret };
}

async function razorpay(method, path, body) {
  if (paymentMode() !== 'razorpay') throw new Error('Razorpay call attempted in mock mode');
  const { keyId, keySecret } = razorpayKeys();
  let res;
  try {
    res = await fetch(RAZORPAY_API + path, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[payments] Razorpay request failed', method, path.split('/')[1], err?.name);
    throw new ApiError(502, 'Payment provider could not be reached. Please try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('[payments] Razorpay error', method, path.split('/')[1], res.status, data?.error?.code || '');
    throw new ApiError(502, 'Payment provider error. Please try again.');
  }
  return data;
}

export async function createProviderOrder({ amountPaise, receipt, notes }) {
  if (!Number.isInteger(amountPaise) || amountPaise < 100) throw new Error('Invalid order amount');
  if (paymentMode() === 'mock') {
    return { provider: 'mock', providerOrderId: `mock_${randomBytes(12).toString('hex')}` };
  }
  const { keyId } = razorpayKeys();
  const order = await razorpay('POST', '/orders', {
    amount: amountPaise,
    currency: 'INR',
    receipt: String(receipt || '').slice(0, 40),
    notes: notes || {},
  });
  if (!order?.id) throw new ApiError(502, 'Payment provider error. Please try again.');
  return { provider: 'razorpay', providerOrderId: order.id, keyId };
}

export async function fetchProviderPayment(id) {
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(String(id || ''))) throw new ApiError(400, 'Invalid payment reference');
  return razorpay('GET', `/payments/${id}`);
}

// All payment attempts on one Razorpay order (used by the cron before giving up on an order).
export async function fetchOrderPayments(orderId) {
  if (!/^order_[A-Za-z0-9]{6,40}$/.test(String(orderId || ''))) throw new ApiError(400, 'Invalid order reference');
  const data = await razorpay('GET', `/orders/${orderId}/payments`);
  return Array.isArray(data?.items) ? data.items : [];
}

export async function captureProviderPayment(id, amountPaise) {
  return razorpay('POST', `/payments/${id}/capture`, { amount: amountPaise, currency: 'INR' });
}

// Returns a reason string when a Razorpay payment entity does not match our order, else null.
export function paymentMismatch(entity, { orderId, amountPaise }) {
  if (!entity || typeof entity !== 'object') return 'missing payment';
  if (entity.order_id !== orderId) return 'order mismatch';
  if (entity.amount !== amountPaise) return 'amount mismatch';
  if (entity.currency !== 'INR') return 'currency mismatch';
  return null;
}

// Fetches the payment, checks it belongs to this order, and captures it if only authorised.
// Returns { ok: true, entity } or { ok: false, reason, entity }.
export async function confirmProviderPayment({ providerPaymentId, orderId, amountPaise }) {
  let entity = await fetchProviderPayment(providerPaymentId);
  const mismatch = paymentMismatch(entity, { orderId, amountPaise });
  if (mismatch) return { ok: false, reason: mismatch, entity };
  if (entity.status === 'authorized') entity = await captureProviderPayment(providerPaymentId, amountPaise);
  if (entity?.status !== 'captured') return { ok: false, reason: `status ${entity?.status || 'unknown'}`, entity };
  return { ok: true, entity };
}

function hmacHex(secret, text) {
  return createHmac('sha256', secret).update(text).digest('hex');
}

export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw unavailable();
  if (!orderId || !paymentId || typeof signature !== 'string') return false;
  return safeEqual(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[payments] RAZORPAY_WEBHOOK_SECRET is not configured');
    throw unavailable();
  }
  if (typeof rawBody !== 'string' || typeof signature !== 'string') return false;
  return safeEqual(hmacHex(secret, rawBody), signature);
}

// `$push` value for payments.events (kept to the last 20).
export function eventPush(type, extra = {}) {
  return { events: { $each: [{ type, at: new Date(), ...extra }], $slice: -20 } };
}

// Buyer-facing status for /buy/status: 'pending' | 'fulfilled' | 'failed'.
export function publicPaymentStatus(status) {
  if (status === 'fulfilled') return 'fulfilled';
  if (status === 'failed' || status === 'abandoned' || status === 'refunded') return 'failed';
  return 'pending';
}

const idOrNull = (value) => (value ? String(value) : null);

// Admin view of a payment. ipHash stays internal.
export function serializePayment(payment) {
  return {
    id: payment._id.toString(),
    provider: payment.provider,
    providerOrderId: payment.providerOrderId,
    providerPaymentId: payment.providerPaymentId || null,
    planCode: payment.planCode,
    price: {
      listPaise: payment.price?.listPaise ?? null,
      offerApplied: Boolean(payment.price?.offerApplied),
      couponDiscountPaise: payment.price?.couponDiscountPaise ?? 0,
      finalPaise: payment.price?.finalPaise ?? null,
    },
    couponId: idOrNull(payment.couponId),
    couponCode: payment.couponCode || null,
    customer: {
      name: payment.customer?.name || '',
      email: payment.customer?.email || '',
      phone: payment.customer?.phone || '',
    },
    requestedCategoryIds: (payment.requestedCategoryIds || []).map(String),
    buyerUserId: idOrNull(payment.buyerUserId),
    buyerIsOwner: payment.buyerIsOwner !== false,
    userId: idOrNull(payment.userId),
    newAccount: Boolean(payment.newAccount),
    status: payment.status,
    paidAt: payment.paidAt || null,
    fulfilledAt: payment.fulfilledAt || null,
    failure: payment.failure || null,
    refund: payment.refund ? { ...payment.refund, by: idOrNull(payment.refund.by) } : null,
    review: payment.review || null,
    events: (payment.events || []).map((e) => ({ type: e.type, at: e.at, reason: e.reason || undefined })),
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt || null,
  };
}
