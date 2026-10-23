import { getDb, toObjectId } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { serializeMovement } from '@/lib/inventory';
import { parsePaging } from '@/lib/validate';
import { STOCK_MOVEMENT_TYPES } from '@/lib/constants';

// Admin-only stock movement history across all products.
export const GET = route(async (request) => {
  await requireAdmin();
  const params = request.nextUrl.searchParams;
  const { page, limit, skip } = parsePaging(params, { defaultLimit: 50 });
  const filter = {};
  const productId = toObjectId(params.get('product') || '');
  if (productId) filter.productId = productId;
  if (STOCK_MOVEMENT_TYPES.includes(params.get('type'))) filter.type = params.get('type');
  const db = await getDb();
  const [movements, total] = await Promise.all([
    db.collection('stockMovements').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    db.collection('stockMovements').countDocuments(filter),
  ]);
  return json({ movements: movements.map(serializeMovement), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});
