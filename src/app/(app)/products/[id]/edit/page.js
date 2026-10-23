import { requirePageAdmin } from '@/lib/auth';
import EditProduct from './EditProduct';

export const metadata = { title: 'Edit Product · Product Hub' };

export default async function EditProductPage({ params }) {
  await requirePageAdmin();
  const { id } = await params;
  return <EditProduct id={id} />;
}
