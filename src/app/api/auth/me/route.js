import { json, route } from '@/lib/api';
import { requireUser, publicUser } from '@/lib/auth';

export const GET = route(async () => {
  const user = await requireUser();
  return json({ user: publicUser(user) });
});
