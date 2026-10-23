import { Suspense } from 'react';
import { Loading } from '@/components/Feedback';
import Catalog from './Catalog';

export const metadata = { title: 'Product Catalog · Product Hub' };

export default function ProductsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Catalog />
    </Suspense>
  );
}
