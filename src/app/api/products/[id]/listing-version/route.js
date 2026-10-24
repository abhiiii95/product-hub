import { getDb } from '@/lib/db';
import { json, readJson, route, ApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getCategoryFor, loadProductForUser } from '@/lib/products';
import { requireMarketplace, serializeListing } from '@/lib/listings';
import { aiProvider } from '@/lib/ai';
import { cleanCode, writeListingVersion } from '@/lib/listingWriter';
import { Validator } from '@/lib/validate';
import { logActivity } from '@/lib/activity';

export const maxDuration = 60;

// Simple per-user limit so AI costs stay predictable.
const usage = globalThis.__productHubAiUsage || (globalThis.__productHubAiUsage = new Map());
const LIMIT_PER_HOUR = 40;
function checkLimit(userId) {
  const key = userId.toString();
  const now = Date.now();
  const recent = (usage.get(key) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= LIMIT_PER_HOUR) throw new ApiError(429, 'Too many generations this hour. Try again later.');
  recent.push(now);
  usage.set(key, recent);
}

const MAX_PREVIOUS_VERSIONS = 20;

// Both roles: generate a new title / description / style ID / SKU for this product.
// Nothing is saved here.
export const POST = route(async (request, params) => {
  const user = await requireUser();
  const product = await loadProductForUser(params.id, user);
  if (!aiProvider()) throw new ApiError(503, 'AI features are not set up yet. Add GEMINI_API_KEY to the environment.');
  const body = await readJson(request);
  const marketplace = await requireMarketplace(body.marketplace || 'meesho');
  checkLimit(user._id);
  const db = await getDb();
  const [category, listing] = await Promise.all([
    getCategoryFor(product),
    db.collection('marketplaceListings').findOne({ productId: product._id, marketplace: marketplace.key }),
  ]);
  const version = await writeListingVersion({ product, category, listing });
  return json({ version });
});

// Both roles: save a generated version to this product's marketplace listing
// (created if missing). The values being replaced are kept in previousVersions.
// Only these four listing fields can be written through this route.
export const PUT = route(async (request, params) => {
  const user = await requireUser();
  const product = await loadProductForUser(params.id, user);
  const body = await readJson(request);
  const marketplace = await requireMarketplace(body.marketplace || 'meesho');
  const v = new Validator();
  const next = {
    title: v.string('title', body.title, { required: true, max: 300, label: 'Title' }),
    description: v.string('description', body.description, { max: 10000, label: 'Description' }),
    styleId: cleanCode(v.string('styleId', body.styleId, { max: 100, label: 'Style ID' })),
    marketplaceSku: cleanCode(v.string('sku', body.sku, { max: 100, label: 'SKU' })),
  };
  v.assert();

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
  return json({ listing: serializeListing(saved, { product }) });
});
