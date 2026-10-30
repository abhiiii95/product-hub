import { getDb } from '@/lib/db';
import { json, route } from '@/lib/api';
import { clientIp, hashKey, hit } from '@/lib/rateLimit';

// Public: active categories with their active-product counts, for the m1 category picker.
export const GET = route(async (request) => {
  await hit(`cats:ip:${hashKey(clientIp(request))}`, 120, 3600);
  const db = await getDb();
  const [categories, counts] = await Promise.all([
    db.collection('categories').find({ isActive: { $ne: false } }, { projection: { name: 1 } }).sort({ name: 1 }).toArray(),
    db.collection('products').aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]).toArray(),
  ]);
  const byId = Object.fromEntries(counts.map((r) => [String(r._id), r.count]));
  return json({
    categories: categories.map((c) => ({ id: c._id.toString(), name: c.name, productCount: byId[c._id.toString()] || 0 })),
  });
});
