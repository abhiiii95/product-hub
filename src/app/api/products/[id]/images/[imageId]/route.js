import { getDb } from '@/lib/db';
import { json, readJson, route, notFound } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { loadProductForUser, serializeImage } from '@/lib/products';
import { getUploadedImage, destroyImage, destroyImageQuietly } from '@/lib/cloudinary';
import { logActivity } from '@/lib/activity';

async function loadImage(params, admin) {
  const product = await loadProductForUser(params.id, admin);
  const image = (product.images || []).find((img) => img.id === params.imageId);
  if (!image) throw notFound('Image not found');
  return { product, image };
}

// Update label/description.
export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const { product, image } = await loadImage(params, admin);
  const body = await readJson(request);
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 200) : '';
  const db = await getDb();
  await db
    .collection('products')
    .updateOne({ _id: product._id, 'images.id': image.id }, { $set: { 'images.$.label': label, updatedAt: new Date() } });
  return json({ image: serializeImage({ ...image, label }) });
});

// Replace the file behind an image with a newly uploaded one ({ publicId }),
// keeping its position and label.
export const PUT = route(async (request, params) => {
  const admin = await requireAdmin();
  const { product, image } = await loadImage(params, admin);
  const body = await readJson(request);
  const uploaded = await getUploadedImage(body.publicId, product._id.toString());
  if (uploaded.publicId === image.publicId) return json({ image: serializeImage(image) });
  const db = await getDb();
  const result = await db.collection('products').updateOne(
    { _id: product._id, 'images.id': image.id },
    {
      $set: {
        'images.$.publicId': uploaded.publicId,
        'images.$.url': uploaded.url,
        'images.$.width': uploaded.width,
        'images.$.height': uploaded.height,
        'images.$.format': uploaded.format,
        'images.$.bytes': uploaded.bytes,
        'images.$.replacedAt': new Date(),
        updatedAt: new Date(),
        updatedBy: admin._id,
      },
    }
  );
  if (result.matchedCount === 0) {
    await destroyImageQuietly(uploaded.publicId);
    throw notFound('Image was removed before the replacement finished');
  }
  await destroyImageQuietly(image.publicId);
  await logActivity(admin, 'product.image_replaced', { entityType: 'product', entityId: product._id, summary: `Replaced an image of ${product.name}` });
  return json({ image: serializeImage({ ...image, ...uploaded }) });
});

export const DELETE = route(async (request, params) => {
  const admin = await requireAdmin();
  const { product, image } = await loadImage(params, admin);
  await destroyImage(image.publicId);
  const db = await getDb();
  await db
    .collection('products')
    .updateOne({ _id: product._id }, { $pull: { images: { id: image.id } }, $set: { updatedAt: new Date(), updatedBy: admin._id } });
  await logActivity(admin, 'product.image_deleted', { entityType: 'product', entityId: product._id, summary: `Deleted an image of ${product.name}` });
  return json({ ok: true });
});
