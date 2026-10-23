import { Suspense } from 'react';
import { Loading } from '@/components/Feedback';
import Workspace from './Workspace';

export const metadata = { title: 'Listing Workspace · Product Hub' };

export default function ListingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}
