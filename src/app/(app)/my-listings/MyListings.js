'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Loading, Empty, ErrorState } from '@/components/Feedback';
import { TrackerStatusSelect, portalName } from '@/components/reseller/TrackerBits';
import { api, buildQuery, formatDate } from '@/lib/client';
import { displayImage } from '@/lib/imageUrl';
import { RESELLER_LISTING_STATUSES, RESELLER_LISTING_STATUS_LABELS, RESELLER_PORTALS, RESELLER_PORTAL_LABELS } from '@/lib/constants';

export default function MyListings() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = {
    q: searchParams.get('q') || '',
    status: searchParams.get('status') || '',
    portal: searchParams.get('portal') || '',
    page: searchParams.get('page') || '',
  };
  const query = searchParams.toString();
  const filtered = Boolean(filters.q || filters.status || filters.portal);

  const [result, setResult] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(filters.q);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await api(`/api/my-listings${query ? `?${query}` : ''}`);
    if (res.ok) {
      setResult(res.data);
      // Per-status totals for the current search/portal (the status filter is not applied to them).
      setCounts(res.data.counts && typeof res.data.counts === 'object' ? res.data.counts : {});
    } else setError(res.error);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (changes) => router.replace(`${pathname}${buildQuery({ ...filters, page: '', ...changes })}`, { scroll: false });

  const onSaved = (tracker) => {
    const before = result?.items.find((t) => t.id === tracker.id)?.status;
    setResult((r) => r && { ...r, items: r.items.map((t) => (t.id === tracker.id ? { ...t, ...tracker, product: t.product } : t)) });
    // Move one from the old status to the new one, so the chips stay right without a reload.
    if (before && tracker.status && before !== tracker.status) {
      setCounts((c) => c && { ...c, [before]: Math.max(0, (c[before] || 0) - 1), [tracker.status]: (c[tracker.status] || 0) + 1 });
    }
  };

  const totalTracked = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Listings</h1>
          <p>The status of your products on each portal. Only you can see this.</p>
        </div>
        <Link className="btn" href="/products">
          Product catalog →
        </Link>
      </div>

      {counts && (
        <div className="rs-count-chips" role="group" aria-label="Filter by status">
          <button type="button" className="rs-count-chip" aria-pressed={!filters.status} onClick={() => update({ status: '' })}>
            <span>All</span>
            <strong>{totalTracked}</strong>
          </button>
          {RESELLER_LISTING_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`rs-count-chip rs-tone-${s}`}
              aria-pressed={filters.status === s}
              onClick={() => update({ status: filters.status === s ? '' : s })}
            >
              <span>{RESELLER_LISTING_STATUS_LABELS[s]}</span>
              <strong>{counts[s] ?? 0}</strong>
            </button>
          ))}
        </div>
      )}

      <form
        className="filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() });
        }}
      >
        <div className="grow">
          <label htmlFor="ml-q">Search</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="ml-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name, SKU or saved title" />
            <button type="submit" className="btn">
              Search
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="ml-status">Status</label>
          <select id="ml-status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">All statuses</option>
            {RESELLER_LISTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RESELLER_LISTING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ml-portal">Portal</label>
          <select id="ml-portal" value={filters.portal} onChange={(e) => update({ portal: e.target.value })}>
            <option value="">All portals</option>
            {RESELLER_PORTALS.map((p) => (
              <option key={p} value={p}>
                {RESELLER_PORTAL_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </form>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !result && !error && <Loading label="Loading your listings…" />}
      {result && result.items.length === 0 && !filtered && (
        <Empty title="You are not tracking any listings yet.">
          <p className="small">Open a product and set its status in &apos;My tracker&apos;.</p>
          <Link className="btn btn-primary" href="/products">
            View products
          </Link>
        </Empty>
      )}
      {result && result.items.length === 0 && filtered && (
        <Empty title="No listings match these filters.">
          <button type="button" className="btn btn-sm" onClick={() => {
              setQ('');
              router.replace(pathname, { scroll: false });
            }}>
            Clear filters
          </button>
        </Empty>
      )}
      {result && result.items.length > 0 && (
        <div className="table-wrap stack-mobile" aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Portal</th>
                <th>Status</th>
                <th>Updated</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((t) => (
                <tr key={t.id}>
                  <td className="cell-main">
                    <Link href={`/products/${t.productId}#my-tracker`} className="row rs-product-cell">
                      {t.product?.mainImage ? (
                        <img className="mini-thumb" src={displayImage(t.product.mainImage.url, 'mini')} alt="" />
                      ) : (
                        <span className="mini-thumb" aria-hidden="true" />
                      )}
                      <span className="rs-product-text">
                        <strong>{t.product?.name || 'Product'}</strong>
                        <span className="small muted mono">{t.product?.sku}</span>
                      </span>
                    </Link>
                  </td>
                  <td data-label="Portal">{portalName(t.portal, t.portalLabel)}</td>
                  <td data-label="Status">
                    <div className="rs-inline-status">
                      <TrackerStatusSelect
                        id={`ml-status-${t.id}`}
                        label={`Status for ${t.product?.name || 'product'} on ${portalName(t.portal, t.portalLabel)}`}
                        hideLabel
                        productId={t.productId}
                        portal={t.portal}
                        status={t.status}
                        onSaved={onSaved}
                      />
                    </div>
                  </td>
                  <td data-label="Updated" className="small nowrap">
                    {formatDate(t.updatedAt)}
                  </td>
                  <td className="cell-actions right">
                    <Link className="btn btn-sm" href={`/products/${t.productId}#my-tracker`}>
                      Open
                    </Link>
                  </td>
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
    </>
  );
}
