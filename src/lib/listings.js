import { getDb, toObjectId } from './db';
import { badRequest, notFound } from './api';
import { isAdmin } from './auth';
import { LISTING_STATUSES } from './constants';
import { Validator } from './validate';

export function serializeListing(listing, { product } = {}) {
  return {
    id: listing._id.toString(),
    productId: listing.productId.toString(),
    marketplace: listing.marketplace,
    title: listing.title || '',
    description: listing.description || '',
    styleId: listing.styleId || '',
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
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    updatedByName: listing.updatedByName || null,
    product: product
      ? {
          id: product._id.toString(),
          name: product.name,
          sku: product.sku,
          status: product.status,
          mainImage: product.images?.[0] ? { url: product.images[0].url, label: product.images[0].label || '' } : null,
        }
      : undefined,
  };
}

export async function requireMarketplace(key) {
  const db = await getDb();
  const marketplace = typeof key === 'string' ? await db.collection('marketplaces').findOne({ key }) : null;
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
  return { listing, product };
}
