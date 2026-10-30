import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { json, readJson, route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { loadListingForUser } from '@/lib/listings';
import { Validator } from '@/lib/validate';
import { logActivity } from '@/lib/activity';

// Admin-only: shared notes would let resellers see each other. Resellers keep
// private notes in /api/my-listings/[productId]/notes. Notes are never overwritten.
export const POST = route(async (request, params) => {
  const user = await requireAdmin();
  const { listing, product } = await loadListingForUser(params.id, user);
  const body = await readJson(request);
  const v = new Validator();
  const text = v.string('text', body.text, { required: true, max: 2000, label: 'Note' });
  v.assert();
  const note = { id: randomBytes(8).toString('hex'), text, userId: user._id, userName: user.name, createdAt: new Date() };
  const db = await getDb();
  await db
    .collection('marketplaceListings')
    .updateOne({ _id: listing._id }, { $push: { notes: note }, $set: { updatedAt: note.createdAt, updatedBy: user._id, updatedByName: user.name } });
  await logActivity(user, 'listing.note', { entityType: 'listing', entityId: listing._id, summary: `Note on ${product.name} (${listing.marketplace}): ${text.slice(0, 80)}` });
  return json({ note: { id: note.id, text, userName: note.userName, createdAt: note.createdAt } }, { status: 201 });
});
