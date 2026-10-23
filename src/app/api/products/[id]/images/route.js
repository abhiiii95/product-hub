import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { json, readJson, route, badRequest, conflict } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { loadProductForUser, serializeImage } from '@/lib/products';
import { getUploadedImage } from '@/lib/cloudinary';
import { logActivity } from '@/lib/activity';

// Registers an image the browser uploaded directly to Cloudinary ({ publicId, label }).
// Metadata is read from Cloudinary, never trusted from the client.
export const POST = route(async (request, params) => {
  const admin = await requireAdmin();
  const product = await loadProductForUser(params.id, admin);
  const body = await readJson(request);
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 200) : '';
  const uploaded = await getUploadedImage(body.publicId, product._id.toString());

  const image = { id: randomBytes(8).toString('hex'), ...uploaded, label, createdAt: new Date() };
  const db = await getDb();
  const result = await db
    .collection('products')
    .updateOne(
      { _id: product._id, 'images.publicId': { $ne: uploaded.publicId } },
      { $push: { images: image }, $set: { updatedAt: new Date(), updatedBy: admin._id } }
    );
  if (result.matchedCount === 0) throw conflict('This image is already added to the product');
  await logActivity(admin, 'product.images_added', { entityType: 'product', entityId: product._id, summary: `Uploaded an image to ${product.name}` });
  return json({ image: serializeImage(image) }, { status: 201 });
});

// Reorder images ({ order: [imageId, ...] }) or set the main image ({ mainImageId }).
// The first image is the main image.
export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const product = await loadProductForUser(params.id, admin);
  const body = await readJson(request);
  const current = product.images || [];
  let next;

  if (Array.isArray(body.order)) {
    const ids = body.order.map(String);
    const byId = new Map(current.map((img) => [img.id, img]));
    if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((x) => byId.has(x))) {
      throw badRequest('Image order must include every image exactly once');
    }
    next = ids.map((x) => byId.get(x));
  } else if (typeof body.mainImageId === 'string') {
    const main = current.find((img) => img.id === body.mainImageId);
    if (!main) throw badRequest('Image not found');
    next = [main, ...current.filter((img) => img.id !== main.id)];
  } else {
    throw badRequest('Provide "order" or "mainImageId"');
  }

  const db = await getDb();
  // Optimistic concurrency: only apply if the images haven't changed since we read them.
  const result = await db
    .collection('products')
    .updateOne({ _id: product._id, images: current }, { $set: { images: next, updatedAt: new Date(), updatedBy: admin._id } });
  if (result.matchedCount === 0) throw conflict('Images were changed by another action. Reload and try again.');
  return json({ images: next.map(serializeImage) });
});
