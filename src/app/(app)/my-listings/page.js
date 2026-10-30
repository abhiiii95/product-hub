import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Loading } from '@/components/Feedback';
import { requirePageUser } from '@/lib/auth';
import MyListings from './MyListings';

export const metadata = { title: 'My Listings · Product Hub' };

// A reseller's private tracker. Admins use the shared Listing Workspace instead.
export default async function MyListingsPage() {
  const user = await requirePageUser();
  if (user.role === 'admin') redirect('/listings');
  return (
    <Suspense fallback={<Loading />}>
      <MyListings />
    </Suspense>
  );
}
