import { Suspense } from 'react';
import { requirePageAdmin } from '@/lib/auth';
import { Loading } from '@/components/Feedback';
import Pricing from './Pricing';

export const metadata = { title: 'Pricing Calculator · Product Hub' };

export default async function PricingPage() {
  await requirePageAdmin();
  return (
    <Suspense fallback={<Loading />}>
      <Pricing />
    </Suspense>
  );
}
