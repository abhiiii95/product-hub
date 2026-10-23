import { getDb } from '@/lib/db';
import { json, readJson, route, badRequest, conflict } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { loadProductForUser } from '@/lib/products';
import { Validator } from '@/lib/validate';
import { logActivity } from '@/lib/activity';
import { serializeMovement } from '@/lib/inventory';

export const GET = route(async (request, params) => {
  const admin = await requireAdmin();
  const product = await loadProductForUser(params.id, admin);
  const db = await getDb();
  const movements = await db.collection('stockMovements').find({ productId: product._id }).sort({ createdAt: -1 }).limit(200).toArray();
  return json({
    stock: product.stock ?? 0,
    lowStockThreshold: product.lowStockThreshold ?? 0,
    movements: movements.map(serializeMovement),
  });
});

// Records a stock movement and applies it atomically. History is append-only.
export const POST = route(async (request, params) => {
  const admin = await requireAdmin();
  const product = await loadProductForUser(params.id, admin);
  const body = await readJson(request);
  const v = new Validator();
  const type = v.oneOf('type', body.type, ['add', 'remove', 'set'], { label: 'Movement type' });
  const quantity = v.number('quantity', body.quantity, { required: true, integer: true, min: type === 'set' ? 0 : 1, max: 1e7, label: 'Quantity' });
  const reason = v.string('reason', body.reason, { required: type !== 'add', max: 500, label: 'Reason' });
  v.assert();

  const db = await getDb();
  const products = db.collection('products');
  const now = new Date();
  let before;
  if (type === 'add') {
    before = await products.findOneAndUpdate({ _id: product._id }, { $inc: { stock: quantity }, $set: { updatedAt: now } }, { returnDocument: 'before' });
  } else if (type === 'remove') {
    before = await products.findOneAndUpdate(
      { _id: product._id, stock: { $gte: quantity } },
      { $inc: { stock: -quantity }, $set: { updatedAt: now } },
      { returnDocument: 'before' }
    );
    if (!before) throw conflict(`Cannot remove ${quantity}; only ${product.stock ?? 0} in stock`);
  } else {
    before = await products.findOneAndUpdate({ _id: product._id }, { $set: { stock: quantity, updatedAt: now } }, { returnDocument: 'before' });
  }
  if (!before) throw badRequest('Product no longer exists');

  const previousStock = before.stock ?? 0;
  const newStock = type === 'add' ? previousStock + quantity : type === 'remove' ? previousStock - quantity : quantity;
  const movement = {
    productId: product._id,
    productName: product.name,
    sku: product.sku,
    type,
    quantityChange: newStock - previousStock,
    previousStock,
    newStock,
    reason,
    userId: admin._id,
    userName: admin.name,
    createdAt: now,
  };
  const { insertedId } = await db.collection('stockMovements').insertOne(movement);
  await logActivity(admin, 'stock.changed', {
    entityType: 'product',
    entityId: product._id,
    summary: `Stock for ${product.name}: ${previousStock} → ${newStock}`,
  });
  return json({ stock: newStock, movement: serializeMovement({ ...movement, _id: insertedId }) }, { status: 201 });
});

// Update the low-stock threshold.
export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const product = await loadProductForUser(params.id, admin);
  const body = await readJson(request);
  const v = new Validator();
  const threshold = v.number('lowStockThreshold', body.lowStockThreshold, { required: true, integer: true, max: 1e7, label: 'Low-stock threshold' });
  v.assert();
  const db = await getDb();
  await db.collection('products').updateOne({ _id: product._id }, { $set: { lowStockThreshold: threshold, updatedAt: new Date() } });
  return json({ lowStockThreshold: threshold });
});
