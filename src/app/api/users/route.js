import { getDb } from '@/lib/db';
import { json, readJson, route, conflict } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { hashPassword, validateNewPassword } from '@/lib/password';
import { Validator } from '@/lib/validate';
import { ROLES } from '@/lib/constants';
import { logActivity } from '@/lib/activity';
import { serializeUser } from '@/lib/users';

export const GET = route(async () => {
  await requireAdmin();
  const db = await getDb();
  const users = await db
    .collection('users')
    .find({}, { projection: { passwordHash: 0 } })
    .sort({ role: 1, createdAt: 1 })
    .toArray();
  return json({ users: users.map(serializeUser) });
});

// The ONLY way accounts are created in the app: an authenticated Admin request.
export const POST = route(async (request) => {
  const admin = await requireAdmin();
  const body = await readJson(request);
  const v = new Validator();
  const name = v.string('name', body.name, { required: true, max: 100, label: 'Name' });
  const email = v.email('email', body.email);
  const role = v.oneOf('role', body.role, Object.values(ROLES), { required: false, fallback: ROLES.LISTING_USER, label: 'Role' });
  const passwordProblem = validateNewPassword(body.password);
  if (passwordProblem) v.fail('password', passwordProblem);
  v.assert();

  const db = await getDb();
  if (await db.collection('users').findOne({ email })) throw conflict('A user with this email already exists');
  const now = new Date();
  const doc = {
    name,
    email,
    role,
    passwordHash: await hashPassword(body.password),
    isActive: true,
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
    createdBy: admin._id,
    lastLoginAt: null,
  };
  const { insertedId } = await db.collection('users').insertOne(doc);
  await logActivity(admin, 'user.created', { entityType: 'user', entityId: insertedId, summary: `Created ${role === ROLES.ADMIN ? 'admin' : 'listing user'} ${name}` });
  return json({ user: serializeUser({ ...doc, _id: insertedId }) }, { status: 201 });
});
