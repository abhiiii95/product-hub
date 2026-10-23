'use client';

// Image downloads happen in the browser: Cloudinary serves images with CORS,
// so files never pass through our server (no hosting response-size limits).
import { createZip, imageFileName, safeFileName } from './zip';

async function fetchImage(url) {
  const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not download an image (${res.status})`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('content-type') || 'application/octet-stream' };
}

function saveFile(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}

export async function downloadImage(sku, image, index) {
  const { bytes, type } = await fetchImage(image.url);
  saveFile(new Blob([bytes], { type }), imageFileName(sku, image, index, type));
}

export async function downloadAllImages(sku, images, onProgress) {
  const entries = [];
  const used = new Set();
  for (const [index, image] of images.entries()) {
    onProgress?.(index + 1, images.length);
    const { bytes, type } = await fetchImage(image.url);
    let name = imageFileName(sku, image, index, type);
    while (used.has(name)) name = `x-${name}`;
    used.add(name);
    entries.push({ name, data: bytes });
  }
  saveFile(new Blob([createZip(entries)], { type: 'application/zip' }), `${safeFileName(sku, 'product')}-images.zip`);
}
