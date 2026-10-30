import { randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { getDb } from '@/lib/db';
import { json, readJson, route, notFound } from '@/lib/api';
import { Validator } from '@/lib/validate';
import { eventPush, paymentMode } from '@/lib/payments';
import { fulfilPayment } from '@/lib/subscriptions';
import { releaseCouponHold } from '@/lib/coupons';
import { drain } from '@/lib/outbox';
import { maskEmail } from '@/lib/users';
import { clientIp, hashKey, hit } from '@/lib/rateLimit';

// Test mode only (paymentMode refuses mock outside a local test setup): finishes a mock order from /buy/status.
export const POST = route(async (request) => {
  if (paymentMode() !== 'mock') throw notFound();
  await hit(`mock:ip:${hashKey(clientIp(request))}`, 30, 3600);
  const body = await readJson(request);
  const v = new Validator();
  const orderId = v.string('orderId', body.orderId, { required: true, max: 64, label: 'Order' });
  const outcome = v.oneOf('outcome', body.outcome, ['paid', 'failed'], { label: 'Outcome' });
  v.assert();

  const db = await getDb();
  const payment = await db.collection('payments').findOne({ providerOrderId: orderId, provider: 'mock' });
  if (!payment) throw notFound('Order not found');
  const now = new Date();

  if (outcome === 'failed') {
    await db.collection('payments').updateOne(
      { _id: payment._id, status: 'created' },
      { $set: { status: 'failed', failure: { reason: 'mock failure', at: now }, updatedAt: now }, $push: eventPush('failed') }
    );
    const current = await db.collection('payments').findOne({ _id: payment._id }, { projection: { status: 1 } });
    if (current.status === 'failed') await releaseCouponHold(payment._id);
    return json({ status: current.status, maskedEmail: maskEmail(payment.customer?.email), newAccount: false });
  }

  await db.collection('payments').updateOne(
    { _id: payment._id, providerPaymentId: { $exists: false } },
    { $set: { providerPaymentId: `mockpay_${randomBytes(10).toString('hex')}`, updatedAt: now } }
  );
  const result = await fulfilPayment(payment._id);
  after(() => drain({ max: 5, budgetMs: 15000 }).catch((err) => console.error('[outbox] drain failed', err?.message)));
  return json({ status: result.status, maskedEmail: result.maskedEmail, newAccount: result.newAccount });
});
