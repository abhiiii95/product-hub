'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/components/AppShell';
import { Loading, ErrorState, useConfirm, useToast } from '@/components/Feedback';
import { ProductStatusBadge, StockBadge } from '@/components/Badges';
import { CopyField } from '@/components/CopyButton';
import CopyButton from '@/components/CopyButton';
import ImageGallery from '@/components/ImageGallery';
import ListingPanel from '@/components/ListingPanel';
import PricingCard from '@/components/PricingCard';
import StockPanel from '@/components/StockPanel';
import { formatCustomValue } from '@/lib/customFields';
import { api, formatDate, formatMoney } from '@/lib/client';

function dimensionsText(d) {
  if (!d || (d.length == null && d.width == null && d.height == null)) return '';
  return `${d.length ?? '?'} × ${d.width ?? '?'} × ${d.height ?? '?'} ${d.unit || 'cm'}`;
}

export default function ProductDetail({ id }) {
  const user = useCurrentUser();
  const admin = user.role === 'admin';
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await api(`/api/products/${id}`);
    if (res.ok) setData(res.data);
    else setError(res.status === 404 ? 'This product does not exist or is not available.' : res.error);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loading label="Loading product…" />;
  const { product, category } = data;

  const toggleStatus = async () => {
    const status = product.status === 'active' ? 'inactive' : 'active';
    const res = await api(`/api/products/${id}`, { method: 'PATCH', body: { status } });
    if (!res.ok) return toast(res.error, 'error');
    toast(`Product marked ${status}`, 'success');
    setData((d) => ({ ...d, product: res.data.product }));
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${product.name}"?`,
      message: 'This permanently deletes the product, its images and its marketplace listings. Stock history is kept.',
      confirmLabel: 'Delete product',
    });
    if (!ok) return;
    const res = await api(`/api/products/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast(res.error, 'error');
    toast('Product deleted', 'success');
    router.push('/products');
  };

  const customFields = (category?.fields || [])
    .map((f) => ({ field: f, value: formatCustomValue(f, product.customFields[f.key]) }))
    .filter((x) => x.value !== '');
  const attributesText = [
    product.brand && `Brand: ${product.brand}`,
    product.productType && `Product type: ${product.productType}`,
    product.material && `Material: ${product.material}`,
    product.color && `Color: ${product.color}`,
    dimensionsText(product.dimensions) && `Dimensions: ${dimensionsText(product.dimensions)}`,
    product.weight != null && `Weight: ${product.weight} g`,
    ...customFields.map((x) => `${x.field.label}: ${x.value}`),
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <Link href="/products">Products</Link> / {product.categoryName || 'Uncategorised'}
          </div>
          <h1>{product.name}</h1>
          <div className="row">
            <span className="mono small">{product.sku}</span>
            <ProductStatusBadge status={product.status} />
            <StockBadge product={product} />
          </div>
        </div>
        {admin && (
          <div className="row">
            <Link className="btn btn-primary" href={`/products/${id}/edit`}>
              Edit product &amp; images
            </Link>
            <button type="button" className="btn" onClick={toggleStatus}>
              Mark {product.status === 'active' ? 'inactive' : 'active'}
            </button>
            <button type="button" className="btn btn-danger" onClick={remove}>
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="detail-layout">
        <div className="stack">
          <ImageGallery sku={product.sku} images={product.images} productName={product.name} />
          <div className="card">
            <div className="card-header">
              <h2>Product information</h2>
              <CopyButton text={attributesText} label="Copy all attributes" what="all product attributes" />
            </div>
            <CopyField label="Product name" value={product.name} />
            <CopyField label="SKU" value={product.sku} />
            <CopyField label="Description" value={product.description} multiline />
            <div className="grid-2" style={{ gap: '0 0.75rem' }}>
              <CopyField label="Category" value={product.categoryName} />
              <CopyField label="Brand" value={product.brand} />
              <CopyField label="Product type" value={product.productType} />
              <CopyField label="Material" value={product.material} />
              <CopyField label="Color" value={product.color} />
              <CopyField label="Dimensions" value={dimensionsText(product.dimensions)} />
              <CopyField label="Weight (g)" value={product.weight} />
              <CopyField label="Selling price" value={product.sellingPrice != null ? product.sellingPrice : ''} />
            </div>
            {customFields.length > 0 && (
              <>
                <h3 className="mt-1">{category.name} details</h3>
                <div className="grid-2" style={{ gap: '0 0.75rem' }}>
                  {customFields.map(({ field, value }) => (
                    <CopyField key={field.id} label={field.label} value={value} multiline={field.type === 'textarea'} />
                  ))}
                </div>
              </>
            )}
            <CopyField label="Keywords" value={product.keywords} />
            {product.tags.length > 0 && (
              <div className="chips" aria-label="Tags">
                {product.tags.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <p className="small muted mt-1">
              Added {formatDate(product.createdAt)} · Updated {formatDate(product.updatedAt)}
              {product.sellingPrice != null && ` · Price ${formatMoney(product.sellingPrice)}`}
            </p>
          </div>
        </div>

        <div className="stack">
          <ListingPanel productId={id} />
          {admin && <PricingCard pricing={product.pricing} />}
          {admin && (
            <div className="card">
              <h2>Supplier &amp; internal notes</h2>
              <dl className="kv">
                <dt>Supplier</dt>
                <dd>{product.supplier || '—'}</dd>
                <dt>Internal notes</dt>
                <dd className="pre-wrap">{product.internalNotes || '—'}</dd>
              </dl>
            </div>
          )}
          {admin && (
            <StockPanel
              productId={id}
              onStockChange={(changes) =>
                setData((d) => {
                  const p = { ...d.product, ...changes };
                  return { ...d, product: { ...p, inStock: p.stock > 0, isLowStock: p.stock <= p.lowStockThreshold } };
                })
              }
            />
          )}
        </div>
      </div>
    </>
  );
}
