import { getDb, toObjectId } from '@/lib/db';
import { json, readJson, route, notFound, conflict } from '@/lib/api';
import { requireUser, requireAdmin, isAdmin } from '@/lib/auth';
import { buildCategoryInput, serializeCategory } from '@/lib/categories';
import { isCategoryInScope } from '@/lib/access';
import { logActivity } from '@/lib/activity';

async function loadCategory(id) {
  const objectId = toObjectId(id);
  const db = await getDb();
  const category = objectId ? await db.collection('categories').findOne({ _id: objectId }) : null;
  if (!category) throw notFound('Category not found');
  return category;
}

export const GET = route(async (request, params) => {
  const user = await requireUser();
  const category = await loadCategory(params.id);
  if (!isAdmin(user) && (category.isActive === false || !isCategoryInScope(category._id, user))) throw notFound('Category not found');
  const db = await getDb();
  const productCount = isAdmin(user) ? await db.collection('products').countDocuments({ categoryId: category._id }) : undefined;
  return json({ category: serializeCategory(category, { productCount }) });
});

export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const category = await loadCategory(params.id);
  const doc = buildCategoryInput(await readJson(request), { isCreate: false });
  const db = await getDb();

  if (doc.slug && doc.slug !== category.slug && (await db.collection('categories').findOne({ slug: doc.slug }))) {
    throw conflict('A category with this name already exists');
  }

  await db.collection('categories').updateOne({ _id: category._id }, { $set: { ...doc, updatedAt: new Date() } });

  // When a field's key is renamed, move stored product values to the new key.
  if (doc.fields) {
    const oldById = new Map((category.fields || []).map((f) => [f.id, f.key]));
    const renames = {};
    for (const field of doc.fields) {
      const oldKey = oldById.get(field.id);
      if (oldKey && oldKey !== field.key) renames[`customFields.${oldKey}`] = `customFields.${field.key}`;
    }
    if (Object.keys(renames).length) {
      await db.collection('products').updateMany({ categoryId: category._id }, { $rename: renames });
    }
  }

  const changes = Object.keys(doc).filter((k) => k !== 'slug');
  const summary =
    doc.isActive === false ? `Deactivated category ${category.name}` : doc.isActive === true && changes.length === 1 ? `Reactivated category ${category.name}` : `Updated category ${doc.name || category.name} (${changes.join(', ')})`;
  await logActivity(admin, 'category.updated', { entityType: 'category', entityId: category._id, summary });

  const updated = await db.collection('categories').findOne({ _id: category._id });
  const productCount = await db.collection('products').countDocuments({ categoryId: category._id });
  return json({ category: serializeCategory(updated, { productCount }) });
});

// Hard delete is only allowed for unused categories; otherwise deactivate.
export const DELETE = route(async (request, params) => {
  const admin = await requireAdmin();
  const category = await loadCategory(params.id);
  const db = await getDb();
  const inUse = await db.collection('products').countDocuments({ categoryId: category._id });
  if (inUse > 0) throw conflict(`This category is used by ${inUse} product(s). Deactivate it instead.`);
  await db.collection('categories').deleteOne({ _id: category._id });
  await logActivity(admin, 'category.deleted', { entityType: 'category', entityId: category._id, summary: `Deleted category ${category.name}` });
  return json({ ok: true });
});
