import { getDb, toObjectId } from '@/lib/db';
import { route, notFound } from '@/lib/api';
import { cloudinaryUrl, imageResponse } from '@/lib/serverImage';
import { verifyToken } from '@/lib/tokens';
import { clientIp, hashKey, hit } from '@/lib/rateLimit';

// Small, lightly blurred, low quality: enough to show what is sold, not usable for a listing.
const TEASER = 'c_fill,w_320,h_320,q_auto:low,f_jpg,e_blur:300';
// Same HKDF info as catalogPreview.js signs with.
const CATALOG_IMAGE_INFO = 'public-catalog';

function readPayload(token) {
  try {
    return verifyToken(String(token || '').slice(0, 1000), CATALOG_IMAGE_INFO);
  } catch {
    return null;
  }
}

// Public (no login): home page catalog thumbnails. The token is signed by catalogPreview
// for one product's first image; the image is fetched here so the original Cloudinary
// URL never reaches the browser.
export const GET = route(async (request, params) => {
  // A home page shows up to 24 thumbnails, so this allows many visits per hour.
  await hit(`catimg:ip:${hashKey(clientIp(request))}`, 300, 3600);
  const payload = readPayload(params.token);
  const productId = toObjectId(typeof payload?.p === 'string' ? payload.p : '');
  if (!productId || payload.i !== 0) throw notFound('Image not found');

  const db = await getDb();
  const product = await db.collection('products').findOne({ _id: productId }, { projection: { status: 1, images: { $slice: 1 } } });
  // Re-check: the product may have been hidden since the page was rendered.
  if (!product || product.status !== 'active') throw notFound('Image not found');
  const url = cloudinaryUrl(product.images?.[0]?.publicId, TEASER);
  if (!url) throw notFound('Image not found');
  return imageResponse(url, 'public, max-age=3600');
});
