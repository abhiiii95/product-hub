import { getDb } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireUser, isAdmin } from '@/lib/auth';
import { DEFAULT_MARKETPLACE, ROLES } from '@/lib/constants';
import { computePricing } from '@/lib/pricing';

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
  const listing = await listingStatusCounts(db);
  const listingSummary = { ...listing, pending: listing.not_started + listing.in_progress + listing.needs_changes };

  if (!isAdmin(user)) {
    const [available, recentlyUpdated] = await Promise.all([
      products.countDocuments({ status: 'active' }),
      products.find({ status: 'active' }, { projection: { name: 1, sku: 1, images: { $slice: 1 }, createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(8).toArray(),
    ]);
    return json({ role: user.role, available, listing: listingSummary, recentlyUpdated: recentlyUpdated.map(recentProduct) });
  }

  const [totalProducts, activeProducts, totalCategories, inStock, lowStock, outOfStock, activeListingUsers, recentProducts, recentActivity, pricingRows] =
    await Promise.all([
      products.countDocuments({}),
      products.countDocuments({ status: 'active' }),
      db.collection('categories').countDocuments({ isActive: { $ne: false } }),
      products.countDocuments({ stock: { $gt: 0 } }),
      products.countDocuments({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
      products.countDocuments({ stock: { $lte: 0 } }),
      db.collection('users').countDocuments({ role: ROLES.LISTING_USER, isActive: true }),
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
    listing: listingSummary,
    inventory: { stockUnits, stockCostValue: round(stockCostValue), stockRetailValue: round(stockRetailValue) },
    pricing: { averageMargin: marginCount ? round(marginSum / marginCount) : null, pricedProducts: marginCount },
    recentProducts: recentProducts.map(recentProduct),
    recentActivity: recentActivity.map((a) => ({ id: a._id.toString(), summary: a.summary, userName: a.userName, createdAt: a.createdAt })),
  });
});
