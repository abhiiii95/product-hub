import { MongoClient, ObjectId } from 'mongodb';

const globalCache = globalThis.__productHubMongo || (globalThis.__productHubMongo = {});

function createClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');
  return new MongoClient(uri, { maxPoolSize: 10 });
}

export async function getDb() {
  if (!globalCache.clientPromise) {
    globalCache.clientPromise = createClient().connect().catch((err) => {
      globalCache.clientPromise = null;
      throw err;
    });
  }
  const client = await globalCache.clientPromise;
  const db = client.db(process.env.MONGODB_DB_NAME || 'product_hub');
  // Indexes already exist after the first run; (re)creating them is idempotent,
  // so do it in the background instead of delaying the request (matters on serverless cold starts).
  if (!globalCache.indexesPromise) {
    globalCache.indexesPromise = ensureIndexes(db).catch((err) => {
      console.error('[db] ensureIndexes failed', err);
      globalCache.indexesPromise = null;
    });
  }
  return db;
}

export async function closeDb() {
  if (globalCache.clientPromise) {
    const client = await globalCache.clientPromise;
    await client.close();
    globalCache.clientPromise = null;
    globalCache.indexesPromise = null;
  }
}

export async function ensureIndexes(db) {
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ userId: 1 }),
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('categories').createIndex({ slug: 1 }, { unique: true }),
    db.collection('products').createIndex({ sku: 1 }, { unique: true }),
    db.collection('products').createIndex({ name: 1 }),
    db.collection('products').createIndex({ categoryId: 1, status: 1 }),
    db.collection('products').createIndex({ createdAt: -1 }),
    db.collection('products').createIndex({ updatedAt: -1 }),
    db.collection('products').createIndex({ tags: 1 }),
    db.collection('products').createIndex({ keywords: 1 }),
    db.collection('marketplaceListings').createIndex({ productId: 1, marketplace: 1 }, { unique: true }),
    db.collection('marketplaceListings').createIndex({ marketplace: 1, status: 1 }),
    db.collection('marketplaceListings').createIndex({ updatedAt: -1 }),
    db.collection('marketplaces').createIndex({ key: 1 }, { unique: true }),
    db.collection('stockMovements').createIndex({ productId: 1, createdAt: -1 }),
    db.collection('stockMovements').createIndex({ createdAt: -1 }),
    db.collection('activityLogs').createIndex({ createdAt: -1 }),
    db.collection('activityLogs').createIndex({ entityType: 1, createdAt: -1 }),
  ]);
  // Meesho is the initial marketplace; more can be added from the Listings page.
  await db.collection('marketplaces').updateOne(
    { key: 'meesho' },
    { $setOnInsert: { key: 'meesho', name: 'Meesho', isActive: true, createdAt: new Date() } },
    { upsert: true }
  );
}

export function toObjectId(value) {
  if (value instanceof ObjectId) return value;
  if (typeof value !== 'string' || !ObjectId.isValid(value) || value.length !== 24) return null;
  return new ObjectId(value);
}

export { ObjectId };
