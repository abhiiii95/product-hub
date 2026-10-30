import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import MyCategories from './MyCategories';

export const metadata = { title: 'My Categories · Product Hub' };

// A reseller picks the categories their plan allows. Admins manage categories elsewhere.
export default async function MyCategoriesPage() {
  const user = await requirePageUser();
  if (user.role === 'admin') redirect('/categories');
  return <MyCategories />;
}
