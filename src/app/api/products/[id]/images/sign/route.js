import { json, route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { loadProductForUser } from '@/lib/products';
import { createUploadSignature } from '@/lib/cloudinary';

// Admin-only: signed parameters for one direct browser → Cloudinary upload.
export const POST = route(async (request, params) => {
  const admin = await requireAdmin();
  const product = await loadProductForUser(params.id, admin);
  return json(createUploadSignature(product._id.toString()));
});
