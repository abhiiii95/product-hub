import { getDb, toObjectId } from '@/lib/db';
import { json, readJson, route, notFound, badRequest, conflict } from '@/lib/api';
import { requireAdmin, destroyUserSessions } from '@/lib/auth';
import { hashPassword, validateNewPassword } from '@/lib/password';
import { Validator } from '@/lib/validate';
import { ROLES } from '@/lib/constants';
import { logActivity } from '@/lib/activity';
import { planState } from '@/lib/access';
import { applyAdminAccess, compUser, resolveAdminAccess } from '@/lib/subscriptions';
import { normalizePhone, serializeUser } from '@/lib/users';
import { cancelQueued } from '@/lib/outbox';

async function loadUser(id) {
  const objectId = toObjectId(id);
  if (!objectId) throw notFound('User not found');
  const db = await getDb();
  const user = await db.collection('users').findOne({ _id: objectId });
  if (!user) throw notFound('User not found');
  return user;
}

export const GET = route(async (request, params) => {
  await requireAdmin();
  const user = await loadUser(params.id);
  return json({ user: { ...serializeUser(user), plan: planState(user) } });
});

// Admin edits details, activates/deactivates, or resets a password.
// Resellers also accept phone, compDays (free plan days), adminMode and adminCategoryIds.
export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const target = await loadUser(params.id);
  const body = await readJson(request);
  const v = new Validator();
  const set = { updatedAt: new Date() };
  const changes = [];

  if (body.name !== undefined) {
    set.name = v.string('name', body.name, { required: true, max: 100, label: 'Name' });
    changes.push('name');
  }
  if (body.email !== undefined) {
    set.email = v.email('email', body.email);
    changes.push('email');
  }
  if (body.role !== undefined) {
    set.role = v.oneOf('role', body.role, Object.values(ROLES), { label: 'Role' });
    changes.push('role');
  }
  if (body.isActive !== undefined) {
    set.isActive = body.isActive === true;
    changes.push(set.isActive ? 'activated' : 'deactivated');
  }
  if (body.password !== undefined) {
    const problem = validateNewPassword(body.password);
    if (problem) v.fail('password', problem);
    else {
      set.passwordHash = await hashPassword(body.password);
      set.mustChangePassword = true;
      // The admin now knows the password, so any stored temporary one is obsolete.
      set.pendingCredential = null;
    }
    changes.push('password reset');
  }
  if (body.phone !== undefined) {
    if (body.phone === null || body.phone === '') set.phone = null;
    else {
      set.phone = normalizePhone(body.phone);
      if (!set.phone) v.fail('phone', 'Enter a valid 10-digit Indian mobile number');
    }
    changes.push('phone');
  }
  const compDays = v.number('compDays', body.compDays, { integer: true, min: 1, max: 3650, label: 'Free days' });
  if (compDays) changes.push(`${compDays} free days`);
  const accessRequested = body.adminMode !== undefined || body.adminCategoryIds !== undefined;
  if (accessRequested) changes.push('category access');
  v.assert();
  if (changes.length === 0) throw badRequest('No changes provided');
  const finalRole = set.role || target.role;
  if ((compDays || accessRequested) && finalRole !== ROLES.LISTING_USER) {
    throw badRequest('Plan and category access apply to resellers only');
  }
  const access = accessRequested ? await resolveAdminAccess({ adminMode: body.adminMode, adminCategoryIds: body.adminCategoryIds }) : null;

  const isSelf = target._id.equals(admin._id);
  if (isSelf && set.isActive === false) throw badRequest('You cannot deactivate your own account');
  if (isSelf && set.role && set.role !== ROLES.ADMIN) throw badRequest('You cannot remove your own admin role');

  const db = await getDb();
  if (set.email && set.email !== target.email && (await db.collection('users').findOne({ email: set.email }))) {
    throw conflict('A user with this email already exists');
  }

  await db.collection('users').updateOne({ _id: target._id }, { $set: set });
  if (access) await applyAdminAccess(target._id, access);
  if (compDays) await compUser(target._id, compDays, 'Free days from user edit', admin._id);
  // An unsent welcome mail would carry the temporary password the admin just replaced.
  if (set.passwordHash) await cancelQueued(target._id, 'welcome');
  // Deactivation, password resets and role changes end existing sessions immediately.
  if (set.isActive === false || set.passwordHash || (set.role && set.role !== target.role)) {
    await destroyUserSessions(target._id);
  }
  await logActivity(admin, 'user.updated', {
    entityType: 'user',
    entityId: target._id,
    summary: `Updated user ${set.name || target.name}: ${changes.join(', ')}`,
  });
  const updated = await db.collection('users').findOne({ _id: target._id });
  return json({ user: { ...serializeUser(updated), plan: planState(updated) } });
});

// Permanently removes an account (e.g. created by mistake). Admins cannot delete themselves.
export const DELETE = route(async (request, params) => {
  const admin = await requireAdmin();
  const target = await loadUser(params.id);
  if (target._id.equals(admin._id)) throw badRequest('You cannot delete your own account');
  const db = await getDb();
  await destroyUserSessions(target._id);
  await db.collection('users').deleteOne({ _id: target._id });
  await logActivity(admin, 'user.deleted', { entityType: 'user', entityId: target._id, summary: `Deleted user ${target.name} (${target.email})` });
  return json({ ok: true });
});
