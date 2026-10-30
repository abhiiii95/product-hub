import { Suspense } from 'react';
import { requirePageAdmin } from '@/lib/auth';
import { Loading } from '@/components/Feedback';
import Coupons from './Coupons';

export const metadata = { title: 'Coupons · Product Hub' };

export default async function CouponsPage() {
  await requirePageAdmin();
  return (
    <Suspense fallback={<Loading />}>
      <Coupons />
    </Suspense>
  );
}
