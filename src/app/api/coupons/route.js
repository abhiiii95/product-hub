import { getDb } from '@/lib/db';
import { json, readJson, route, badRequest, conflict } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { buildCouponInput, serializeCoupon } from '@/lib/coupons';
import { existingCategoryIds } from '@/lib/subscriptions';
import { logActivity } from '@/lib/activity';

// Category ids in a coupon grant must exist.
async function checkGrantCategories(doc) {
  const ids = doc.grants?.categoryAccess;
  if (!Array.isArray(ids)) return;
  const found = await existingCategoryIds(ids);
  if (found.length !== ids.length) throw badRequest('Unknown category in coupon access', { grants: 'Unknown category' });
  doc.grants.categoryAccess = found;
}

export const GET = route(async () => {
  await requireAdmin();
  const db = await getDb();
  const coupons = await db.collection('coupons').find({}).sort({ createdAt: -1 }).limit(500).toArray();
  return json({ coupons: coupons.map(serializeCoupon) });
});

export const POST = route(async (request) => {
  const admin = await requireAdmin();
  const input = buildCouponInput(await readJson(request), { isCreate: true });
  await checkGrantCategories(input);
  const db = await getDb();
  if (await db.collection('coupons').findOne({ code: input.code })) throw conflict('A coupon with this code already exists');
  const now = new Date();
  const doc = {
    code: input.code,
    kind: input.kind,
    value: input.value,
    plans: input.plans,
    maxUses: input.maxUses,
    usedCount: 0,
    reservedCount: 0,
    maxUsesPerEmail: input.maxUsesPerEmail,
    allowedEmails: input.allowedEmails,
    expiresAt: input.expiresAt,
    isActive: input.isActive,
    grants: input.grants,
    note: input.note,
    createdBy: admin._id,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await db.collection('coupons').insertOne(doc);
  await logActivity(admin, 'coupon.created', { entityType: 'coupon', entityId: insertedId, summary: `Created coupon ${doc.code}` });
  return json({ coupon: serializeCoupon({ ...doc, _id: insertedId }) }, { status: 201 });
});
