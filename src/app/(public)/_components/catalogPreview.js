import { connection } from 'next/server';
import { getDb } from '@/lib/db';
import { signToken } from '@/lib/tokens';

const MAX_CATEGORIES = 12;
const THUMBS_PER_CATEGORY = 2;
// Must match src/app/api/public/catalog-image/[token]/route.js.
const CATALOG_IMAGE_INFO = 'public-catalog';
const TOKEN_TTL_SEC = 24 * 60 * 60;

// Public teaser of the catalog: active category names, active product counts and up to
// two thumbnails each. Thumbnails are signed /api/public/catalog-image/<token> URLs, so
// no Cloudinary URL, public id, price, SKU, stock or product name reaches the browser.
// The token itself is signed, not encrypted: it carries the product id.
export async function publicCatalogPreview() {
  // Tokens expire after a day, so they are made per request, never baked in at build time.
  await connection();
  try {
    const db = await getDb();
    const [categories, counts] = await Promise.all([
      db.collection('categories').find({ isActive: { $ne: false } }, { projection: { name: 1 } }).toArray(),
      db
        .collection('products')
        .aggregate([
          { $match: { status: 'active', categoryId: { $type: 'objectId' } } },
          { $group: { _id: '$categoryId', count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);
    const countById = new Map(counts.map((c) => [c._id.toString(), c.count]));
    const withProducts = categories
      .map((c) => ({ _id: c._id, name: c.name, count: countById.get(c._id.toString()) || 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_CATEGORIES);

    return await Promise.all(
      withProducts.map(async (c) => {
        const products = await db
          .collection('products')
          .find({ categoryId: c._id, status: 'active', 'images.0.publicId': { $type: 'string' } }, { projection: { _id: 1 } })
          .sort({ updatedAt: -1 })
          .limit(THUMBS_PER_CATEGORY)
          .toArray();
        return {
          name: c.name,
          productCount: c.count,
          thumbs: products.map((p) => `/api/public/catalog-image/${signToken({ p: p._id.toString(), i: 0 }, CATALOG_IMAGE_INFO, TOKEN_TTL_SEC)}`),
        };
      })
    );
  } catch (err) {
    console.error('[home] catalog preview failed', err?.message);
    return null;
  }
}
