import { getDb } from '@/lib/db';
import { json, readJson, route, conflict, badRequest } from '@/lib/api';
import { requireUser, requireAdmin } from '@/lib/auth';
import { buildProductInput, getCategoryFor, loadProductForUser, serializeProduct } from '@/lib/products';
import { serializeCategory } from '@/lib/categories';
import { destroyImageQuietly } from '@/lib/cloudinary';
import { PRODUCT_STATUSES } from '@/lib/constants';
import { logActivity } from '@/lib/activity';

export const GET = route(async (request, params) => {
  const user = await requireUser();
  const product = await loadProductForUser(params.id, user);
  const category = await getCategoryFor(product);
  return json({
    product: serializeProduct(product, user, { category }),
    category: category ? serializeCategory(category) : null,
  });
});

export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const product = await loadProductForUser(params.id, admin);
  const body = await readJson(request);
  const db = await getDb();
  const now = new Date();

  // Quick active/inactive toggle.
  if (Object.keys(body).length === 1 && body.status !== undefined) {
    if (!PRODUCT_STATUSES.includes(body.status)) throw badRequest('Invalid status');
    await db.collection('products').updateOne({ _id: product._id }, { $set: { status: body.status, updatedAt: now, updatedBy: admin._id } });
    await logActivity(admin, 'product.status', { entityType: 'product', entityId: product._id, summary: `Marked ${product.name} as ${body.status}` });
  } else {
    // Stock is deliberately excluded here: it changes only through stock movements.
    const { doc } = await buildProductInput(body, { isCreate: false });
    if (doc.sku !== product.sku && (await db.collection('products').findOne({ sku: doc.sku, _id: { $ne: product._id } }))) {
      throw conflict(`SKU ${doc.sku} is already used by another product`);
    }
    await db.collection('products').updateOne({ _id: product._id }, { $set: { ...doc, updatedAt: now, updatedBy: admin._id } });
    await logActivity(admin, 'product.updated', { entityType: 'product', entityId: product._id, summary: `Updated product ${doc.name} (${doc.sku})` });
  }

  const updated = await db.collection('products').findOne({ _id: product._id });
  const category = await getCategoryFor(updated);
  return json({ product: serializeProduct(updated, admin, { category }) });
});

export const DELETE = route(async (request, params) => {
  const admin = await requireAdmin();
  const product = await loadProductForUser(params.id, admin);
  const db = await getDb();
  await db.collection('products').deleteOne({ _id: product._id });
  await db.collection('marketplaceListings').deleteMany({ productId: product._id });
  await db.collection('resellerListings').deleteMany({ productId: product._id });
  // Stock movements are kept as history; they carry a name/SKU snapshot.
  await Promise.all((product.images || []).map((img) => destroyImageQuietly(img.publicId)));
  await logActivity(admin, 'product.deleted', { entityType: 'product', entityId: product._id, summary: `Deleted product ${product.name} (${product.sku})` });
  return json({ ok: true });
});
