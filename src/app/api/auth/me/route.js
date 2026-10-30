import { json, route } from '@/lib/api';
import { requireUser, publicUser } from '@/lib/auth';

// Works for expired resellers too: the client reads `user.plan` to send them to /renew.
export const GET = route(async () => {
  const user = await requireUser({ allowExpired: true });
  return json({ user: publicUser(user) });
});
