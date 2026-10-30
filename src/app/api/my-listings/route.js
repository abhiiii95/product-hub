import { getDb, toObjectId } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireReseller } from '@/lib/auth';
import { categoryScope } from '@/lib/access';
import { serializeTracker } from '@/lib/listings';
import { RESELLER_LISTING_STATUSES, RESELLER_PORTALS } from '@/lib/constants';
import { escapeRegex, parsePaging } from '@/lib/validate';

// The signed-in reseller's own tracker records, newest first. Records for products
// that are now hidden or outside their access are left out (they reappear if access returns).
export const GET = route(async (request) => {
  const user = await requireReseller();
  const params = request.nextUrl.searchParams;
  const { page, limit, skip } = parsePaging(params, { defaultLimit: 30 });

  const match = { userId: user._id };
  if (RESELLER_PORTALS.includes(params.get('portal'))) match.portal = params.get('portal');
  const productId = toObjectId(params.get('productId') || '');
  if (productId) match.productId = productId;
  // Applied after counting, so the per-status counts reflect the other filters only.
  const statusMatch = RESELLER_LISTING_STATUSES.includes(params.get('status')) ? [{ $match: { status: params.get('status') } }] : [];

  const productMatch = { 'product.status': 'active' };
  const scope = categoryScope(user);
  if (!scope.all) productMatch['product.categoryId'] = { $in: scope.categoryIds };
  const q = (params.get('q') || '').trim().slice(0, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    productMatch.$or = [{ 'product.name': rx }, { 'product.sku': rx }, { 'savedVersions.title': rx }];
  }

  const db = await getDb();
  const [result] = await db
    .collection('resellerListings')
    .aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          // Only what the tracker row shows; never costs or stock.
          pipeline: [{ $project: { name: 1, sku: 1, status: 1, categoryId: 1, images: { $slice: ['$images', 1] } } }],
          as: 'product',
        },
      },
      { $unwind: '$product' },
      { $match: productMatch },
      {
        $facet: {
          items: [...statusMatch, { $sort: { updatedAt: -1, _id: 1 } }, { $skip: skip }, { $limit: limit }],
          total: [...statusMatch, { $count: 'count' }],
          counts: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
        },
      },
    ])
    .toArray();
  const total = result.total[0]?.count || 0;
  return json({
    items: result.items.map((r) => serializeTracker(r, { product: r.product })),
    total,
    counts: Object.fromEntries(result.counts.map((c) => [c._id, c.n])),
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});
