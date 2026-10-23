import { requirePageAdmin } from '@/lib/auth';
import Categories from './Categories';

export const metadata = { title: 'Categories · Product Hub' };

export default async function CategoriesPage() {
  await requirePageAdmin();
  return <Categories />;
}
