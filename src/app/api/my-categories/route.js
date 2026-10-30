import { getDb, toObjectId } from '@/lib/db';
import { json, readJson, route, badRequest } from '@/lib/api';
import { requireReseller } from '@/lib/auth';
import { categoryScope, normaliseIds, selfLimit } from '@/lib/access';
import { logActivity } from '@/lib/activity';

const CHANGE_GAP_MS = 7 * 24 * 60 * 60 * 1000;

// When the reseller may next change their picks; null means "now".
// The first pick (nothing picked yet) has no wait, matching fulfilPayment's rule.
function nextChangeAt(access, now = new Date()) {
  if (!access?.selfChangedAt || !normaliseIds(access.selfCategoryIds).length) return null;
  const at = new Date(new Date(access.selfChangedAt).getTime() + CHANGE_GAP_MS);
  return at > now ? at : null;
}

const ids = (values) => normaliseIds(values).map((id) => id.toString());

export const GET = route(async () => {
  const user = await requireReseller();
  const access = user.categoryAccess || {};
  const db = await getDb();
  const [categories, counts] = await Promise.all([
    db.collection('categories').find({ isActive: { $ne: false } }, { projection: { name: 1 } }).sort({ name: 1 }).toArray(),
    db
      .collection('products')
      .aggregate([{ $match: { status: 'active', categoryId: { $ne: null } } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }])
      .toArray(),
  ]);
  const countById = Object.fromEntries(counts.map((r) => [String(r._id), r.count]));
  return json({
    limit: selfLimit(user),
    selfCategoryIds: ids(access.selfCategoryIds),
    adminCategoryIds: ids(access.adminCategoryIds),
    adminMode: access.adminMode === 'all' ? 'all' : 'selected',
    all: categoryScope(user).all,
    canChangeAt: nextChangeAt(access),
    categories: categories.map((c) => ({ id: c._id.toString(), name: c.name, productCount: countById[c._id.toString()] || 0 })),
  });
});

// Replace the reseller's own picks. Admin grants (adminCategoryIds/adminMode) are never touched.
export const PUT = route(async (request) => {
  const user = await requireReseller();
  const body = await readJson(request);
  if (!Array.isArray(body.categoryIds)) throw badRequest('Choose your categories');
  const limit = selfLimit(user);
  if (limit === 0) throw badRequest('Your plan does not let you pick categories');

  const requested = [];
  for (const raw of body.categoryIds) {
    const objectId = toObjectId(typeof raw === 'string' ? raw : '');
    if (!objectId) throw badRequest('One of the selected categories is not valid');
    if (!requested.some((id) => id.equals(objectId))) requested.push(objectId);
  }
  if (requested.length > limit) throw badRequest(`You can pick up to ${limit} categories`);

  const db = await getDb();
  const found = requested.length
    ? await db.collection('categories').countDocuments({ _id: { $in: requested }, isActive: { $ne: false } })
    : 0;
  if (found !== requested.length) throw badRequest('One of the selected categories is not available');

  const access = user.categoryAccess && typeof user.categoryAccess === 'object' ? user.categoryAccess : null;
  const current = ids(access?.selfCategoryIds);
  const next = requested.map((id) => id.toString());
  const unchanged = current.length === next.length && next.every((id) => current.includes(id));
  if (unchanged) return json({ ok: true, selfCategoryIds: current, canChangeAt: nextChangeAt(access) });

  const waitUntil = nextChangeAt(access);
  if (waitUntil) throw badRequest('You can change your categories once every 7 days', { code: 'change_too_soon', canChangeAt: waitUntil });

  const now = new Date();
  // Guard on the old selfChangedAt so two quick requests cannot both pass the 7-day check.
  const filter = { _id: user._id, 'categoryAccess.selfChangedAt': access?.selfChangedAt ?? null };
  const update = access
    ? { $set: { 'categoryAccess.selfCategoryIds': requested, 'categoryAccess.selfChangedAt': now, 'categoryAccess.updatedAt': now } }
    : // No categoryAccess object yet (or null): create it so dotted paths are not written into null.
      { $set: { categoryAccess: { adminMode: 'selected', adminCategoryIds: [], selfCategoryIds: requested, selfChangedAt: now, updatedAt: now } } };
  if (!access) filter.$or = [{ categoryAccess: null }, { categoryAccess: { $exists: false } }];
  const result = await db.collection('users').updateOne(filter, update);
  if (!result.matchedCount) throw badRequest('Your categories were just changed. Reload and try again.');

  await logActivity(user, 'access.self_categories', {
    entityType: 'user',
    entityId: user._id,
    summary: `${user.name} picked ${next.length} categor${next.length === 1 ? 'y' : 'ies'}`,
  });
  return json({ ok: true, selfCategoryIds: next, canChangeAt: new Date(now.getTime() + CHANGE_GAP_MS) });
});
