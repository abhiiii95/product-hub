import { getDb } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireUser, isAdmin } from '@/lib/auth';
import { DEFAULT_MARKETPLACE, RESELLER_LISTING_STATUSES, ROLES } from '@/lib/constants';
import { computePricing } from '@/lib/pricing';
import { accessSummary, planState, productScopeMatch } from '@/lib/access';

const LISTING_ACTIONS = ['listing.created', 'listing.updated', 'listing.status', 'listing.note'];

// Counts active products by their default-marketplace listing status (missing record = not started).
async function listingStatusCounts(db) {
  const rows = await db
    .collection('products')
    .aggregate([
      { $match: { status: 'active' } },
      {
        $lookup: {
          from: 'marketplaceListings',
          let: { pid: '$_id' },
          pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$productId', '$$pid'] }, { $eq: ['$marketplace', DEFAULT_MARKETPLACE] }] } } }],
          as: 'listing',
        },
      },
      { $group: { _id: { $ifNull: [{ $first: '$listing.status' }, 'not_started'] }, count: { $sum: 1 } } },
    ])
    .toArray();
  const counts = { not_started: 0, in_progress: 0, listed: 0, needs_changes: 0 };
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

// Reseller view: in-scope active products by the reseller's own tracker status on
// the default portal (no record = not started), plus raw tracker counts across portals.
async function resellerListingCounts(db, user, scopeMatch) {
  const [perProduct, perRecord] = await Promise.all([
    db
      .collection('products')
      .aggregate([
        { $match: { $and: [{ status: 'active' }, scopeMatch] } },
        {
          $lookup: {
            from: 'resellerListings',
            let: { pid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $and: [{ $eq: ['$productId', '$$pid'] }, { $eq: ['$userId', user._id] }, { $eq: ['$portal', DEFAULT_MARKETPLACE] }] },
                },
              },
              { $project: { status: 1 } },
            ],
            as: 'tracker',
          },
        },
        { $group: { _id: { $ifNull: [{ $first: '$tracker.status' }, 'not_started'] }, count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection('resellerListings')
      .aggregate([{ $match: { userId: user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray(),
  ]);
  const empty = () => Object.fromEntries(RESELLER_LISTING_STATUSES.map((s) => [s, 0]));
  const listing = empty();
  for (const row of perProduct) if (row._id in listing) listing[row._id] = row.count;
  const tracker = empty();
  for (const row of perRecord) if (row._id in tracker) tracker[row._id] = row.count;
  return { listing, tracker };
}

const recentProduct = (p) => ({
  id: p._id.toString(),
  name: p.name,
  sku: p.sku,
  mainImage: p.images?.[0]?.url || null,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export const GET = route(async () => {
  const user = await requireUser();
  const db = await getDb();
  const products = db.collection('products');

  if (!isAdmin(user)) {
    const visible = { $and: [{ status: 'active' }, productScopeMatch(user)] };
    const [available, recentlyUpdated, counts] = await Promise.all([
      products.countDocuments(visible),
      products.find(visible, { projection: { name: 1, sku: 1, images: { $slice: 1 }, createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(8).toArray(),
      resellerListingCounts(db, user, productScopeMatch(user)),
    ]);
    const { listing, tracker } = counts;
    const plan = planState(user);
    return json({
      role: user.role,
      available,
      listing: { ...listing, pending: listing.not_started + listing.in_progress + listing.needs_changes },
      tracker,
      plan,
      access: accessSummary(user),
      support: plan.tier === 'all' ? 'chat+call' : 'chat',
      recentlyUpdated: recentlyUpdated.map(recentProduct),
    });
  }

  const listing = await listingStatusCounts(db);
  const listingSummary = { ...listing, pending: listing.not_started + listing.in_progress + listing.needs_changes };
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const resellerBase = { role: ROLES.LISTING_USER, isActive: true };

  const [totalProducts, activeProducts, totalCategories, inStock, lowStock, outOfStock, activeListingUsers, activeResellers, expiringIn7Days, recentProducts, recentActivity, pricingRows] =
    await Promise.all([
      products.countDocuments({}),
      products.countDocuments({ status: 'active' }),
      db.collection('categories').countDocuments({ isActive: { $ne: false } }),
      products.countDocuments({ stock: { $gt: 0 } }),
      products.countDocuments({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
      products.countDocuments({ stock: { $lte: 0 } }),
      db.collection('users').countDocuments(resellerBase),
      db.collection('users').countDocuments({ ...resellerBase, planEndsAt: { $gt: now } }),
      db.collection('users').countDocuments({ ...resellerBase, planEndsAt: { $gt: now, $lte: weekAhead } }),
      products.find({}, { projection: { name: 1, sku: 1, images: { $slice: 1 }, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1 }).limit(6).toArray(),
      db.collection('activityLogs').find({ action: { $in: LISTING_ACTIONS } }).sort({ createdAt: -1 }).limit(10).toArray(),
      products.find({}, { projection: { purchaseCost: 1, packagingCost: 1, additionalCost: 1, sellingPrice: 1, stock: 1 } }).toArray(),
    ]);

  let stockUnits = 0;
  let stockCostValue = 0;
  let stockRetailValue = 0;
  let marginSum = 0;
  let marginCount = 0;
  for (const p of pricingRows) {
    const pricing = computePricing(p);
    const units = Math.max(0, p.stock || 0);
    stockUnits += units;
    stockCostValue += units * pricing.totalCost;
    stockRetailValue += units * pricing.sellingPrice;
    if (pricing.margin !== null) {
      marginSum += pricing.margin;
      marginCount += 1;
    }
  }
  const round = (n) => Math.round(n * 100) / 100;

  return json({
    role: user.role,
    totalProducts,
    activeProducts,
    totalCategories,
    inStock,
    lowStock,
    outOfStock,
    activeListingUsers,
    activeResellers,
    expiringIn7Days,
    listing: listingSummary,
    inventory: { stockUnits, stockCostValue: round(stockCostValue), stockRetailValue: round(stockRetailValue) },
    pricing: { averageMargin: marginCount ? round(marginSum / marginCount) : null, pricedProducts: marginCount },
    recentProducts: recentProducts.map(recentProduct),
    recentActivity: recentActivity.map((a) => ({ id: a._id.toString(), summary: a.summary, userName: a.userName, createdAt: a.createdAt })),
  });
});
