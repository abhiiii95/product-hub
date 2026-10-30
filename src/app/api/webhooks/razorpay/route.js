import { after } from 'next/server';
import { getDb } from '@/lib/db';
import { json, route, badRequest } from '@/lib/api';
import { eventPush, paymentMismatch, verifyWebhookSignature } from '@/lib/payments';
import { fulfilPayment, markNeedsReview } from '@/lib/subscriptions';
import { drain } from '@/lib/outbox';
import { releaseCouponHold } from '@/lib/coupons';

// Razorpay server-to-server events. No session: the HMAC over the raw body is the authentication.
// route()'s origin check passes because Razorpay sends no Origin header.

const STALE_MS = 5 * 60 * 1000;

async function handleCaptured(db, entity, eventId) {
  if (!entity?.order_id || !entity?.id) return 'ignored';
  const payment = await db.collection('payments').findOne({ providerOrderId: entity.order_id, provider: 'razorpay' });
  if (!payment) return 'unknown order';
  if (payment.providerPaymentId && payment.providerPaymentId !== entity.id) {
    // A second captured payment on the same order: money must be refunded by hand.
    await markNeedsReview(payment, `second payment ${entity.id} captured on the same order`);
    return 'needs_review';
  }
  const mismatch = paymentMismatch(entity, { orderId: payment.providerOrderId, amountPaise: payment.price.finalPaise });
  if (mismatch || entity.status !== 'captured') {
    await markNeedsReview(payment, `webhook: ${mismatch || `status ${entity.status}`}`);
    return 'needs_review';
  }
  await db.collection('payments').updateOne(
    { _id: payment._id, providerPaymentId: { $exists: false } },
    { $set: { providerPaymentId: entity.id, updatedAt: new Date() }, $push: eventPush('webhook_captured', { eventId }) }
  );
  const result = await fulfilPayment(payment._id);
  return result.status;
}

async function handleFailed(db, entity, eventId) {
  if (!entity?.order_id) return 'ignored';
  const now = new Date();
  // Only an unpaid order is marked failed; the buyer may retry and succeed on the same order.
  const payment = await db.collection('payments').findOneAndUpdate(
    { providerOrderId: entity.order_id, provider: 'razorpay', status: 'created' },
    {
      $set: {
        status: 'failed',
        failure: {
          code: String(entity.error_code || '').slice(0, 80) || null,
          reason: String(entity.error_description || entity.error_reason || 'payment failed').slice(0, 300),
          at: now,
        },
        updatedAt: now,
      },
      $push: eventPush('webhook_failed', { eventId }),
    },
    { projection: { _id: 1 } }
  );
  if (!payment) return 'ignored';
  // A later successful retry re-checks the coupon limits at fulfilment.
  await releaseCouponHold(payment._id);
  return 'failed';
}

export const POST = route(async (request) => {
  const raw = await request.text();
  if (raw.length > 1_000_000) throw badRequest('Payload too large');
  const signature = request.headers.get('x-razorpay-signature') || '';
  if (!verifyWebhookSignature(raw, signature)) throw badRequest('Invalid signature');

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: true, ignored: 'invalid json' });
  }
  const db = await getDb();
  const eventId = (request.headers.get('x-razorpay-event-id') || '').slice(0, 100);
  const type = String(event?.event || '').slice(0, 60);

  // Razorpay retries deliveries; each event id is processed once. The record starts as
  // 'processing' so a delivery whose run died (timeout) is taken over after 5 minutes.
  if (eventId) {
    const events = db.collection('webhookEvents');
    const now = new Date();
    try {
      await events.insertOne({ eventId, type, status: 'processing', receivedAt: now });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const stale = await events.findOneAndUpdate(
        { eventId, status: 'processing', receivedAt: { $lte: new Date(now.getTime() - STALE_MS) } },
        { $set: { receivedAt: now } }
      );
      if (!stale) return json({ ok: true, duplicate: true });
    }
  }

  try {
    let outcome = 'ignored';
    if (type === 'payment.captured') outcome = await handleCaptured(db, event.payload?.payment?.entity, eventId);
    else if (type === 'order.paid') outcome = await handleCaptured(db, event.payload?.payment?.entity, eventId);
    else if (type === 'payment.failed') outcome = await handleFailed(db, event.payload?.payment?.entity, eventId);
    if (eventId) await db.collection('webhookEvents').updateOne({ eventId }, { $set: { status: 'done' } });
    after(() => drain({ max: 5, budgetMs: 15000 }).catch((err) => console.error('[outbox] drain failed', err?.message)));
    return json({ ok: true, outcome });
  } catch (err) {
    // Let Razorpay retry this event: forget the dedupe record. A payment already marked
    // 'paid' is also finished by the daily cron.
    if (eventId) await db.collection('webhookEvents').deleteOne({ eventId }).catch(() => {});
    throw err;
  }
});
