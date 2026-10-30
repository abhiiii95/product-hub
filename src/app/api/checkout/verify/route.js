import { after } from 'next/server';
import { getDb } from '@/lib/db';
import { json, readJson, route, badRequest, notFound } from '@/lib/api';
import { Validator } from '@/lib/validate';
import { confirmProviderPayment, eventPush, paymentMode, verifyCheckoutSignature } from '@/lib/payments';
import { fulfilPayment, markNeedsReview } from '@/lib/subscriptions';
import { drain } from '@/lib/outbox';
import { releaseCouponHold } from '@/lib/coupons';
import { clientIp, hashKey, hit } from '@/lib/rateLimit';

// Public (Razorpay only): called by the checkout handler after the buyer pays.
// Signature first, then the payment is re-read from Razorpay before any access is given.
export const POST = route(async (request) => {
  await hit(`verify:ip:${hashKey(clientIp(request))}`, 30, 3600);
  if (paymentMode() !== 'razorpay') throw badRequest('Not available in test mode');
  const body = await readJson(request);
  const v = new Validator();
  const orderId = v.string('razorpay_order_id', body.razorpay_order_id, { required: true, max: 64 });
  const paymentId = v.string('razorpay_payment_id', body.razorpay_payment_id, { required: true, max: 64 });
  const signature = v.string('razorpay_signature', body.razorpay_signature, { required: true, max: 128 });
  v.assert();

  const db = await getDb();
  const payment = await db.collection('payments').findOne({ providerOrderId: orderId, provider: 'razorpay' });
  if (!payment) throw notFound('Order not found');
  if (!verifyCheckoutSignature({ orderId, paymentId, signature })) throw badRequest('Payment could not be verified');

  const check = await confirmProviderPayment({ providerPaymentId: paymentId, orderId, amountPaise: payment.price.finalPaise });
  if (!check.ok) {
    if (check.entity?.status === 'failed') {
      await db.collection('payments').updateOne(
        { _id: payment._id, status: 'created' },
        { $set: { status: 'failed', failure: { reason: 'payment failed', at: new Date() }, updatedAt: new Date() }, $push: eventPush('failed') }
      );
      await releaseCouponHold(payment._id);
      throw badRequest('Payment failed. No money was taken; please try again.');
    }
    // Signed by Razorpay but wrong amount/order/state: a human must look.
    await markNeedsReview(payment, `verify: ${check.reason}`);
    after(() => drain({ max: 5, budgetMs: 15000 }).catch((err) => console.error('[outbox] drain failed', err?.message)));
    throw badRequest('Payment needs a manual check. We will contact you shortly.');
  }

  await db.collection('payments').updateOne(
    { _id: payment._id, providerPaymentId: { $exists: false } },
    { $set: { providerPaymentId: paymentId, updatedAt: new Date() } }
  );
  const result = await fulfilPayment(payment._id);
  after(() => drain({ max: 5, budgetMs: 15000 }).catch((err) => console.error('[outbox] drain failed', err?.message)));
  return json({ status: result.status, maskedEmail: result.maskedEmail, newAccount: result.newAccount });
});
