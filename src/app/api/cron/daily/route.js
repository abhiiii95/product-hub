import { getDb } from '@/lib/db';
import { json, route, unauthorized } from '@/lib/api';
import { safeEqual } from '@/lib/tokens';
import { fulfilPayment } from '@/lib/subscriptions';
import { releaseCouponHold, releaseExpiredHolds } from '@/lib/coupons';
import { eventPush, fetchOrderPayments, paymentMismatch, paymentMode } from '@/lib/payments';
import { drain } from '@/lib/outbox';

export const maxDuration = 60;

const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;

// Vercel Cron: GET with `Authorization: Bearer CRON_SECRET`.
export const GET = route(async (request) => {
  const secret = process.env.CRON_SECRET || '';
  const header = request.headers.get('authorization') || '';
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) throw unauthorized();

  const db = await getDb();
  const now = new Date();

  // Paid but not finished (crash or timeout during fulfilment): finish them now.
  const stuck = await db.collection('payments').find({ status: 'paid' }, { projection: { _id: 1 } }).sort({ paidAt: 1 }).limit(25).toArray();
  let fulfilled = 0;
  let fulfilErrors = 0;
  for (const { _id } of stuck) {
    try {
      const result = await fulfilPayment(_id);
      if (result.status === 'fulfilled') fulfilled += 1;
    } catch (err) {
      fulfilErrors += 1;
      console.error('[cron] fulfilment retry failed', _id.toString(), err?.message);
    }
  }

  // Orders still 'created' after a day. A Razorpay order may have been paid even though
  // verify and the webhook never arrived, so ask Razorpay before giving up on it.
  let razorpayMode = false;
  try {
    razorpayMode = paymentMode() === 'razorpay';
  } catch {}
  const old = await db
    .collection('payments')
    .find({ status: 'created', createdAt: { $lt: new Date(now.getTime() - ABANDON_AFTER_MS) } }, { projection: { provider: 1, providerOrderId: 1, price: 1 } })
    .sort({ createdAt: 1 })
    .limit(50)
    .toArray();
  let abandoned = 0;
  let recovered = 0;
  for (const payment of old) {
    try {
      if (razorpayMode && payment.provider === 'razorpay') {
        const items = await fetchOrderPayments(payment.providerOrderId);
        const captured = items.find((p) => p.status === 'captured' && !paymentMismatch(p, { orderId: payment.providerOrderId, amountPaise: payment.price?.finalPaise }));
        if (captured) {
          await db.collection('payments').updateOne(
            { _id: payment._id, providerPaymentId: { $exists: false } },
            { $set: { providerPaymentId: captured.id, updatedAt: now }, $push: eventPush('cron_captured') }
          );
          if ((await fulfilPayment(payment._id)).status === 'fulfilled') recovered += 1;
          continue;
        }
      }
      const res = await db.collection('payments').updateOne(
        { _id: payment._id, status: 'created' },
        { $set: { status: 'abandoned', updatedAt: now }, $push: eventPush('abandoned') }
      );
      if (res.modifiedCount) {
        abandoned += 1;
        await releaseCouponHold(payment._id);
      }
    } catch (err) {
      console.error('[cron] abandon check failed', payment._id.toString(), err?.message);
    }
  }
  const holdsReleased = await releaseExpiredHolds({ now }).catch((err) => {
    console.error('[cron] coupon hold release failed', err?.message);
    return 0;
  });

  const mail = await drain({ budgetMs: 40000 }).catch((err) => {
    console.error('[cron] drain failed', err?.message);
    return { error: true };
  });
  return json({ ok: true, fulfilled, fulfilErrors, recovered, abandoned, holdsReleased, mail });
});
