// Read-only business summary of the product_hub database, as JSON on stdout.
// Used by the business-advisor agent. Never writes to the database and never
// prints connection details.
// Usage: npm run business:snapshot   (reads .env.local)
import { MongoClient } from 'mongodb';

const { MONGODB_URI, MONGODB_DB_NAME = 'product_hub' } = process.env;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

const DAY = 24 * 60 * 60 * 1000;
// Stock reductions have a free-text reason; these words mean the units were sold.
const SALE_REASON = /\b(sold|sale|sales|order|orders|ordered|delivered|dispatch|dispatched|shipped|bika|biki|becha|bechi)\b/i;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (n) => Math.round(n * 100) / 100;

const client = new MongoClient(MONGODB_URI);
try {
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);
  const now = Date.now();
  const [products, categories, listings, movements, users] = await Promise.all([
    db.collection('products').find({}).toArray(),
    db.collection('categories').find({}).toArray(),
    db.collection('marketplaceListings').find({}, { projection: { productId: 1, marketplace: 1, status: 1, updatedAt: 1 } }).toArray(),
    db.collection('stockMovements').find({}).toArray(),
    db.collection('users').find({}, { projection: { role: 1, isActive: 1, lastLoginAt: 1 } }).toArray(),
  ]);
  const categoryName = new Map(categories.map((c) => [c._id.toString(), c.name]));

  const rows = products.map((p) => {
    const id = p._id.toString();
    const totalCost = num(p.purchaseCost) + num(p.packagingCost) + num(p.additionalCost);
    const price = num(p.sellingPrice);
    const profit = price - totalCost;
    const own = movements.filter((m) => m.productId?.toString() === id);
    const window = (days) => {
      const recent = own.filter((m) => now - new Date(m.createdAt).getTime() <= days * DAY);
      const removed = recent.filter((m) => m.quantityChange < 0);
      return {
        unitsAdded: recent.filter((m) => m.quantityChange > 0).reduce((s, m) => s + m.quantityChange, 0),
        unitsSold: removed.filter((m) => SALE_REASON.test(m.reason || '')).reduce((s, m) => s - m.quantityChange, 0),
        unitsRemovedOther: removed.filter((m) => !SALE_REASON.test(m.reason || '')).reduce((s, m) => s - m.quantityChange, 0),
      };
    };
    const last = own.reduce((a, m) => (!a || m.createdAt > a ? m.createdAt : a), null);
    return {
      name: p.name,
      sku: p.sku,
      category: p.categoryId ? categoryName.get(p.categoryId.toString()) || null : null,
      status: p.status,
      sellingPrice: price || null,
      costsEntered: Boolean(p.purchaseCost || p.packagingCost || p.additionalCost),
      totalCost: round(totalCost),
      // Without costs the margin would wrongly read 100 %, so leave it unknown.
      profitBeforeMarketplaceDeductions: price && totalCost ? round(profit) : null,
      marginPercent: price && totalCost ? round((profit / price) * 100) : null,
      stock: num(p.stock),
      lowStockThreshold: num(p.lowStockThreshold),
      isLowStock: num(p.stock) <= num(p.lowStockThreshold),
      stockValueAtCost: round(Math.max(0, num(p.stock)) * totalCost),
      images: (p.images || []).length,
      listings: listings.filter((l) => l.productId?.toString() === id).map((l) => ({ marketplace: l.marketplace, status: l.status })),
      movements: { last30Days: window(30), last90Days: window(90), lastMovementAt: last },
      createdAt: p.createdAt,
    };
  });

  const listingStatus = {};
  for (const l of listings) listingStatus[l.status] = (listingStatus[l.status] || 0) + 1;

  const snapshot = {
    generatedAt: new Date().toISOString(),
    note: 'Profit is before marketplace fees, shipping, returns and taxes. unitsSold is inferred from stock-reduction reasons.',
    totals: {
      products: products.length,
      activeProducts: products.filter((p) => p.status === 'active').length,
      productsWithoutCosts: rows.filter((r) => !r.costsEntered).length,
      productsWithoutPrice: rows.filter((r) => !r.sellingPrice).length,
      productsWithoutImages: rows.filter((r) => r.images === 0).length,
      productsWithoutListing: rows.filter((r) => r.listings.length === 0).length,
      lowStockProducts: rows.filter((r) => r.isLowStock).length,
      unitsInStock: rows.reduce((s, r) => s + Math.max(0, r.stock), 0),
      stockValueAtCost: round(rows.reduce((s, r) => s + r.stockValueAtCost, 0)),
      unitsSoldLast30Days: rows.reduce((s, r) => s + r.movements.last30Days.unitsSold, 0),
      categories: categories.length,
      listingStatus,
      activeListingUsers: users.filter((u) => u.role === 'listing_user' && u.isActive).length,
    },
    products: rows,
  };
  console.log(JSON.stringify(snapshot, null, 2));
} finally {
  await client.close();
}
