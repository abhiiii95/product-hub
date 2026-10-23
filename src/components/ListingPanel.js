'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from './AppShell';
import { Loading, ErrorState, useConfirm, useToast } from './Feedback';
import { ListingStatusBadge } from './Badges';
import ListingEditor from './ListingEditor';
import { ListingContent, ListingWorkflow } from './ListingView';
import { api } from '@/lib/client';

// Shows one tab per marketplace for a product, with copyable content and workflow controls.
export default function ListingPanel({ productId }) {
  const user = useCurrentUser();
  const admin = user.role === 'admin';
  const toast = useToast();
  const confirm = useConfirm();
  const [marketplaces, setMarketplaces] = useState([]);
  const [listings, setListings] = useState(null);
  const [active, setActive] = useState('meesho');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [m, l] = await Promise.all([api('/api/marketplaces'), api(`/api/products/${productId}/listings`)]);
    if (!m.ok || !l.ok) return setError(m.error || l.error);
    setMarketplaces(m.data.marketplaces);
    setListings(l.data.listings);
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!listings) return <div className="card"><Loading label="Loading listings…" /></div>;

  const marketplace = marketplaces.find((m) => m.key === active) || marketplaces[0];
  const listing = listings.find((l) => l.marketplace === marketplace?.key);
  const replace = (updated) => {
    setListings((list) => (list.some((l) => l.id === updated.id) ? list.map((l) => (l.id === updated.id ? updated : l)) : [...list, updated]));
    setEditing(false);
  };

  const remove = async () => {
    const ok = await confirm({ title: `Delete ${marketplace.name} listing?`, message: 'The listing content, status and notes will be removed.', confirmLabel: 'Delete listing' });
    if (!ok) return;
    const res = await api(`/api/listings/${listing.id}`, { method: 'DELETE' });
    if (!res.ok) return toast(res.error, 'error');
    setListings((list) => list.filter((l) => l.id !== listing.id));
    toast('Listing deleted', 'success');
  };

  return (
    <div className="card" id="listing">
      <div className="card-header">
        <h2>Marketplace listing</h2>
        {listing && (
          <div className="row">
            <Link className="small" href={`/listings/${listing.id}`}>Open in workspace</Link>
            {admin && !editing && (
              <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
                Edit content
              </button>
            )}
            {admin && (
              <button type="button" className="btn btn-sm btn-danger" onClick={remove}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>
      {marketplaces.length > 1 && (
        <div className="tabs" role="tablist">
          {marketplaces.map((m) => {
            const l = listings.find((x) => x.marketplace === m.key);
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={m.key === marketplace.key}
                onClick={() => {
                  setActive(m.key);
                  setEditing(false);
                }}
              >
                {m.name} {l ? <ListingStatusBadge status={l.status} /> : null}
              </button>
            );
          })}
        </div>
      )}
      {!listing && !admin && <p className="muted">The Admin has not prepared {marketplace?.name} listing content for this product yet.</p>}
      {!listing && admin && marketplace && (
        <>
          <p className="muted">No {marketplace.name} listing yet. Prepare the content for the listing user below.</p>
          <ListingEditor productId={productId} marketplace={marketplace} onSaved={replace} />
        </>
      )}
      {listing && editing && <ListingEditor listing={listing} marketplace={marketplace} onSaved={replace} onCancel={() => setEditing(false)} />}
      {listing && !editing && (
        <div className="stack">
          <ListingWorkflow key={`${listing.id}-${listing.updatedAt}`} listing={listing} onUpdated={(l) => setListings((list) => list.map((x) => (x.id === l.id ? l : x)))} />
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
          <ListingContent listing={listing} marketplaceName={marketplace.name} />
        </div>
      )}
    </div>
  );
}
