import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { json, readJson, route, badRequest } from '@/lib/api';
import { requireReseller } from '@/lib/auth';
import { loadProductForUser } from '@/lib/products';
import { MAX_TRACKER_NOTES, upsertTracker } from '@/lib/listings';
import { DEFAULT_MARKETPLACE, RESELLER_PORTALS } from '@/lib/constants';
import { Validator } from '@/lib/validate';

// Private note on the reseller's own tracker record. Full lists are refused
// rather than silently dropping old notes.
export const POST = route(async (request, params) => {
  const user = await requireReseller();
  const product = await loadProductForUser(params.productId, user);
  const body = await readJson(request);
  const v = new Validator();
  const portal = v.oneOf('portal', body.portal, RESELLER_PORTALS, { required: false, fallback: DEFAULT_MARKETPLACE, label: 'Portal' });
  const text = v.string('text', body.text, { required: true, max: 2000, label: 'Note' });
  v.assert();

  const tracker = await upsertTracker({ userId: user._id, productId: product._id, portal });
  const note = { id: randomBytes(8).toString('hex'), text, createdAt: new Date() };
  const db = await getDb();
  const result = await db
    .collection('resellerListings')
    .updateOne(
      { _id: tracker._id, [`notes.${MAX_TRACKER_NOTES - 1}`]: { $exists: false } },
      { $push: { notes: note }, $set: { updatedAt: note.createdAt } }
    );
  if (!result.matchedCount) throw badRequest(`You can keep up to ${MAX_TRACKER_NOTES} notes per product. Delete the entry to start fresh.`);
  return json({ note }, { status: 201 });
});
