import { Suspense } from 'react';
import { Loading } from '@/components/Feedback';
import { requirePageAdmin } from '@/lib/auth';
import Workspace from './Workspace';

export const metadata = { title: 'Listing Workspace · Product Hub' };

// The shared listing workspace is admin-only; resellers use /my-listings.
export default async function ListingsPage() {
  await requirePageAdmin();
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}
