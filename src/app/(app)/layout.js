import AppShell from '@/components/AppShell';
import { publicUser, requirePageUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Every page in this group requires a valid session for an active account.
export default async function AuthenticatedLayout({ children }) {
  const user = await requirePageUser();
  return <AppShell user={publicUser(user)}>{children}</AppShell>;
}
