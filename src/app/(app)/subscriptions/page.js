import { Suspense } from 'react';
import { requirePageAdmin } from '@/lib/auth';
import { Loading } from '@/components/Feedback';
import Subscriptions from './Subscriptions';

export const metadata = { title: 'Subscriptions · Product Hub' };

export default async function SubscriptionsPage() {
  await requirePageAdmin();
  return (
    <Suspense fallback={<Loading />}>
      <Subscriptions />
    </Suspense>
  );
}
