import { getDb } from '@/lib/db';
import { json, route, badRequest, notFound } from '@/lib/api';
import { publicPaymentStatus } from '@/lib/payments';
import { maskEmail } from '@/lib/users';
import { clientIp, hashKey, hit } from '@/lib/rateLimit';

// Public: polled by /buy/status?order=. Shows only a coarse status and a masked email.
export const GET = route(async (request) => {
  // Polling every few seconds for several minutes stays well inside this.
  await hit(`status:ip:${hashKey(clientIp(request))}`, 600, 3600);
  const orderId = (request.nextUrl.searchParams.get('order') || '').trim();
  if (!orderId || orderId.length > 64) throw badRequest('Order is required');
  const db = await getDb();
  const payment = await db.collection('payments').findOne(
    { providerOrderId: orderId },
    { projection: { status: 1, 'customer.email': 1, provider: 1 } }
  );
  if (!payment) throw notFound('Order not found');
  const status = publicPaymentStatus(payment.status);
  const out = { status, provider: payment.provider };
  if (status === 'fulfilled' || payment.status === 'paid' || payment.status === 'needs_review') out.maskedEmail = maskEmail(payment.customer?.email);
  // Paid, but the owner must finish it by hand.
  if (payment.status === 'needs_review') out.needsReview = true;
  return json(out);
});
