import { getDb } from '@/lib/db';
import { json, readJson, route, conflict } from '@/lib/api';
import { requireUser, requireAdmin } from '@/lib/auth';
import { buildProductInput, listProducts, serializeProduct } from '@/lib/products';
import { logActivity } from '@/lib/activity';

export const GET = route(async (request) => {
  const user = await requireUser();
  return json(await listProducts(user, request.nextUrl.searchParams));
});

export const POST = route(async (request) => {
  const admin = await requireAdmin();
  const { doc, category } = await buildProductInput(await readJson(request), { isCreate: true });
  const db = await getDb();
  if (await db.collection('products').findOne({ sku: doc.sku })) throw conflict(`SKU ${doc.sku} is already used by another product`);

  const now = new Date();
  const product = { ...doc, images: [], createdAt: now, updatedAt: now, createdBy: admin._id, updatedBy: admin._id };
  const { insertedId } = await db.collection('products').insertOne(product);

  if (doc.stock > 0) {
    await db.collection('stockMovements').insertOne({
      productId: insertedId,
      productName: doc.name,
      sku: doc.sku,
      type: 'initial',
      quantityChange: doc.stock,
      previousStock: 0,
      newStock: doc.stock,
      reason: 'Initial stock on product creation',
      userId: admin._id,
      userName: admin.name,
      createdAt: now,
    });
  }
  await logActivity(admin, 'product.created', { entityType: 'product', entityId: insertedId, summary: `Added product ${doc.name} (${doc.sku})` });
  return json({ product: serializeProduct({ ...product, _id: insertedId }, admin, { category }) }, { status: 201 });
});
