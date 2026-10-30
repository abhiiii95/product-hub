'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/components/AppShell';
import { Loading, Empty, ErrorState } from '@/components/Feedback';
import { ListingStatusBadge, ProductStatusBadge, StockBadge } from '@/components/Badges';
import { api, buildQuery, formatMoney } from '@/lib/client';
import { displayImage } from '@/lib/imageUrl';
import {
  LISTING_STATUSES,
  LISTING_STATUS_LABELS,
  RESELLER_LISTING_STATUSES,
  RESELLER_LISTING_STATUS_LABELS,
  RESELLER_PORTALS,
  RESELLER_PORTAL_LABELS,
} from '@/lib/constants';

// Resellers filter by their own tracker (statuses and portals of resellerListings).
const RESELLER_MARKETPLACES = RESELLER_PORTALS.map((key) => ({ key, name: RESELLER_PORTAL_LABELS[key] }));

const FILTER_KEYS = ['q', 'category', 'status', 'listingStatus', 'marketplace', 'lowStock', 'sort', 'page'];

export default function Catalog() {
  const user = useCurrentUser();
  const admin = user.role === 'admin';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, searchParams.get(k) || '']));

  const statusOptions = admin ? LISTING_STATUSES : RESELLER_LISTING_STATUSES;
  const statusLabels = admin ? LISTING_STATUS_LABELS : RESELLER_LISTING_STATUS_LABELS;

  const [categories, setCategories] = useState([]);
  const [adminMarketplaces, setAdminMarketplaces] = useState([]);
  const marketplaces = admin ? adminMarketplaces : RESELLER_MARKETPLACES;
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(filters.q);
  const query = searchParams.toString();

  useEffect(() => {
    api('/api/categories').then((res) => res.ok && setCategories(res.data.categories));
    if (admin) api('/api/marketplaces').then((res) => res.ok && setAdminMarketplaces(res.data.marketplaces));
  }, [admin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await api(`/api/products${query ? `?${query}` : ''}`);
    if (res.ok) setResult(res.data);
    else setError(res.error);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setQ(filters.q), [filters.q]);

  const update = (changes) => {
    const next = { ...filters, page: '', ...changes };
    router.replace(`${pathname}${buildQuery(next)}`, { scroll: false });
  };

  const hasFilters = FILTER_KEYS.some((k) => k !== 'sort' && k !== 'page' && filters[k]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Product Catalog</h1>
          <p>{result ? `${result.total} product${result.total === 1 ? '' : 's'}` : 'Browse and search products'}</p>
        </div>
        {admin && (
          <Link className="btn btn-primary" href="/products/new">
            + Add product
          </Link>
        )}
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
          <label htmlFor="f-q">Search</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="f-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, SKU, category, keyword…" />
            <button type="submit" className="btn">Search</button>
          </div>
        </div>
        <div>
          <label htmlFor="f-cat">Category</label>
          <select id="f-cat" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </div>
        {admin && (
          <div>
            <label htmlFor="f-status">Product status</label>
            <select id="f-status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="f-ls">Listing status</label>
          <select id="f-ls" value={filters.listingStatus} onChange={(e) => update({ listingStatus: e.target.value })}>
            <option value="">Any listing status</option>
            <option value="pending">Pending (not listed)</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
        </div>
        {marketplaces.length > 1 && (
          <div>
            <label htmlFor="f-mp">{admin ? 'Marketplace' : 'Portal'}</label>
            <select id="f-mp" value={filters.marketplace || 'meesho'} onChange={(e) => update({ marketplace: e.target.value })}>
              {marketplaces.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="f-sort">Sort by</label>
          <select id="f-sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
            <option value="">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="updated">Recently updated</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="price_asc">Price low–high</option>
            <option value="price_desc">Price high–low</option>
            {admin && <option value="stock_asc">Stock low–high</option>}
            {admin && <option value="stock_desc">Stock high–low</option>}
          </select>
        </div>
        {admin && (
          <div style={{ flex: '0 0 auto', alignSelf: 'center', paddingTop: '1.1rem' }}>
            <label className="checkbox">
              <input type="checkbox" checked={filters.lowStock === '1'} onChange={(e) => update({ lowStock: e.target.checked ? '1' : '' })} />
              Low stock only
            </label>
          </div>
        )}
      </form>
      {hasFilters && (
        <p className="small">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => router.replace(pathname)}>
            Clear filters
          </button>
        </p>
      )}

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !result && <Loading label="Loading products…" />}
      {result && result.items.length === 0 && (
        <Empty title="No products found">
          {hasFilters ? 'Try different filters or search terms.' : admin ? 'Add your first product to get started.' : 'The Admin has not added products yet.'}
        </Empty>
      )}
      {result && result.items.length > 0 && (
        <div className="product-grid" aria-busy={loading}>
          {result.items.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`} className="product-card">
              <div className="thumb">{p.mainImage ? <img src={displayImage(p.mainImage.url, 'thumb')} alt={p.mainImage.label || p.name} loading="lazy" /> : 'No image'}</div>
              <div className="body">
                <div className="name">{p.name}</div>
                <div className="small muted mono">{p.sku}</div>
                <div className="small muted">{p.categoryName || 'Uncategorised'}</div>
                <div className="row">
                  <ListingStatusBadge status={p.listingStatus} />
                  {admin && <ProductStatusBadge status={p.status} />}
                  <StockBadge product={p} />
                </div>
                {p.sellingPrice != null && <div className="small"><strong>{formatMoney(p.sellingPrice)}</strong></div>}
              </div>
            </Link>
          ))}
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
    </>
  );
}
