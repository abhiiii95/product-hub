// Server-side fetch of a transformed Cloudinary image, so the browser never learns
// the Cloudinary URL or public id (used by the renew preview and the public home page).
import { ApiError } from './api';

const MAX_BYTES = 512 * 1024;

// Delivery URL for this account's Cloudinary only; null for anything else.
export function cloudinaryUrl(publicId, transform) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud || typeof publicId !== 'string' || !publicId) return null;
  const path = publicId.split('/').map(encodeURIComponent).join('/');
  const url = new URL(`https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload/${transform}/${path}`);
  if (url.protocol !== 'https:' || url.host !== 'res.cloudinary.com' || !url.pathname.startsWith(`/${cloud}/image/upload/${transform}/`)) return null;
  return url;
}

// Fetches the image and returns it as a JPEG response with the given Cache-Control.
export async function imageResponse(url, cacheControl) {
  let res;
  try {
    res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ApiError(502, 'Could not load the image');
  }
  if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) throw new ApiError(502, 'Could not load the image');
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new ApiError(502, 'Could not load the image');
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff' },
  });
}
