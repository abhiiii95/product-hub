'use client';

// Browser-side fetch wrapper. Returns { ok, status, data, error } and sends the
// user back to the login page when the session has ended (e.g. account deactivated).
export async function api(url, { method = 'GET', body, headers } = {}) {
  const init = { method, headers: { ...(headers || {}) }, credentials: 'same-origin' };
  if (body !== undefined && !(body instanceof FormData)) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    init.body = body;
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, data: null, error: 'Network error. Check your connection and try again.' };
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/auth/')) {
    window.location.href = '/login?expired=1';
  }
  return { ok: res.ok, status: res.status, data, error: res.ok ? null : data?.error || `Request failed (${res.status})` };
}

// Upload with progress using XMLHttpRequest (fetch has no upload progress events).
export function uploadWithProgress(url, formData, { method = 'POST', onProgress } = {}) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const data = xhr.response;
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (xhr.status === 401 && url.startsWith('/')) window.location.href = '/login?expired=1';
      // Our API returns { error: "..." }; Cloudinary returns { error: { message } }.
      const message = typeof data?.error === 'string' ? data.error : data?.error?.message;
      resolve({ ok, status: xhr.status, data, error: ok ? null : message || `Upload failed (${xhr.status})` });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, data: null, error: 'Network error during upload' });
    xhr.send(formData);
  });
}

const MAX_SIDE = 2500;
const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;

// Shrinks large photos in the browser before upload (phone photos are often
// 4–10 MB). Small images, GIFs and anything the browser can't decode are sent as-is.
export async function prepareImageForUpload(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || typeof createImageBitmap !== 'function') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= COMPRESS_ABOVE_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

// One signature covers a whole batch of uploads for a product (valid ~1 hour).
export async function getUploadSignature(productId) {
  const sig = await api(`/api/products/${productId}/images/sign`, { method: 'POST' });
  return sig.ok ? { ok: true, signature: sig.data } : { ok: false, error: sig.error };
}

// Uploads a file straight from the browser to Cloudinary. Returns its publicId.
export async function uploadToStorage(signature, file, onProgress) {
  const prepared = await prepareImageForUpload(file);
  const form = new FormData();
  form.append('file', prepared);
  form.append('api_key', signature.apiKey);
  form.append('signature', signature.signature);
  for (const [key, value] of Object.entries(signature.params)) form.append(key, String(value));
  const uploaded = await uploadWithProgress(signature.uploadUrl, form, { onProgress });
  if (!uploaded.ok) return { ok: false, error: `Image storage: ${uploaded.error}` };
  return { ok: true, publicId: uploaded.data.public_id };
}

// Attaches an uploaded file to the product (or replaces `imageId` with it).
export async function attachImage(productId, publicId, { label, imageId } = {}) {
  const res = imageId
    ? await api(`/api/products/${productId}/images/${imageId}`, { method: 'PUT', body: { publicId } })
    : await api(`/api/products/${productId}/images`, { method: 'POST', body: { publicId, label } });
  return res.ok ? { ok: true, image: res.data.image } : { ok: false, error: res.error };
}

// Uploads several files: up to 3 transfers run at once, but images are attached
// in the order given so the first file stays the main image.
// onItem(index, { progress } | { done: true, image } | { error }) reports per-file state.
export async function uploadProductImages(productId, files, { label, onItem } = {}) {
  const sig = await getUploadSignature(productId);
  if (!sig.ok) {
    files.forEach((_, i) => onItem?.(i, { error: sig.error }));
    return { uploaded: [], failed: files.length, lastError: sig.error };
  }
  const transfers = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      transfers[i] = uploadToStorage(sig.signature, files[i], (p) => onItem?.(i, { progress: p }));
      await transfers[i];
    }
  };
  const workers = Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));

  const uploaded = [];
  let failed = 0;
  let lastError = '';
  for (let i = 0; i < files.length; i++) {
    while (!transfers[i]) await new Promise((r) => setTimeout(r, 50));
    const transfer = await transfers[i];
    const res = transfer.ok ? await attachImage(productId, transfer.publicId, { label }) : transfer;
    if (res.ok) {
      uploaded.push(res.image);
      onItem?.(i, { done: true, image: res.image });
    } else {
      failed += 1;
      lastError = res.error;
      onItem?.(i, { error: res.error });
    }
  }
  await workers;
  return { uploaded, failed, lastError };
}

// Single upload (used for "Replace").
export async function uploadProductImage(productId, file, { label, imageId, onProgress } = {}) {
  const sig = await getUploadSignature(productId);
  if (!sig.ok) return { ok: false, error: sig.error };
  const transfer = await uploadToStorage(sig.signature, file, onProgress);
  if (!transfer.ok) return transfer;
  return attachImage(productId, transfer.publicId, { label, imageId });
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value));
}

export function formatDate(value, withTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(2)}%`;
}

export function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
