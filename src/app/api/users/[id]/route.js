import { getDb, toObjectId } from '@/lib/db';
import { json, readJson, route, notFound, badRequest, conflict } from '@/lib/api';
import { requireAdmin, destroyUserSessions } from '@/lib/auth';
import { hashPassword, validateNewPassword } from '@/lib/password';
import { Validator } from '@/lib/validate';
import { ROLES } from '@/lib/constants';
import { logActivity } from '@/lib/activity';
import { serializeUser } from '@/lib/users';

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
  return json({ user: serializeUser(await loadUser(params.id)) });
});

// Admin edits details, activates/deactivates, or resets a password.
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
    }
    changes.push('password reset');
  }
  v.assert();
  if (changes.length === 0) throw badRequest('No changes provided');

  const isSelf = target._id.equals(admin._id);
  if (isSelf && set.isActive === false) throw badRequest('You cannot deactivate your own account');
  if (isSelf && set.role && set.role !== ROLES.ADMIN) throw badRequest('You cannot remove your own admin role');

  const db = await getDb();
  if (set.email && set.email !== target.email && (await db.collection('users').findOne({ email: set.email }))) {
    throw conflict('A user with this email already exists');
  }

  await db.collection('users').updateOne({ _id: target._id }, { $set: set });
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
  return json({ user: serializeUser(updated) });
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
