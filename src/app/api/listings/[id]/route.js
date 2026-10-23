import { getDb } from '@/lib/db';
import { json, readJson, route, badRequest, forbidden } from '@/lib/api';
import { requireUser, requireAdmin, isAdmin } from '@/lib/auth';
import { buildListingContent, loadListingForUser, serializeListing } from '@/lib/listings';
import { LISTING_STATUSES, LISTING_STATUS_LABELS } from '@/lib/constants';
import { logActivity } from '@/lib/activity';

// Workflow fields a listing user is explicitly permitted to change.
const LISTING_USER_FIELDS = ['status'];

export const GET = route(async (request, params) => {
  const user = await requireUser();
  const { listing, product } = await loadListingForUser(params.id, user);
  return json({ listing: serializeListing(listing, { product }) });
});

export const PATCH = route(async (request, params) => {
  const user = await requireUser();
  const { listing, product } = await loadListingForUser(params.id, user);
  const body = await readJson(request);
  let set;

  if (isAdmin(user)) {
    set = buildListingContent(body);
  } else {
    const disallowed = Object.keys(body).filter((key) => !LISTING_USER_FIELDS.includes(key));
    if (disallowed.length) throw forbidden(`Listing users can only update the listing status (not: ${disallowed.join(', ')})`);
    if (!LISTING_STATUSES.includes(body.status)) throw badRequest('Invalid listing status');
    set = { status: body.status };
  }

  const db = await getDb();
  await db
    .collection('marketplaceListings')
    .updateOne({ _id: listing._id }, { $set: { ...set, updatedAt: new Date(), updatedBy: user._id, updatedByName: user.name } });

  if (set.status && set.status !== listing.status) {
    await logActivity(user, 'listing.status', {
      entityType: 'listing',
      entityId: listing._id,
      summary: `${product.name} (${listing.marketplace}): ${LISTING_STATUS_LABELS[listing.status]} → ${LISTING_STATUS_LABELS[set.status]}`,
    });
  } else if (isAdmin(user)) {
    await logActivity(user, 'listing.updated', { entityType: 'listing', entityId: listing._id, summary: `Edited ${listing.marketplace} listing content for ${product.name}` });
  }
  const updated = await db.collection('marketplaceListings').findOne({ _id: listing._id });
  return json({ listing: serializeListing(updated, { product }) });
});

export const DELETE = route(async (request, params) => {
  const admin = await requireAdmin();
  const { listing, product } = await loadListingForUser(params.id, admin);
  const db = await getDb();
  await db.collection('marketplaceListings').deleteOne({ _id: listing._id });
  await logActivity(admin, 'listing.deleted', { entityType: 'listing', entityId: listing._id, summary: `Deleted ${listing.marketplace} listing for ${product.name}` });
  return json({ ok: true });
});
