// Minimal signed Cloudinary client using fetch + node:crypto. Server-only.
import { createHash } from 'node:crypto';
import { ApiError } from './api';

function config() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new ApiError(503, 'Image storage is not configured. Set the Cloudinary environment variables.');
  }
  return { cloudName, apiKey, apiSecret, folder: process.env.CLOUDINARY_FOLDER || 'product-hub' };
}

function sign(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

async function callApi(path, form) {
  const { cloudName } = config();
  let res;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${path}`, { method: 'POST', body: form });
  } catch (err) {
    console.error('[cloudinary] network error', err);
    throw new ApiError(502, 'Could not reach the image storage service. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[cloudinary] error', res.status, data?.error?.message);
    throw new ApiError(502, `Image storage error: ${data?.error?.message || res.statusText}`);
  }
  return data;
}

const productFolder = (productId) => `${config().folder}/${productId}`;

// Signed parameters that let the browser upload one image straight to Cloudinary
// (avoids hosting request-size limits). The API secret never leaves the server;
// the signature only allows image formats, into this product's folder, for ~1 hour.
export function createUploadSignature(productId) {
  const { cloudName, apiKey, apiSecret } = config();
  const params = {
    allowed_formats: 'jpg,png,webp,gif,avif',
    folder: productFolder(productId),
    timestamp: Math.floor(Date.now() / 1000),
  };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    apiKey,
    params,
    signature: sign(params, apiSecret),
  };
}

// Looks up an uploaded image via the Admin API so stored metadata comes from
// Cloudinary itself, and checks it belongs to this product's folder.
export async function getUploadedImage(publicId, productId) {
  const { cloudName, apiKey, apiSecret } = config();
  if (typeof publicId !== 'string' || publicId.length > 300 || !/^[\w\-/.]+$/.test(publicId)) {
    throw new ApiError(400, 'Invalid image reference');
  }
  const path = publicId.split('/').map(encodeURIComponent).join('/');
  let res;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload/${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}` },
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[cloudinary] network error', err);
    throw new ApiError(502, 'Could not reach the image storage service. Try again.');
  }
  if (res.status === 404) throw new ApiError(400, 'The uploaded image was not found in storage');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[cloudinary] lookup error', res.status, data?.error?.message);
    throw new ApiError(502, `Image storage error: ${data?.error?.message || res.statusText}`);
  }
  const expected = productFolder(productId);
  if (!data.public_id?.startsWith(`${expected}/`) && data.asset_folder !== expected) {
    throw new ApiError(400, 'This image was not uploaded for this product');
  }
  return {
    publicId: data.public_id,
    url: data.secure_url,
    width: data.width || null,
    height: data.height || null,
    format: data.format || null,
    bytes: data.bytes || null,
  };
}

export async function destroyImage(publicId) {
  if (!publicId) return;
  const { apiKey, apiSecret } = config();
  const params = { public_id: publicId, invalidate: 'true', timestamp: Math.floor(Date.now() / 1000) };
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.append(key, String(value));
  form.append('api_key', apiKey);
  form.append('signature', sign(params, apiSecret));
  const data = await callApi('image/destroy', form);
  if (data.result !== 'ok' && data.result !== 'not found') {
    throw new ApiError(502, `Image storage could not delete the image (${data.result})`);
  }
}

// Best-effort deletion used for cleanup paths where the DB change already succeeded.
export async function destroyImageQuietly(publicId) {
  try {
    await destroyImage(publicId);
  } catch (err) {
    console.error('[cloudinary] cleanup failed for', publicId, err?.message);
  }
}
