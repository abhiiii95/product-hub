import { getDb } from '@/lib/db';
import { json, readJson, route, conflict } from '@/lib/api';
import { requireUser, requireAdmin, isAdmin } from '@/lib/auth';
import { buildCategoryInput, serializeCategory } from '@/lib/categories';
import { categoryScope } from '@/lib/access';
import { logActivity } from '@/lib/activity';

export const GET = route(async () => {
  const user = await requireUser();
  const db = await getDb();
  const admin = isAdmin(user);
  // Resellers only see the categories they have access to.
  const scope = categoryScope(user);
  const filter = admin ? {} : scope.all ? { isActive: true } : { isActive: true, _id: { $in: scope.categoryIds } };
  const categories = await db
    .collection('categories')
    .find(filter)
    .sort({ name: 1 })
    .toArray();
  let counts = {};
  if (admin) {
    const rows = await db
      .collection('products')
      .aggregate([{ $group: { _id: '$categoryId', count: { $sum: 1 } } }])
      .toArray();
    counts = Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
  }
  return json({
    categories: categories.map((c) => serializeCategory(c, { productCount: admin ? counts[c._id.toString()] || 0 : undefined })),
  });
});

export const POST = route(async (request) => {
  const admin = await requireAdmin();
  const doc = buildCategoryInput(await readJson(request), { isCreate: true });
  const db = await getDb();
  if (await db.collection('categories').findOne({ slug: doc.slug })) throw conflict('A category with this name already exists');
  const now = new Date();
  const category = { ...doc, isActive: doc.isActive ?? true, createdAt: now, updatedAt: now, createdBy: admin._id };
  const { insertedId } = await db.collection('categories').insertOne(category);
  await logActivity(admin, 'category.created', { entityType: 'category', entityId: insertedId, summary: `Created category ${doc.name}` });
  return json({ category: serializeCategory({ ...category, _id: insertedId }, { productCount: 0 }) }, { status: 201 });
});
