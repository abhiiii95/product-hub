import { getDb, toObjectId } from '@/lib/db';
import { json, readJson, route, badRequest, notFound } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { Validator } from '@/lib/validate';
import { ROLES } from '@/lib/constants';
import { planState } from '@/lib/access';
import { PLAN_CODES } from '@/lib/plans';
import { compUser, extendUser, revokeUser } from '@/lib/subscriptions';
import { serializeUser } from '@/lib/users';
import { logActivity } from '@/lib/activity';

// Admin: { action: 'extend'|'comp'|'revoke', days, note, planCode? }.
//   extend: add days on top of the current end, plan source unchanged.
//   comp:   free days (also starts a plan for a user without one). planCode optional.
//   revoke: remove `days`, or end the plan now when days is empty.
export const POST = route(async (request, params) => {
  const admin = await requireAdmin();
  const objectId = toObjectId(params.id);
  if (!objectId) throw notFound('User not found');
  const db = await getDb();
  const target = await db.collection('users').findOne({ _id: objectId }, { projection: { role: 1, name: 1 } });
  if (!target) throw notFound('User not found');
  if (target.role !== ROLES.LISTING_USER) throw badRequest('Plans apply to resellers only');

  const body = await readJson(request);
  const v = new Validator();
  const action = v.oneOf('action', body.action, ['extend', 'comp', 'revoke'], { label: 'Action' });
  const days = v.number('days', body.days, { required: action !== 'revoke', integer: true, min: 1, max: 3650, label: 'Days' });
  const note = v.string('note', body.note, { max: 500, label: 'Note' });
  const planCode = v.oneOf('planCode', body.planCode, PLAN_CODES, { required: false, label: 'Plan' });
  v.assert();

  let user;
  if (action === 'extend') user = await extendUser(objectId, days, note, admin._id);
  else if (action === 'comp') user = await compUser(objectId, days, note, admin._id, { planCode: planCode || undefined });
  else user = await revokeUser(objectId, { days, note, adminId: admin._id });

  await logActivity(admin, `plan.${action}`, {
    entityType: 'user',
    entityId: objectId,
    summary: `${action === 'revoke' ? 'Revoked' : action === 'comp' ? 'Comped' : 'Extended'} plan for ${target.name}${days ? ` (${days} days)` : ''}`,
    details: { note: note || null, planCode: planCode || null },
  });
  return json({ user: serializeUser(user), plan: planState(user) });
});
