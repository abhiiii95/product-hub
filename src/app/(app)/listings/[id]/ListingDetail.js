'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/components/AppShell';
import { Loading, ErrorState } from '@/components/Feedback';
import { ListingStatusBadge } from '@/components/Badges';
import ImageGallery from '@/components/ImageGallery';
import ListingEditor from '@/components/ListingEditor';
import { ListingContent, ListingWorkflow } from '@/components/ListingView';
import { api } from '@/lib/client';

export default function ListingDetail({ id }) {
  const user = useCurrentUser();
  const admin = user.role === 'admin';
  const [listing, setListing] = useState(null);
  const [product, setProduct] = useState(null);
  const [marketplaces, setMarketplaces] = useState([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await api(`/api/listings/${id}`);
    if (!res.ok) return setError(res.status === 404 ? 'This listing does not exist or is not available.' : res.error);
    setListing(res.data.listing);
    const [p, m] = await Promise.all([api(`/api/products/${res.data.listing.productId}`), api('/api/marketplaces')]);
    if (p.ok) setProduct(p.data.product);
    if (m.ok) setMarketplaces(m.data.marketplaces);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!listing) return <Loading label="Loading listing…" />;
  const marketplace = marketplaces.find((m) => m.key === listing.marketplace) || { key: listing.marketplace, name: listing.marketplace };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <Link href="/listings">Listing Workspace</Link> / {marketplace.name}
          </div>
          <h1>{listing.product.name}</h1>
          <div className="row">
            <span className="mono small">{listing.product.sku}</span>
            <ListingStatusBadge status={listing.status} />
          </div>
        </div>
        <div className="row">
          <Link className="btn" href={`/products/${listing.productId}`}>
            View product
          </Link>
          {admin && !editing && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
              Edit content
            </button>
          )}
        </div>
      </div>
      <div className="detail-layout">
        <div className="stack">
          {product ? <ImageGallery sku={product.sku} images={product.images} productName={product.name} /> : <Loading label="Loading images…" />}
          <div className="card">
            <h2>Workflow</h2>
            <ListingWorkflow key={`${listing.id}-${listing.updatedAt}`} listing={listing} onUpdated={setListing} />
          </div>
        </div>
        <div className="card">
          <h2>{marketplace.name} listing content</h2>
          {editing ? (
            <ListingEditor
              listing={listing}
              marketplace={marketplace}
              onSaved={(l) => {
                setListing(l);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <ListingContent listing={listing} marketplaceName={marketplace.name} />
          )}
        </div>
      </div>
    </>
  );
}
