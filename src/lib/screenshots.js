'use client';

// Prepares form screenshots for the AI reader. Tall screenshots are cut into
// overlapping slices so small text stays legible (the model reads at most
// ~2576 px on the long edge and downscales anything larger).
const MAX_WIDTH = 1600;
const SLICE_HEIGHT = 2000;
const OVERLAP = 120;
const MAX_TOTAL_BASE64 = 4_000_000;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function sliceImage(file, quality) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`"${file.name || 'Pasted image'}" could not be opened as an image`);
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const parts = [];
  for (let y = 0; y < height; y += SLICE_HEIGHT - OVERLAP) {
    const sliceHeight = Math.min(SLICE_HEIGHT, height - y);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = sliceHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, sliceHeight);
    ctx.drawImage(bitmap, 0, y / scale, bitmap.width, sliceHeight / scale, 0, 0, width, sliceHeight);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    parts.push({ mediaType: 'image/jpeg', data: await blobToBase64(blob) });
    if (y + sliceHeight >= height) break;
  }
  bitmap.close();
  return parts;
}

// Returns [{ mediaType, data }] for all screenshots, in order.
export async function prepareScreenshots(files) {
  for (const quality of [0.85, 0.7, 0.55]) {
    const parts = [];
    for (const file of files) parts.push(...(await sliceImage(file, quality)));
    const total = parts.reduce((sum, p) => sum + p.data.length, 0);
    if (total <= MAX_TOTAL_BASE64) {
      if (parts.length > 8) throw new Error('Too many screenshots at once. Use at most 2–3 screenshots of the form.');
      return parts;
    }
  }
  throw new Error('The screenshots are too large. Crop them to the form area and try again.');
}
