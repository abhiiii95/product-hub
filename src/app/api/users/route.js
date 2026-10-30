import { getDb } from '@/lib/db';
import { json, readJson, route, conflict, badRequest } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { hashPassword, validateNewPassword } from '@/lib/password';
import { Validator } from '@/lib/validate';
import { ROLES } from '@/lib/constants';
import { logActivity } from '@/lib/activity';
import { planState } from '@/lib/access';
import { compUser, resolveAdminAccess } from '@/lib/subscriptions';
import { defaultCategoryAccess, defaultEmailPrefs, normalizePhone, serializeUser } from '@/lib/users';

export const GET = route(async () => {
  await requireAdmin();
  const db = await getDb();
  const users = await db
    .collection('users')
    .find({}, { projection: { passwordHash: 0, pendingCredential: 0 } })
    .sort({ role: 1, createdAt: 1 })
    .toArray();
  return json({ users: users.map((u) => ({ ...serializeUser(u), plan: planState(u) })) });
});

// The admin-side way accounts are created (buyers are created by payment fulfilment).
// Optional for resellers: phone, compDays (free plan days), adminMode, adminCategoryIds.
export const POST = route(async (request) => {
  const admin = await requireAdmin();
  const body = await readJson(request);
  const v = new Validator();
  const name = v.string('name', body.name, { required: true, max: 100, label: 'Name' });
  const email = v.email('email', body.email);
  const role = v.oneOf('role', body.role, Object.values(ROLES), { required: false, fallback: ROLES.LISTING_USER, label: 'Role' });
  const passwordProblem = validateNewPassword(body.password);
  if (passwordProblem) v.fail('password', passwordProblem);
  let phone = null;
  if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
    phone = normalizePhone(body.phone);
    if (!phone) v.fail('phone', 'Enter a valid 10-digit Indian mobile number');
  }
  const compDays = v.number('compDays', body.compDays, { integer: true, min: 1, max: 3650, label: 'Free days' });
  v.assert();
  const reseller = role === ROLES.LISTING_USER;
  if (!reseller && (compDays || body.adminMode !== undefined || body.adminCategoryIds !== undefined)) {
    throw badRequest('Plan and category access apply to resellers only');
  }
  const access = reseller ? await resolveAdminAccess({ adminMode: body.adminMode, adminCategoryIds: body.adminCategoryIds }) : {};

  const db = await getDb();
  if (await db.collection('users').findOne({ email })) throw conflict('A user with this email already exists');
  const now = new Date();
  const categoryAccess = defaultCategoryAccess(now);
  if (access.adminMode) categoryAccess.adminMode = access.adminMode;
  if (access.adminCategoryIds) categoryAccess.adminCategoryIds = access.adminCategoryIds;
  const doc = {
    name,
    email,
    phone,
    role,
    passwordHash: await hashPassword(body.password),
    isActive: true,
    mustChangePassword: true,
    source: 'admin',
    planEndsAt: null,
    planStartedAt: null,
    planCode: null,
    planSource: null,
    allAccessUntil: null,
    categoryAccess,
    launchOfferUsedAt: null,
    pendingCredential: null,
    emailPrefs: defaultEmailPrefs(),
    createdAt: now,
    updatedAt: now,
    createdBy: admin._id,
    lastLoginAt: null,
  };
  const { insertedId } = await db.collection('users').insertOne(doc);
  let user = { ...doc, _id: insertedId };
  if (compDays) user = await compUser(insertedId, compDays, 'Free days when the account was created', admin._id);
  await logActivity(admin, 'user.created', {
    entityType: 'user',
    entityId: insertedId,
    summary: `Created ${role === ROLES.ADMIN ? 'admin' : 'reseller'} ${name}${compDays ? ` with ${compDays} free days` : ''}`,
  });
  return json({ user: { ...serializeUser(user), plan: planState(user) } }, { status: 201 });
});
