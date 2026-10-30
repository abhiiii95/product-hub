import { getDb } from '@/lib/db';
import { json, readJson, route, ApiError } from '@/lib/api';
import { requireUser, isAdmin } from '@/lib/auth';
import { getCategoryFor, loadProductForUser } from '@/lib/products';
import { MAX_SAVED_VERSIONS, requireMarketplace, serializeListing, serializeTracker, upsertTracker } from '@/lib/listings';
import { aiProvider } from '@/lib/ai';
import { cleanCode, writeListingVersion } from '@/lib/listingWriter';
import { Validator } from '@/lib/validate';
import { logActivity } from '@/lib/activity';
import { DEFAULT_MARKETPLACE, RESELLER_PORTALS } from '@/lib/constants';

export const maxDuration = 60;

// Resellers get a fixed number of AI generations per India calendar day.
// Counted in Mongo so the cap holds across serverless instances.
const RESELLER_DAILY_LIMIT = 5;
const COUNTER_TTL_MS = 26 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const istDay = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

async function takeGeneration(db, userId) {
  const key = `aigen:${userId}:${istDay()}`;
  const bump = () =>
    db
      .collection('rateLimits')
      .findOneAndUpdate(
        { key },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + COUNTER_TTL_MS) } },
        { upsert: true, returnDocument: 'after' }
      );
  // Two first requests of the day can race on the unique key; the retry increments the winner.
  const counter = await bump().catch((err) => (err?.code === 11000 ? bump() : Promise.reject(err)));
  if (counter.count > RESELLER_DAILY_LIMIT) {
    await db.collection('rateLimits').updateOne({ key }, { $inc: { count: -1 } });
    throw new ApiError(429, `You can generate ${RESELLER_DAILY_LIMIT} new versions per day. Try again tomorrow.`, { code: 'ai_daily_limit' });
  }
  return key;
}

const MAX_PREVIOUS_VERSIONS = 20;

// Both roles: generate a new title / description / style ID / SKU for this product.
// Nothing is saved here.
export const POST = route(async (request, params) => {
  const user = await requireUser();
  const product = await loadProductForUser(params.id, user);
  if (!aiProvider()) throw new ApiError(503, 'AI features are not set up yet. Add GEMINI_API_KEY to the environment.');
  const body = await readJson(request);
  const marketplace = await requireMarketplace(body.marketplace || DEFAULT_MARKETPLACE);
  const admin = isAdmin(user);
  const portal = RESELLER_PORTALS.includes(body.portal) ? body.portal : DEFAULT_MARKETPLACE;
  const db = await getDb();
  const [category, listing, tracker] = await Promise.all([
    getCategoryFor(product),
    db.collection('marketplaceListings').findOne({ productId: product._id, marketplace: marketplace.key }),
    admin ? null : db.collection('resellerListings').findOne({ userId: user._id, productId: product._id, portal }),
  ]);
  const counterKey = admin ? null : await takeGeneration(db, user._id);
  try {
    const previousVersions = admin
      ? undefined
      : (tracker?.savedVersions || []).map((v) => ({ title: v.title, styleId: v.styleId, marketplaceSku: v.sku }));
    const version = await writeListingVersion({ product, category, listing, previousVersions });
    return json({ version });
  } catch (err) {
    // A failed AI call should not use up one of the reseller's daily generations.
    if (counterKey) await db.collection('rateLimits').updateOne({ key: counterKey }, { $inc: { count: -1 } }).catch(() => {});
    throw err;
  }
});

// Admin: save a generated version to the shared marketplace listing (created if
// missing); replaced values are kept in previousVersions.
// Reseller: save into their own tracker (resellerListings.savedVersions) for a portal.
// Only the four version fields can be written through this route.
export const PUT = route(async (request, params) => {
  const user = await requireUser();
  const product = await loadProductForUser(params.id, user);
  const body = await readJson(request);
  const v = new Validator();
  const next = {
    title: v.string('title', body.title, { required: true, max: 300, label: 'Title' }),
    description: v.string('description', body.description, { max: 10000, label: 'Description' }),
    styleId: cleanCode(v.string('styleId', body.styleId, { max: 100, label: 'Style ID' })),
    marketplaceSku: cleanCode(v.string('sku', body.sku, { max: 100, label: 'SKU' })),
  };
  const portal = isAdmin(user)
    ? null
    : v.oneOf('portal', body.portal, RESELLER_PORTALS, { required: false, fallback: DEFAULT_MARKETPLACE, label: 'Portal' });
  v.assert();

  if (!isAdmin(user)) {
    const saved = { title: next.title, description: next.description, styleId: next.styleId, sku: next.marketplaceSku, savedAt: new Date() };
    const tracker = await upsertTracker(
      { userId: user._id, productId: product._id, portal },
      { $push: { savedVersions: { $each: [saved], $slice: -MAX_SAVED_VERSIONS } } }
    );
    await logActivity(user, 'tracker.version_saved', {
      entityType: 'product',
      entityId: product._id,
      summary: `${user.name} saved a ${portal} version for ${product.name}`,
    });
    return json({ tracker: serializeTracker(tracker, { product }) });
  }

  const marketplace = await requireMarketplace(body.marketplace || DEFAULT_MARKETPLACE);
  const db = await getDb();
  const listings = db.collection('marketplaceListings');
  const now = new Date();
  const existing = await listings.findOne({ productId: product._id, marketplace: marketplace.key });
  if (existing) {
    const previous = {
      title: existing.title || '',
      description: existing.description || '',
      styleId: existing.styleId || '',
      marketplaceSku: existing.marketplaceSku || '',
      savedAt: existing.updatedAt || existing.createdAt,
      savedByName: existing.updatedByName || null,
    };
    await listings.updateOne(
      { _id: existing._id },
      {
        $set: { ...next, updatedAt: now, updatedBy: user._id, updatedByName: user.name },
        $push: { previousVersions: { $each: [previous], $slice: -MAX_PREVIOUS_VERSIONS } },
      }
    );
  } else {
    await listings.insertOne({
      productId: product._id,
      marketplace: marketplace.key,
      ...next,
      marketplaceCategory: '',
      keywords: product.keywords || [],
      attributes: [],
      highlights: [],
      packQuantity: null,
      suggestedPrice: product.sellingPrice ?? null,
      status: 'not_started',
      notes: [],
      previousVersions: [],
      createdAt: now,
      updatedAt: now,
      updatedBy: user._id,
      updatedByName: user.name,
    });
  }
  const saved = await listings.findOne({ productId: product._id, marketplace: marketplace.key });
  await logActivity(user, 'listing.updated', {
    entityType: 'listing',
    entityId: saved._id,
    summary: `${user.name} saved a new ${marketplace.name} title/description/style ID for ${product.name}`,
  });
  return json({ listing: serializeListing(saved, { product, user }) });
});
