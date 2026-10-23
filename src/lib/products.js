import { getDb, toObjectId } from './db';
import { notFound, badRequest } from './api';
import { isAdmin } from './auth';
import { DEFAULT_MARKETPLACE, DIMENSION_UNITS, LISTING_STATUSES, PRODUCT_STATUSES } from './constants';
import { computePricing } from './pricing';
import { Validator, escapeRegex, parsePaging } from './validate';

const id = (value) => (value ? value.toString() : null);

export function serializeImage(image) {
  return {
    id: image.id,
    url: image.url,
    label: image.label || '',
    width: image.width || null,
    height: image.height || null,
    format: image.format || null,
    bytes: image.bytes || null,
  };
}

// Whitelists the fields each role may see. Costs, profit, supplier, internal
// notes and exact stock figures never leave the server for listing users.
export function serializeProduct(product, user, { category } = {}) {
  const base = {
    id: id(product._id),
    name: product.name,
    sku: product.sku,
    categoryId: id(product.categoryId),
    categoryName: category?.name ?? product.categoryName ?? null,
    brand: product.brand || '',
    description: product.description || '',
    productType: product.productType || '',
    material: product.material || '',
    color: product.color || '',
    dimensions: product.dimensions || { length: null, width: null, height: null, unit: 'cm' },
    weight: product.weight ?? null,
    sellingPrice: product.sellingPrice ?? null,
    tags: product.tags || [],
    keywords: product.keywords || [],
    customFields: product.customFields || {},
    status: product.status,
    images: (product.images || []).map(serializeImage),
    mainImage: product.images?.[0] ? serializeImage(product.images[0]) : null,
    listingStatus: product.listingStatus || undefined,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
  if (!isAdmin(user)) {
    return { ...base, inStock: (product.stock ?? 0) > 0 };
  }
  return {
    ...base,
    purchaseCost: product.purchaseCost ?? null,
    packagingCost: product.packagingCost ?? null,
    additionalCost: product.additionalCost ?? null,
    stock: product.stock ?? 0,
    lowStockThreshold: product.lowStockThreshold ?? 0,
    isLowStock: (product.stock ?? 0) <= (product.lowStockThreshold ?? 0),
    inStock: (product.stock ?? 0) > 0,
    supplier: product.supplier || '',
    internalNotes: product.internalNotes || '',
    pricing: computePricing(product),
  };
}

// Validates values for a category's configured custom fields. Unknown keys are dropped.
export function validateCustomFields(category, values, v) {
  const out = {};
  if (!category) return out;
  const input = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  for (const field of category.fields || []) {
    const raw = input[field.key];
    const label = field.label;
    const name = `customFields.${field.key}`;
    let value;
    switch (field.type) {
      case 'number':
        value = v.number(name, raw, { required: field.required, min: -1e9, label });
        break;
      case 'checkbox':
        value = v.boolean(raw);
        break;
      case 'dropdown':
        value = raw === undefined || raw === null ? '' : String(raw);
        if (!value && field.required) v.fail(name, `${label} is required`);
        else if (value && !(field.options || []).includes(value)) v.fail(name, `${label} has an invalid option`);
        break;
      case 'date':
        value = v.string(name, raw, { required: field.required, max: 10, label });
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) v.fail(name, `${label} must be a date (YYYY-MM-DD)`);
        break;
      case 'textarea':
        value = v.string(name, raw, { required: field.required, max: 5000, label });
        break;
      default:
        value = v.string(name, raw, { required: field.required, max: 500, label });
    }
    if (value !== undefined && value !== null && value !== '') out[field.key] = value;
  }
  return out;
}

