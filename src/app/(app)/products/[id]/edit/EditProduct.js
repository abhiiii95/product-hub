'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import ProductForm from '@/components/ProductForm';
import ImageManager from '@/components/ImageManager';
import { Loading, ErrorState } from '@/components/Feedback';
import { api } from '@/lib/client';

export default function EditProduct({ id }) {
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await api(`/api/products/${id}`);
    if (res.ok) setProduct(res.data.product);
    else setError(res.error);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!product) return <Loading />;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <Link href="/products">Products</Link> / <Link href={`/products/${id}`}>{product.name}</Link> / Edit
          </div>
          <h1>Edit product</h1>
        </div>
        <Link className="btn" href={`/products/${id}`}>View product</Link>
      </div>
      <div className="stack">
        <ImageManager productId={id} sku={product.sku} initialImages={product.images} />
        <div className="card">
          <h2>Product details</h2>
          <ProductForm product={product} />
        </div>
      </div>
    </>
  );
}
