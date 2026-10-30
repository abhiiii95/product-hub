import { getDb, toObjectId } from '@/lib/db';
import { json, readJson, route, badRequest, conflict, notFound } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { buildCouponInput, serializeCoupon } from '@/lib/coupons';
import { existingCategoryIds } from '@/lib/subscriptions';
import { logActivity } from '@/lib/activity';

const EDITABLE = ['code', 'kind', 'value', 'plans', 'maxUses', 'maxUsesPerEmail', 'allowedEmails', 'expiresAt', 'isActive', 'grants', 'note'];

async function loadCoupon(id) {
  const objectId = toObjectId(id);
  if (!objectId) throw notFound('Coupon not found');
  const db = await getDb();
  const coupon = await db.collection('coupons').findOne({ _id: objectId });
  if (!coupon) throw notFound('Coupon not found');
  return coupon;
}

export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const coupon = await loadCoupon(params.id);
  const input = buildCouponInput(await readJson(request), { isCreate: false, existing: coupon });
  const set = {};
  for (const key of EDITABLE) if (input[key] !== undefined) set[key] = input[key];
  if (Object.keys(set).length === 0) throw badRequest('No changes provided');
  if (Array.isArray(set.grants?.categoryAccess)) {
    const found = await existingCategoryIds(set.grants.categoryAccess);
    if (found.length !== set.grants.categoryAccess.length) throw badRequest('Unknown category in coupon access', { grants: 'Unknown category' });
    set.grants.categoryAccess = found;
  }
  const db = await getDb();
  if (set.code && set.code !== coupon.code) {
    // Buyers may already hold a used code; renaming it would confuse the history.
    if (coupon.usedCount > 0) throw conflict('A used coupon cannot be renamed');
    if (await db.collection('coupons').findOne({ code: set.code })) throw conflict('A coupon with this code already exists');
  }
  set.updatedAt = new Date();
  const updated = await db.collection('coupons').findOneAndUpdate({ _id: coupon._id }, { $set: set }, { returnDocument: 'after' });
  await logActivity(admin, 'coupon.updated', {
    entityType: 'coupon',
    entityId: coupon._id,
    summary: `Updated coupon ${updated.code}: ${Object.keys(set).filter((k) => k !== 'updatedAt').join(', ')}`,
  });
  return json({ coupon: serializeCoupon(updated) });
});

// Only unused coupons can be deleted; used ones are deactivated instead to keep payment history readable.
export const DELETE = route(async (request, params) => {
  const admin = await requireAdmin();
  const coupon = await loadCoupon(params.id);
  const db = await getDb();
  // Unpaid orders holding a use would later point at a missing coupon.
  const res = await db.collection('coupons').deleteOne({ _id: coupon._id, usedCount: { $in: [0, null] }, reservedCount: { $in: [0, null] } });
  if (res.deletedCount === 0) throw conflict('This coupon has been used or is held by an open order. Deactivate it instead.');
  await logActivity(admin, 'coupon.deleted', { entityType: 'coupon', entityId: coupon._id, summary: `Deleted coupon ${coupon.code}` });
  return json({ ok: true });
});
