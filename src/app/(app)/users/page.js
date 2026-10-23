import { Suspense } from 'react';
import { requirePageAdmin } from '@/lib/auth';
import { Loading } from '@/components/Feedback';
import Users from './Users';

export const metadata = { title: 'User Management · Product Hub' };

export default async function UsersPage() {
  await requirePageAdmin();
  return (
    <Suspense fallback={<Loading />}>
      <Users />
    </Suspense>
  );
}
