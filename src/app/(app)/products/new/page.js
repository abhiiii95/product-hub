import ProductForm from '@/components/ProductForm';
import { requirePageAdmin } from '@/lib/auth';
import { screenshotProvider } from '@/lib/extract';
import Link from 'next/link';

export const metadata = { title: 'Add Product · Product Hub' };

export default async function NewProductPage() {
  await requirePageAdmin();
  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><Link href="/products">Products</Link> / New</div>
          <h1>Add product</h1>
          <p>Pick images here; they upload as soon as the product is saved.</p>
        </div>
      </div>
      <div className="card">
        {/* The screenshot reader is shown only when an AI key is configured on the server. */}
        <ProductForm screenshotEnabled={Boolean(screenshotProvider())} />
      </div>
    </>
  );
}
