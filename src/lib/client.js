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

// Uploads a file straight from the browser to Cloudinary using a signature from
// our server, then asks the server to attach it to the product.
// `imageId` given → replaces that image instead of adding a new one.
export async function uploadProductImage(productId, file, { label, imageId, onProgress } = {}) {
  const sig = await api(`/api/products/${productId}/images/sign`, { method: 'POST' });
  if (!sig.ok) return { ok: false, error: sig.error };
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.data.apiKey);
  form.append('signature', sig.data.signature);
  for (const [key, value] of Object.entries(sig.data.params)) form.append(key, String(value));
  const uploaded = await uploadWithProgress(sig.data.uploadUrl, form, { onProgress });
  if (!uploaded.ok) return { ok: false, error: `Image storage: ${uploaded.error}` };
  const publicId = uploaded.data.public_id;
  const res = imageId
    ? await api(`/api/products/${productId}/images/${imageId}`, { method: 'PUT', body: { publicId } })
    : await api(`/api/products/${productId}/images`, { method: 'POST', body: { publicId, label } });
  return res.ok ? { ok: true, image: res.data.image } : { ok: false, error: res.error };
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
