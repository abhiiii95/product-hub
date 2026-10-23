'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/components/AppShell';
import { Loading, Empty, ErrorState, useToast } from '@/components/Feedback';
import { ListingStatusBadge } from '@/components/Badges';
import CopyButton from '@/components/CopyButton';
import { api, buildQuery, formatDate } from '@/lib/client';
import { displayImage } from '@/lib/imageUrl';
import { LISTING_STATUSES, LISTING_STATUS_LABELS } from '@/lib/constants';

export default function Workspace() {
  const user = useCurrentUser();
  const admin = user.role === 'admin';
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = { q: searchParams.get('q') || '', status: searchParams.get('status') || '', marketplace: searchParams.get('marketplace') || '', page: searchParams.get('page') || '' };
  const query = searchParams.toString();

  const [marketplaces, setMarketplaces] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(filters.q);
  const [newMarketplace, setNewMarketplace] = useState('');

  const loadMarketplaces = useCallback(() => api('/api/marketplaces').then((res) => res.ok && setMarketplaces(res.data.marketplaces)), []);
  useEffect(() => {
    loadMarketplaces();
  }, [loadMarketplaces]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await api(`/api/listings${query ? `?${query}` : ''}`);
    if (res.ok) setResult(res.data);
    else setError(res.error);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (changes) => router.replace(`${pathname}${buildQuery({ ...filters, page: '', ...changes })}`, { scroll: false });
  const mpName = (key) => marketplaces.find((m) => m.key === key)?.name || key;

  const addMarketplace = async (e) => {
    e.preventDefault();
    const res = await api('/api/marketplaces', { method: 'POST', body: { name: newMarketplace } });
    if (!res.ok) return toast(res.error, 'error');
    toast(`${res.data.marketplace.name} added`, 'success');
    setNewMarketplace('');
    loadMarketplaces();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Listing Workspace</h1>
          <p>Marketplace listing content prepared for each product.</p>
        </div>
        <Link className="btn" href="/products?listingStatus=not_started">
          Products not started →
        </Link>
      </div>

      <form
        className="filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() });
        }}
      >
        <div className="grow">
          <label htmlFor="l-q">Search</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="l-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product, SKU, title, style ID…" />
            <button type="submit" className="btn">Search</button>
          </div>
        </div>
        <div>
          <label htmlFor="l-status">Listing status</label>
          <select id="l-status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">All statuses</option>
            {LISTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LISTING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="l-mp">Marketplace</label>
          <select id="l-mp" value={filters.marketplace} onChange={(e) => update({ marketplace: e.target.value })}>
            <option value="">All marketplaces</option>
            {marketplaces.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </form>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !result && <Loading label="Loading listings…" />}
      {result && result.listings.length === 0 && (
        <Empty title="No listings found">
          {admin ? 'Open a product and prepare its marketplace listing to see it here.' : 'The Admin has not prepared listings matching these filters yet.'}
        </Empty>
      )}
      {result && result.listings.length > 0 && (
        <div className="table-wrap stack-mobile" aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Marketplace</th>
                <th>Listing title</th>
                <th>Style ID</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {result.listings.map((l) => (
                <tr key={l.id}>
                  <td className="cell-main">
                    <Link href={`/listings/${l.id}`} className="row" style={{ flexWrap: 'nowrap', color: 'inherit' }}>
                      {l.product.mainImage ? <img className="mini-thumb" src={displayImage(l.product.mainImage.url, 'mini')} alt="" /> : <span className="mini-thumb" />}
                      <span>
                        <strong>{l.product.name}</strong>
                        <span className="small muted mono" style={{ display: 'block' }}>{l.product.sku}</span>
                      </span>
                    </Link>
                  </td>
                  <td data-label="Marketplace">{mpName(l.marketplace)}</td>
                  <td data-label="Title" style={{ maxWidth: 280 }}>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <span className="truncate">{l.title || <span className="muted">—</span>}</span>
                      {l.title && <CopyButton text={l.title} what="listing title" />}
                    </div>
                  </td>
                  <td data-label="Style ID">
                    {l.styleId ? (
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <span className="mono">{l.styleId}</span>
                        <CopyButton text={l.styleId} what="style ID" />
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <ListingStatusBadge status={l.status} />
                  </td>
                  <td data-label="Updated" className="small nowrap">{formatDate(l.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result && result.pages > 1 && (
        <nav className="pagination" aria-label="Pagination">
          <button type="button" className="btn btn-sm" disabled={result.page <= 1} onClick={() => update({ page: String(result.page - 1) })}>
            ← Previous
          </button>
          <span>
            Page {result.page} of {result.pages}
          </span>
          <button type="button" className="btn btn-sm" disabled={result.page >= result.pages} onClick={() => update({ page: String(result.page + 1) })}>
            Next →
          </button>
        </nav>
      )}

      {admin && (
        <div className="card mt-1">
          <h2>Marketplaces</h2>
          <p className="small muted">Meesho is set up by default. Add another marketplace to prepare separate listings for it.</p>
          <div className="chips" style={{ marginBottom: '0.75rem' }}>
            {marketplaces.map((m) => (
              <span key={m.key} className="chip">
                {m.name}
              </span>
            ))}
          </div>
          <form className="row" onSubmit={addMarketplace}>
            <label htmlFor="new-mp" className="sr-only">New marketplace name</label>
            <input id="new-mp" type="text" required maxLength={60} placeholder="Marketplace name" value={newMarketplace} onChange={(e) => setNewMarketplace(e.target.value)} style={{ maxWidth: 260 }} />
            <button type="submit" className="btn">Add marketplace</button>
          </form>
        </div>
      )}
    </>
  );
}
