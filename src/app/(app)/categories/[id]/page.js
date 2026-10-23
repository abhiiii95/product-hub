import { requirePageAdmin } from '@/lib/auth';
import CategoryEditor from './CategoryEditor';

export const metadata = { title: 'Category Fields · Product Hub' };

export default async function CategoryPage({ params }) {
  await requirePageAdmin();
  const { id } = await params;
  return <CategoryEditor id={id} />;
}
