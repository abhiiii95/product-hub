import { getDb } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireReseller } from '@/lib/auth';
import { productScopeMatch } from '@/lib/access';
import { signToken } from '@/lib/tokens';

const MAX_CARDS = 24;
const TOKEN_TTL_SEC = 3600;

// Blurred catalog teaser for /renew (works with an expired plan). Only opaque
// tokens leave the server: no names, ids, prices or Cloudinary URLs.
export const GET = route(async () => {
  const user = await requireReseller({ allowExpired: true });
  const db = await getDb();
  const filter = { $and: [{ status: 'active', 'images.0': { $exists: true } }, productScopeMatch(user)] };
  const products = db.collection('products');
  const [total, rows] = await Promise.all([
    products.countDocuments(filter),
    products.find(filter, { projection: { _id: 1 } }).sort({ updatedAt: -1 }).limit(MAX_CARDS).toArray(),
  ]);
  return json({
    total,
    cards: await Promise.all(rows.map(async (p) => ({ token: await signToken({ p: p._id.toString() }, 'preview-token', TOKEN_TTL_SEC) }))),
  });
});
