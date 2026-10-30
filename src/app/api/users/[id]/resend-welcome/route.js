import { after } from 'next/server';
import { getDb, toObjectId } from '@/lib/db';
import { json, route, badRequest, notFound } from '@/lib/api';
import { requireAdmin, destroyUserSessions } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { issueTempPassword, queueWelcome } from '@/lib/subscriptions';
import { cancelQueued, drain } from '@/lib/outbox';
import { serializeUser } from '@/lib/users';
import { logActivity } from '@/lib/activity';

// Admin: new temporary password (old one stops working) and a fresh welcome email.
export const POST = route(async (request, params) => {
  const admin = await requireAdmin();
  const objectId = toObjectId(params.id);
  if (!objectId) throw notFound('User not found');
  const db = await getDb();
  const target = await db.collection('users').findOne({ _id: objectId }, { projection: { role: 1, isActive: 1, name: 1 } });
  if (!target) throw notFound('User not found');
  if (target.role !== ROLES.LISTING_USER) throw badRequest('Welcome emails are for resellers only');
  if (!target.isActive) throw badRequest('Activate the account first');

  const { user, tempPassword } = await issueTempPassword(objectId);
  await destroyUserSessions(objectId);
  // Older unsent welcome mails carry a password that no longer works.
  await cancelQueued(objectId, 'welcome');
  await queueWelcome(user, tempPassword, `welcome:resend:${objectId}:${Date.now()}`);
  after(() => drain({ max: 5, budgetMs: 15000 }).catch((err) => console.error('[outbox] drain failed', err?.message)));
  await logActivity(admin, 'user.resend_welcome', { entityType: 'user', entityId: objectId, summary: `Sent a new welcome email to ${target.name}` });
  return json({ ok: true, user: serializeUser(user) });
});
