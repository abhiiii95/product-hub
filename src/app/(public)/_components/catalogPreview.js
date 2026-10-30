import { connection } from 'next/server';
import { getDb } from '@/lib/db';
import { signToken } from '@/lib/tokens';

const MAX_CATEGORIES = 12;
const THUMBS_PER_CATEGORY = 2;
// Must match src/app/api/public/catalog-image/[token]/route.js.
const CATALOG_IMAGE_INFO = 'public-catalog';
const TOKEN_TTL_SEC = 24 * 60 * 60;

// Public teaser of the catalog: the number of active products, active category names with
// counts, and blurred thumbnails for a product grid. Thumbnails are signed
// /api/public/catalog-image/<token> URLs, so no Cloudinary URL, public id, price, SKU, stock
// or product name reaches the browser. The token itself is signed, not encrypted: it carries
// the product id. Returns null when the database cannot be read.
export async function publicCatalogPreview({ productThumbs = 12 } = {}) {
  // Tokens expire after a day, so they are made per request, never baked in at build time.
  await connection();
  const thumbFor = (p) => `/api/public/catalog-image/${signToken({ p: p._id.toString(), i: 0 }, CATALOG_IMAGE_INFO, TOKEN_TTL_SEC)}`;
  try {
    const db = await getDb();
    const [categories, counts, productTotal, withImages] = await Promise.all([
      db.collection('categories').find({ isActive: { $ne: false } }, { projection: { name: 1 } }).toArray(),
      db
        .collection('products')
        .aggregate([
          { $match: { status: 'active', categoryId: { $type: 'objectId' } } },
          { $group: { _id: '$categoryId', count: { $sum: 1 } } },
        ])
        .toArray(),
      db.collection('products').countDocuments({ status: 'active' }),
      db
        .collection('products')
        .find({ status: 'active', 'images.0.publicId': { $type: 'string' } }, { projection: { _id: 1, categoryId: 1 } })
        .sort({ updatedAt: -1 })
        .limit(Math.max(productThumbs, MAX_CATEGORIES * THUMBS_PER_CATEGORY))
        .toArray(),
    ]);
    const countById = new Map(counts.map((c) => [c._id.toString(), c.count]));
    const withProducts = categories
      .map((c) => ({ _id: c._id, name: c.name, count: countById.get(c._id.toString()) || 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_CATEGORIES);

    return {
      productTotal,
      products: withImages.slice(0, productThumbs).map(thumbFor),
      categories: withProducts.map((c) => ({
        name: c.name,
        productCount: c.count,
        thumbs: withImages
          .filter((p) => p.categoryId && p.categoryId.equals(c._id))
          .slice(0, THUMBS_PER_CATEGORY)
          .map(thumbFor),
      })),
    };
  } catch (err) {
    console.error('[home] catalog preview failed', err?.message);
    return null;
  }
}
