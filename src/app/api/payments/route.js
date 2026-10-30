import { getDb } from '@/lib/db';
import { json, route, badRequest } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { escapeRegex, parsePaging } from '@/lib/validate';
import { paymentMode, serializePayment } from '@/lib/payments';

const STATUSES = ['created', 'paid', 'fulfilled', 'failed', 'abandoned', 'refunded', 'needs_review'];

export const GET = route(async (request) => {
  await requireAdmin();
  const params = request.nextUrl.searchParams;
  const status = params.get('status') || '';
  const q = (params.get('q') || '').trim().slice(0, 100);
  const filter = {};
  if (status) {
    if (!STATUSES.includes(status)) throw badRequest('Unknown status');
    filter.status = status;
  }
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ 'customer.email': re }, { 'customer.phone': re }, { 'customer.name': re }, { providerOrderId: re }, { providerPaymentId: re }];
  }
  const { page, limit, skip } = parsePaging(params, { defaultLimit: 50, maxLimit: 200 });
  const db = await getDb();
  const [items, total] = await Promise.all([
    db.collection('payments').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    db.collection('payments').countDocuments(filter),
  ]);
  let mode = null;
  try {
    mode = paymentMode();
  } catch {}
  return json({ items: items.map(serializePayment), total, page, limit, mode });
});
