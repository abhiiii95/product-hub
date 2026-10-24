import { getDb } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { loadProductForUser } from '@/lib/products';
import { serializeListing } from '@/lib/listings';
import { aiProvider } from '@/lib/ai';

// All marketplace listing records for a product.
export const GET = route(async (request, params) => {
  const user = await requireUser();
  const product = await loadProductForUser(params.id, user);
  const db = await getDb();
  const listings = await db.collection('marketplaceListings').find({ productId: product._id }).sort({ marketplace: 1 }).toArray();
  return json({ listings: listings.map((l) => serializeListing(l)), aiEnabled: Boolean(aiProvider()) });
});
