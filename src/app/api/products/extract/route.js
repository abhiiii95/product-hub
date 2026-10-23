import { getDb } from '@/lib/db';
import { json, readJson, route, badRequest } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { extractFromScreenshots } from '@/lib/extract';

// Vision calls can take a while; the AI request itself times out at 55 s.
export const maxDuration = 60;

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 8;
const MAX_TOTAL_BASE64 = 4_200_000; // keeps the request under hosting body limits

// Admin-only: read marketplace-form screenshots and return suggested field values.
// Nothing is saved here; the admin reviews the filled form and saves it.
export const POST = route(async (request) => {
  await requireAdmin();
  const body = await readJson(request);
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length === 0) throw badRequest('Add at least one screenshot');
  if (images.length > MAX_IMAGES) throw badRequest(`Use at most ${MAX_IMAGES} screenshot parts`);
  let total = 0;
  const clean = images.map((img) => {
    if (!MEDIA_TYPES.includes(img?.mediaType) || typeof img?.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(img.data)) {
      throw badRequest('Screenshots must be JPEG, PNG or WebP images');
    }
    total += img.data.length;
    return { mediaType: img.mediaType, data: img.data };
  });
  if (total > MAX_TOTAL_BASE64) throw badRequest('Screenshots are too large. Crop them to the form area.');

  const db = await getDb();
  const categories = await db.collection('categories').find({ isActive: { $ne: false } }).sort({ name: 1 }).toArray();
  const result = await extractFromScreenshots(clean, categories);
  return json({ result });
});