// Builds the explicit set of core product fields an admin may write (mass-assignment guard).
export async function buildProductInput(body, { isCreate }) {
  const v = new Validator();
  const db = await getDb();
  const doc = {
    name: v.string('name', body.name, { required: true, max: 200, label: 'Product name' }),
    sku: v.string('sku', body.sku, { max: 60, label: 'SKU' }),
    brand: v.string('brand', body.brand, { max: 100, label: 'Brand' }),
    description: v.string('description', body.description, { max: 10000, label: 'Description' }),
    productType: v.string('productType', body.productType, { max: 100, label: 'Product type' }),
    material: v.string('material', body.material, { max: 100, label: 'Material' }),
    color: v.string('color', body.color, { max: 100, label: 'Color' }),
    dimensions: {
      length: v.number('dimensions.length', body.dimensions?.length, { label: 'Length' }),
      width: v.number('dimensions.width', body.dimensions?.width, { label: 'Width' }),
      height: v.number('dimensions.height', body.dimensions?.height, { label: 'Height' }),
      unit: v.oneOf('dimensions.unit', body.dimensions?.unit, DIMENSION_UNITS, { required: false, fallback: 'cm', label: 'Dimension unit' }),
    },
    weight: v.number('weight', body.weight, { label: 'Weight' }),
    purchaseCost: v.number('purchaseCost', body.purchaseCost, { label: 'Purchase cost' }),
    packagingCost: v.number('packagingCost', body.packagingCost, { label: 'Packaging cost' }),
    additionalCost: v.number('additionalCost', body.additionalCost, { label: 'Additional cost' }),
    sellingPrice: v.number('sellingPrice', body.sellingPrice, { label: 'Selling price' }),
    lowStockThreshold: v.number('lowStockThreshold', body.lowStockThreshold, { integer: true, label: 'Low-stock threshold' }) ?? 5,
    supplier: v.string('supplier', body.supplier, { max: 200, label: 'Supplier' }),
    internalNotes: v.string('internalNotes', body.internalNotes, { max: 5000, label: 'Internal notes' }),
    status: v.oneOf('status', body.status, PRODUCT_STATUSES, { required: false, fallback: 'active', label: 'Status' }),
    tags: v.list('tags', body.tags, { label: 'Tags' }),
    keywords: v.list('keywords', body.keywords, { maxItems: 100, label: 'Keywords' }),
  };
  if (doc.sku) doc.sku = doc.sku.toUpperCase();
  else if (doc.sku === '' && isCreate) doc.sku = `PH-${Date.now().toString(36).toUpperCase()}`;
  else if (doc.sku === '') v.fail('sku', 'SKU is required');
  if (doc.sku && !/^[A-Z0-9._\-/]+$/.test(doc.sku)) v.fail('sku', 'SKU may contain only letters, numbers, dot, dash, underscore and slash');

  let category = null;
  if (body.categoryId) {
    const categoryId = toObjectId(body.categoryId);
    category = categoryId ? await db.collection('categories').findOne({ _id: categoryId }) : null;
    if (!category) v.fail('categoryId', 'Selected category does not exist');
  }
  doc.categoryId = category?._id || null;
  doc.customFields = validateCustomFields(category, body.customFields, v);

  if (isCreate) {
    doc.stock = v.number('stock', body.stock, { integer: true, label: 'Initial stock' }) ?? 0;
  }
  v.assert();
  return { doc, category };
}

function sortStage(sort, admin) {
  const options = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name_asc: { name: 1 },
    name_desc: { name: -1 },
    updated: { updatedAt: -1 },
    price_asc: { sellingPrice: 1 },
    price_desc: { sellingPrice: -1 },
  };
  if (admin) {
    options.stock_asc = { stock: 1 };
    options.stock_desc = { stock: -1 };
  }
  return { ...(options[sort] || options.newest), _id: 1 };
}

export async function listProducts(user, searchParams) {
  const db = await getDb();
  const admin = isAdmin(user);
  const { page, limit, skip } = parsePaging(searchParams);
  const match = {};

  const status = searchParams.get('status');
  if (!admin) match.status = 'active'; // listing users only see active products
  else if (PRODUCT_STATUSES.includes(status)) match.status = status;

  const categoryId = toObjectId(searchParams.get('category') || '');
  if (categoryId) match.categoryId = categoryId;

  const q = (searchParams.get('q') || '').trim().slice(0, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const categories = await db.collection('categories').find({ name: rx }, { projection: { _id: 1 } }).toArray();
    match.$or = [
      { name: rx },
      { sku: rx },
      { brand: rx },
      { tags: rx },
      { keywords: rx },
      { productType: rx },
      ...(categories.length ? [{ categoryId: { $in: categories.map((c) => c._id) } }] : []),
    ];
  }

  if (admin && searchParams.get('lowStock') === '1') {
    match.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
  }

  const marketplace = (searchParams.get('marketplace') || DEFAULT_MARKETPLACE).slice(0, 40);
  const listingStatus = searchParams.get('listingStatus');

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'marketplaceListings',
        let: { pid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$productId', '$$pid'] }, { $eq: ['$marketplace', marketplace] }] } } },
          { $project: { status: 1 } },
        ],
        as: 'listing',
      },
    },
    { $addFields: { listingStatus: { $ifNull: [{ $first: '$listing.status' }, 'not_started'] } } },
  ];
  if (LISTING_STATUSES.includes(listingStatus)) pipeline.push({ $match: { listingStatus } });
  else if (listingStatus === 'pending') pipeline.push({ $match: { listingStatus: { $ne: 'listed' } } });
  pipeline.push(
    { $sort: sortStage(searchParams.get('sort'), admin) },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'categories', localField: 'categoryId', foreignField: '_id', as: 'category' } },
          { $addFields: { categoryName: { $first: '$category.name' } } },
          { $project: { listing: 0, category: 0 } },
        ],
        total: [{ $count: 'count' }],
      },
    }
  );

  const [result] = await db.collection('products').aggregate(pipeline).toArray();
  const total = result.total[0]?.count || 0;
  return {
    items: result.items.map((p) => serializeProduct(p, user)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    marketplace,
  };
}

// Loads a product the user is allowed to see, or throws 404 (no existence leak).
export async function loadProductForUser(productId, user) {
  const objectId = toObjectId(productId);
  if (!objectId) throw notFound('Product not found');
  const db = await getDb();
  const product = await db.collection('products').findOne({ _id: objectId });
  if (!product) throw notFound('Product not found');
  if (!isAdmin(user) && product.status !== 'active') throw notFound('Product not found');
  return product;
}

export async function getCategoryFor(product) {
  if (!product.categoryId) return null;
  const db = await getDb();
  return db.collection('categories').findOne({ _id: product.categoryId });
}

export function requireObjectId(value, label = 'id') {
  const objectId = toObjectId(value);
  if (!objectId) throw badRequest(`Invalid ${label}`);
  return objectId;
}
