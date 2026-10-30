import { getDb } from '@/lib/db';
import { json, readJson, route } from '@/lib/api';
import { requireUser, requireAdmin } from '@/lib/auth';
import { buildListingContent, loadListingForUser, serializeListing } from '@/lib/listings';
import { LISTING_STATUS_LABELS } from '@/lib/constants';
import { logActivity } from '@/lib/activity';

export const GET = route(async (request, params) => {
  const user = await requireUser();
  const { listing, product } = await loadListingForUser(params.id, user);
  return json({ listing: serializeListing(listing, { product, user }) });
});

// Shared listings are admin-write only: resellers track their own status in /api/my-listings.
export const PATCH = route(async (request, params) => {
  const user = await requireAdmin();
  const { listing, product } = await loadListingForUser(params.id, user);
  const body = await readJson(request);
  const set = buildListingContent(body);

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
  } else {
    await logActivity(user, 'listing.updated', { entityType: 'listing', entityId: listing._id, summary: `Edited ${listing.marketplace} listing content for ${product.name}` });
  }
  const updated = await db.collection('marketplaceListings').findOne({ _id: listing._id });
  return json({ listing: serializeListing(updated, { product, user }) });
});

export const DELETE = route(async (request, params) => {
  const admin = await requireAdmin();
  const { listing, product } = await loadListingForUser(params.id, admin);
  const db = await getDb();
  await db.collection('marketplaceListings').deleteOne({ _id: listing._id });
  await logActivity(admin, 'listing.deleted', { entityType: 'listing', entityId: listing._id, summary: `Deleted ${listing.marketplace} listing for ${product.name}` });
  return json({ ok: true });
});
