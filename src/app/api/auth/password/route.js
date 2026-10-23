import { getDb } from '@/lib/db';
import { json, readJson, route, badRequest } from '@/lib/api';
import { requireUser, destroyUserSessions } from '@/lib/auth';
import { hashPassword, verifyPassword, validateNewPassword } from '@/lib/password';
import { logActivity } from '@/lib/activity';

// Lets the signed-in user change their own password (the only self-service account change).
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = await readJson(request);
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!(await verifyPassword(current, user.passwordHash))) throw badRequest('Current password is incorrect');
  const problem = validateNewPassword(next);
  if (problem) throw badRequest(problem);
  if (next === current) throw badRequest('New password must be different from the current password');

  const db = await getDb();
  await db.collection('users').updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() } }
  );
  await destroyUserSessions(user._id, { exceptCurrent: true });
  await logActivity(user, 'user.password_changed', { entityType: 'user', entityId: user._id, summary: `${user.name} changed their password` });
  return json({ ok: true });
});
