import { getDb, toObjectId } from '@/lib/db';
import { json, readJson, route, badRequest, conflict } from '@/lib/api';
import { requireUser, requireAdmin, isAdmin } from '@/lib/auth';
import { buildListingContent, requireMarketplace, serializeListing } from '@/lib/listings';
import { loadProductForUser } from '@/lib/products';
import { categoryScope } from '@/lib/access';
import { LISTING_STATUSES, LISTING_STATUS_LABELS } from '@/lib/constants';
import { escapeRegex, parsePaging } from '@/lib/validate';
import { logActivity } from '@/lib/activity';

// Listing workspace: marketplace listing records with their product summary.
export const GET = route(async (request) => {
  const user = await requireUser();
  const params = request.nextUrl.searchParams;
  const { page, limit, skip } = parsePaging(params, { defaultLimit: 30 });
  const match = {};
  if (LISTING_STATUSES.includes(params.get('status'))) match.status = params.get('status');
  const marketplace = params.get('marketplace');
  if (marketplace) match.marketplace = String(marketplace).slice(0, 40);

  const productMatch = {};
  if (!isAdmin(user)) {
    productMatch['product.status'] = 'active';
    const scope = categoryScope(user);
    if (!scope.all) productMatch['product.categoryId'] = { $in: scope.categoryIds };
  }
  const q = (params.get('q') || '').trim().slice(0, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    productMatch.$or = [{ 'product.name': rx }, { 'product.sku': rx }, { title: rx }, { styleId: rx }, { keywords: rx }];
  }

  const db = await getDb();
  const [result] = await db
    .collection('marketplaceListings')
    .aggregate([
      { $match: match },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $match: productMatch },
      { $sort: { updatedAt: -1, _id: 1 } },
      { $facet: { items: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'count' }] } },
    ])
    .toArray();
  const total = result.total[0]?.count || 0;
  return json({
    listings: result.items.map((l) => serializeListing(l, { product: l.product, user })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

// Admin creates a listing record for a product on a marketplace.
export const POST = route(async (request) => {
  const admin = await requireAdmin();
  const body = await readJson(request);
  if (!toObjectId(body.productId)) throw badRequest('Choose a product');
  const product = await loadProductForUser(body.productId, admin);
  const marketplace = await requireMarketplace(body.marketplace);
  const content = buildListingContent(body);
  const db = await getDb();
  if (await db.collection('marketplaceListings').findOne({ productId: product._id, marketplace: marketplace.key })) {
    throw conflict(`A ${marketplace.name} listing already exists for this product`);
  }
  const now = new Date();
  const listing = {
    productId: product._id,
    marketplace: marketplace.key,
    ...content,
    status: content.status || 'not_started',
    notes: [],
    createdAt: now,
    updatedAt: now,
    updatedBy: admin._id,
    updatedByName: admin.name,
  };
  // Pre-fill from the product only when the admin left those fields blank.
  if (!content.title) listing.title = product.name;
  if (!content.description) listing.description = product.description || '';
  if (!content.keywords?.length) listing.keywords = product.keywords || [];
  if (content.suggestedPrice == null) listing.suggestedPrice = product.sellingPrice ?? null;

  const { insertedId } = await db.collection('marketplaceListings').insertOne(listing);
  await logActivity(admin, 'listing.created', {
    entityType: 'listing',
    entityId: insertedId,
    summary: `Prepared ${marketplace.name} listing for ${product.name} (${LISTING_STATUS_LABELS[listing.status]})`,
  });
  return json({ listing: serializeListing({ ...listing, _id: insertedId }, { product, user: admin }) }, { status: 201 });
});
