import { json, route } from '@/lib/api';
import { destroyCurrentSession } from '@/lib/auth';

// No requireUser here on purpose: signing out must work for expired plans and stale sessions alike.
export const POST = route(async () => {
  await destroyCurrentSession();
  return json({ ok: true });
});
