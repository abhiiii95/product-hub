import { getDb, toObjectId } from '@/lib/db';
import { route, notFound } from '@/lib/api';
import { cloudinaryUrl, imageResponse } from '@/lib/serverImage';
import { requireReseller } from '@/lib/auth';
import { isProductInScope } from '@/lib/access';
import { verifyToken } from '@/lib/tokens';

const BLUR = 'c_fill,w_160,h_160,e_blur:2000,q_auto:low,f_jpg';

async function readPayload(token) {
  try {
    return await verifyToken(String(token || '').slice(0, 1000), 'preview-token');
  } catch {
    return null;
  }
}

// Blurred thumbnail for a preview token. The image is fetched here so the
// browser never learns the Cloudinary URL or public id.
export const GET = route(async (request, params) => {
  const user = await requireReseller({ allowExpired: true });
  const payload = await readPayload(params.token);
  const productId = toObjectId(typeof payload?.p === 'string' ? payload.p : '');
  if (!productId) throw notFound('Image not found');

  const db = await getDb();
  const product = await db.collection('products').findOne({ _id: productId }, { projection: { status: 1, categoryId: 1, images: { $slice: 1 } } });
  // Re-check: the product may have been hidden or the reseller's access changed since the token was made.
  if (!product || product.status !== 'active' || !isProductInScope(product, user)) throw notFound('Image not found');
  const url = cloudinaryUrl(product.images?.[0]?.publicId, BLUR);
  if (!url) throw notFound('Image not found');
  return imageResponse(url, 'private, max-age=3600');
});
