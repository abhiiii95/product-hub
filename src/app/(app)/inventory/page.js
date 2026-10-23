import { Suspense } from 'react';
import { requirePageAdmin } from '@/lib/auth';
import { Loading } from '@/components/Feedback';
import Inventory from './Inventory';

export const metadata = { title: 'Inventory · Product Hub' };

export default async function InventoryPage() {
  await requirePageAdmin();
  return (
    <Suspense fallback={<Loading />}>
      <Inventory />
    </Suspense>
  );
}
