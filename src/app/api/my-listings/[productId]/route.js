import { getDb } from '@/lib/db';
import { json, readJson, route, badRequest, notFound } from '@/lib/api';
import { requireReseller } from '@/lib/auth';
import { loadProductForUser, requireObjectId } from '@/lib/products';
import { serializeTracker, upsertTracker } from '@/lib/listings';
import { DEFAULT_MARKETPLACE, RESELLER_LISTING_STATUSES, RESELLER_LISTING_STATUS_LABELS, RESELLER_PORTALS } from '@/lib/constants';
import { Validator } from '@/lib/validate';
import { logActivity } from '@/lib/activity';

// Set the reseller's own status for a product on one portal (record created if missing).
// The owner is always the session user; any userId in the body is ignored.
export const PUT = route(async (request, params) => {
  const user = await requireReseller();
  const product = await loadProductForUser(params.productId, user);
  const body = await readJson(request);
  const v = new Validator();
  const portal = v.oneOf('portal', body.portal, RESELLER_PORTALS, { required: false, fallback: DEFAULT_MARKETPLACE, label: 'Portal' });
  const status = v.oneOf('status', body.status, RESELLER_LISTING_STATUSES, { label: 'Status' });
  const portalLabel = v.string('portalLabel', body.portalLabel, { max: 40, label: 'Portal name' });
  v.assert();

  const set = { status };
  // A custom name only makes sense for "other" portals.
  if (portal === 'other' && body.portalLabel !== undefined) set.portalLabel = portalLabel;
  const tracker = await upsertTracker({ userId: user._id, productId: product._id, portal }, { $set: set });
  await logActivity(user, 'tracker.status', {
    entityType: 'product',
    entityId: product._id,
    summary: `${user.name} marked ${product.name} (${portal}) as ${RESELLER_LISTING_STATUS_LABELS[status]}`,
  });
  return json({ tracker: serializeTracker(tracker, { product }) });
});

// Remove the reseller's own record. No scope check: deleting your own data reveals nothing.
export const DELETE = route(async (request, params) => {
  const user = await requireReseller();
  const productId = requireObjectId(params.productId, 'product id');
  const portal = request.nextUrl.searchParams.get('portal') || DEFAULT_MARKETPLACE;
  if (!RESELLER_PORTALS.includes(portal)) throw badRequest('Portal is not valid');
  const db = await getDb();
  const { deletedCount } = await db.collection('resellerListings').deleteOne({ userId: user._id, productId, portal });
  if (!deletedCount) throw notFound('Tracker entry not found');
  await logActivity(user, 'tracker.deleted', { entityType: 'product', entityId: productId, summary: `${user.name} removed a ${portal} tracker entry` });
  return json({ ok: true });
});
