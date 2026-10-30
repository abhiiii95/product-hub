import { getDb, toObjectId } from '@/lib/db';
import { json, readJson, route, badRequest, notFound } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { planState } from '@/lib/access';
import { applyAdminAccess, resolveAdminAccess } from '@/lib/subscriptions';
import { serializeUser } from '@/lib/users';
import { logActivity } from '@/lib/activity';

// Admin: { adminMode: 'all'|'selected', adminCategoryIds: [id] }. The reseller's own picks are untouched.
export const PUT = route(async (request, params) => {
  const admin = await requireAdmin();
  const objectId = toObjectId(params.id);
  if (!objectId) throw notFound('User not found');
  const db = await getDb();
  const target = await db.collection('users').findOne({ _id: objectId }, { projection: { role: 1, name: 1 } });
  if (!target) throw notFound('User not found');
  if (target.role !== ROLES.LISTING_USER) throw badRequest('Category access applies to resellers only');

  const body = await readJson(request);
  const access = await resolveAdminAccess({
    adminMode: body.adminMode ?? 'selected',
    adminCategoryIds: body.adminCategoryIds ?? [],
  });
  await applyAdminAccess(objectId, access);
  await logActivity(admin, 'user.access', {
    entityType: 'user',
    entityId: objectId,
    summary: `Set category access for ${target.name}: ${access.adminMode === 'all' ? 'all categories' : `${access.adminCategoryIds.length} granted`}`,
  });
  const user = await db.collection('users').findOne({ _id: objectId }, { projection: { passwordHash: 0 } });
  return json({ user: serializeUser(user), plan: planState(user) });
});
