import { after } from 'next/server';
import { getDb, toObjectId } from '@/lib/db';
import { json, readJson, route, badRequest, conflict, notFound } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { Validator } from '@/lib/validate';
import { eventPush, paymentMode, serializePayment } from '@/lib/payments';
import { fulfilPayment, revokeUser } from '@/lib/subscriptions';
import { drain } from '@/lib/outbox';
import { logActivity } from '@/lib/activity';

async function loadPayment(id) {
  const objectId = toObjectId(id);
  if (!objectId) throw notFound('Payment not found');
  const db = await getDb();
  const payment = await db.collection('payments').findOne({ _id: objectId });
  if (!payment) throw notFound('Payment not found');
  return payment;
}

// Admin: { markPaid: true } (test mode only) or { refundNote, revokeDays? }.
// Refunds themselves are made in the Razorpay dashboard; this records them.
export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const payment = await loadPayment(params.id);
  const body = await readJson(request);
  const db = await getDb();

  if (body.markPaid === true) {
    if (paymentMode() !== 'mock' || payment.provider !== 'mock') throw badRequest('Mark paid is only available in test mode');
    const result = await fulfilPayment(payment._id);
    after(() => drain({ max: 5, budgetMs: 15000 }).catch((err) => console.error('[outbox] drain failed', err?.message)));
    await logActivity(admin, 'payment.mark_paid', { entityType: 'payment', entityId: payment._id, summary: `Marked test order ${payment.providerOrderId} paid` });
    return json({ payment: serializePayment(await db.collection('payments').findOne({ _id: payment._id })), result: { status: result.status, newAccount: result.newAccount } });
  }

  const v = new Validator();
  const note = v.string('refundNote', body.refundNote, { required: true, max: 500, label: 'Refund note' });
  const revokeDays = v.number('revokeDays', body.revokeDays, { integer: true, min: 1, max: 3650, label: 'Days to remove' });
  v.assert();
  if (!['paid', 'fulfilled', 'needs_review'].includes(payment.status)) throw conflict('Only a paid payment can be marked refunded');

  const now = new Date();
  const res = await db.collection('payments').updateOne(
    { _id: payment._id, status: payment.status },
    { $set: { status: 'refunded', refund: { note, revokeDays: revokeDays ?? null, at: now, by: admin._id }, updatedAt: now }, $push: eventPush('refunded') }
  );
  if (res.modifiedCount === 0) throw conflict('Payment changed meanwhile; reload and try again');
  if (revokeDays && payment.userId) {
    await revokeUser(payment.userId, { days: revokeDays, note: `Refund ${payment.providerOrderId}: ${note}`, adminId: admin._id });
  }
  await logActivity(admin, 'payment.refunded', {
    entityType: 'payment',
    entityId: payment._id,
    summary: `Marked ${payment.providerOrderId} refunded${revokeDays ? `, removed ${revokeDays} days` : ''}`,
    details: { note },
  });
  return json({ payment: serializePayment(await db.collection('payments').findOne({ _id: payment._id })) });
});
