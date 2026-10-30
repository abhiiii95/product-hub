import { getDb, toObjectId } from './db';
import { badRequest, notFound } from './api';
import { isAdmin } from './auth';
import { isProductInScope } from './access';
import { DEFAULT_MARKETPLACE, LISTING_STATUSES } from './constants';
import { Validator } from './validate';

const productSummary = (product) => ({
  id: product._id.toString(),
  name: product.name,
  sku: product.sku,
  status: product.status,
  mainImage: product.images?.[0] ? { url: product.images[0].url, label: product.images[0].label || '' } : null,
});

// Shared listing content. Notes, version history and editor names are admin-only:
// they would reveal other resellers' activity. Without a user the safe (reseller) shape is returned.
export function serializeListing(listing, { product, user } = {}) {
  const out = {
    id: listing._id.toString(),
    productId: listing.productId.toString(),
    marketplace: listing.marketplace,
    title: listing.title || '',
    description: listing.description || '',
    styleId: listing.styleId || '',
    marketplaceSku: listing.marketplaceSku || '',
    marketplaceCategory: listing.marketplaceCategory || '',
    keywords: listing.keywords || [],
    attributes: listing.attributes || [],
    highlights: listing.highlights || [],
    packQuantity: listing.packQuantity ?? null,
    suggestedPrice: listing.suggestedPrice ?? null,
    status: listing.status,
    notes: (listing.notes || []).map((n) => ({
      id: n.id,
      text: n.text,
      userName: n.userName,
      createdAt: n.createdAt,
    })),
    previousVersions: (listing.previousVersions || [])
      .map((v) => ({
        title: v.title || '',
        description: v.description || '',
        styleId: v.styleId || '',
        marketplaceSku: v.marketplaceSku || '',
        savedAt: v.savedAt,
        savedByName: v.savedByName || null,
      }))
      .reverse(),
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    updatedByName: listing.updatedByName || null,
    product: product ? productSummary(product) : undefined,
  };
  if (!isAdmin(user)) {
    delete out.notes;
    delete out.previousVersions;
    delete out.updatedByName;
  }
  return out;
}

// A reseller's private tracker record (resellerListings). Only ever sent to its owner.
export function serializeTracker(record, { product } = {}) {
  return {
    id: record._id.toString(),
    productId: record.productId.toString(),
    portal: record.portal,
    portalLabel: record.portalLabel || '',
    status: record.status || 'not_started',
    notes: (record.notes || []).map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt })),
    savedVersions: (record.savedVersions || [])
      .map((v) => ({ title: v.title || '', description: v.description || '', styleId: v.styleId || '', sku: v.sku || '', savedAt: v.savedAt }))
      .reverse(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    product: product ? productSummary(product) : undefined,
  };
}

export const MAX_TRACKER_NOTES = 50;
export const MAX_SAVED_VERSIONS = 10;

export async function requireMarketplace(key) {
  const db = await getDb();
  let marketplace = typeof key === 'string' ? await db.collection('marketplaces').findOne({ key }) : null;
  // Meesho is seeded by ensureIndexes in the background; on a brand-new database the
  // first request can arrive before that, so create it here too.
  if (!marketplace && key === DEFAULT_MARKETPLACE) {
    marketplace = await db
      .collection('marketplaces')
      .findOneAndUpdate(
        { key },
        { $setOnInsert: { key, name: 'Meesho', isActive: true, createdAt: new Date() } },
        { upsert: true, returnDocument: 'after' }
      );
  }
  if (!marketplace) throw badRequest('Unknown marketplace');
  return marketplace;
}

// Content fields only an admin may write.
export function buildListingContent(body) {
  const v = new Validator();
  const attributes = [];
  if (Array.isArray(body.attributes)) {
    if (body.attributes.length > 100) v.fail('attributes', 'At most 100 attributes are allowed');
    for (const attr of body.attributes.slice(0, 100)) {
      const name = v.string('attributes', attr?.name, { max: 100, label: 'Attribute name' });
      const value = v.string('attributes', attr?.value, { max: 1000, label: 'Attribute value' });
      if (name) attributes.push({ name, value: value || '' });
    }
  }
  const doc = {
    title: v.string('title', body.title, { max: 300, label: 'Listing title' }),
    description: v.string('description', body.description, { max: 10000, label: 'Listing description' }),
    styleId: v.string('styleId', body.styleId, { max: 100, label: 'Style ID' }),
    marketplaceSku: v.string('marketplaceSku', body.marketplaceSku, { max: 100, label: 'Marketplace SKU' }),
    marketplaceCategory: v.string('marketplaceCategory', body.marketplaceCategory, { max: 300, label: 'Marketplace category' }),
    keywords: v.list('keywords', body.keywords, { maxItems: 100, label: 'Keywords' }),
    highlights: v.list('highlights', body.highlights, { maxItems: 30, maxLength: 500, label: 'Highlights' }),
    attributes,
    packQuantity: v.number('packQuantity', body.packQuantity, { integer: true, min: 1, label: 'Pack quantity' }),
    suggestedPrice: v.number('suggestedPrice', body.suggestedPrice, { label: 'Suggested selling price' }),
  };
  if (body.status !== undefined) {
    doc.status = v.oneOf('status', body.status, LISTING_STATUSES, { label: 'Listing status' });
  }
  v.assert();
  return doc;
}

// Loads a listing the user may access. Listing users cannot reach listings of inactive products.
export async function loadListingForUser(listingId, user) {
  const objectId = toObjectId(listingId);
  if (!objectId) throw notFound('Listing not found');
  const db = await getDb();
  const listing = await db.collection('marketplaceListings').findOne({ _id: objectId });
  if (!listing) throw notFound('Listing not found');
  const product = await db.collection('products').findOne({ _id: listing.productId });
  if (!product || (!isAdmin(user) && product.status !== 'active')) throw notFound('Listing not found');
  if (!isProductInScope(product, user)) throw notFound('Listing not found');
  return { listing, product };
}

// Upserts a reseller's tracker record for (user, product, portal) and returns it.
// Defaults are only set on insert for fields the update does not already touch.
export async function upsertTracker({ userId, productId, portal }, update = {}) {
  const db = await getDb();
  const now = new Date();
  const touched = new Set(Object.values(update).flatMap((ops) => Object.keys(ops || {}).map((k) => k.split('.')[0])));
  const defaults = { portalLabel: '', status: 'not_started', notes: [], savedVersions: [], createdAt: now };
  const setOnInsert = Object.fromEntries(Object.entries(defaults).filter(([key]) => !touched.has(key)));
  const ops = { ...update, $set: { ...(update.$set || {}), updatedAt: now }, $setOnInsert: setOnInsert };
  const filter = { userId, productId, portal };
  const run = () => db.collection('resellerListings').findOneAndUpdate(filter, ops, { upsert: true, returnDocument: 'after' });
  try {
    return await run();
  } catch (err) {
    // Two concurrent first writes race on the unique index; the retry updates the winner's record.
    if (err?.code === 11000) return run();
    throw err;
  }
}
