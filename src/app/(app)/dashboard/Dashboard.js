'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/components/AppShell';
import { Loading, ErrorState, Empty } from '@/components/Feedback';
import { api, formatDate, formatMoney, formatPercent } from '@/lib/client';

function Stat({ label, value, href, tone }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="label">{label}</div>
      {href ? (
        <Link className="value" href={href}>
          {value}
        </Link>
      ) : (
        <div className="value">{value}</div>
      )}
    </div>
  );
}

function RecentProducts({ title, products, dateKey }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>{title}</h2>
        <Link href="/products" className="small">View catalog →</Link>
      </div>
      {products.length === 0 ? (
        <Empty title="No products yet" />
      ) : (
        products.map((p) => (
          <Link key={p.id} href={`/products/${p.id}`} className="list-item" style={{ color: 'inherit' }}>
            {p.mainImage ? <img className="mini-thumb" src={p.mainImage} alt="" /> : <div className="mini-thumb" />}
            <div className="grow">
              <div className="truncate"><strong>{p.name}</strong></div>
              <div className="small muted">{p.sku}</div>
            </div>
            <span className="small muted nowrap">{formatDate(p[dateKey], false)}</span>
          </Link>
        ))
      )}
    </div>
  );
}

function SearchBox() {
  const router = useRouter();
  return (
    <form
      className="row"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get('q');
        router.push(`/products${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      }}
    >
      <label htmlFor="dash-search" className="sr-only">Search products</label>
      <input id="dash-search" name="q" type="search" placeholder="Search by name, SKU, category or keyword" style={{ flex: 1 }} />
      <button type="submit" className="btn btn-primary">Search</button>
    </form>
  );
}

export default function Dashboard({ denied }) {
  const user = useCurrentUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await api('/api/dashboard');
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const admin = user.role === 'admin';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Welcome, {user.name}</h1>
          <p>{admin ? 'Overview of products, inventory and listings.' : 'Your listing work at a glance.'}</p>
        </div>
      </div>
      {denied && <div className="alert alert-warning">That page is only available to the Admin.</div>}
      {error && <ErrorState message={error} onRetry={load} />}
      {!data && !error && <Loading />}
      {data && !admin && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <SearchBox />
          </div>
          <div className="stats">
            <Stat label="Products available" value={data.available} href="/products" />
            <Stat label="Pending listing" value={data.listing.pending} href="/products?listingStatus=pending" tone="warn" />
            <Stat label="In progress" value={data.listing.in_progress} href="/products?listingStatus=in_progress" />
            <Stat label="Needs changes" value={data.listing.needs_changes} href="/products?listingStatus=needs_changes" tone="warn" />
            <Stat label="Listed" value={data.listing.listed} href="/products?listingStatus=listed" tone="good" />
          </div>
          <RecentProducts title="Recently updated products" products={data.recentlyUpdated} dateKey="updatedAt" />
        </>
      )}
      {data && admin && (
        <>
          <div className="stats">
            <Stat label="Total products" value={data.totalProducts} href="/products" />
            <Stat label="Active products" value={data.activeProducts} href="/products?status=active" />
            <Stat label="Categories" value={data.totalCategories} href="/categories" />
            <Stat label="In stock" value={data.inStock} href="/inventory" tone="good" />
            <Stat label="Low stock" value={data.lowStock} href="/inventory?lowStock=1" tone={data.lowStock ? 'warn' : undefined} />
            <Stat label="Pending listing" value={data.listing.pending} href="/products?listingStatus=pending" tone="warn" />
            <Stat label="Listed" value={data.listing.listed} href="/products?listingStatus=listed" tone="good" />
            <Stat label="Active listing users" value={data.activeListingUsers} href="/users" />
          </div>
          <div className="grid-2" style={{ marginBottom: '1rem' }}>
            <div className="card">
              <h2>Inventory summary</h2>
              <dl className="kv">
                <dt>Units in stock</dt>
                <dd>{data.inventory.stockUnits}</dd>
                <dt>Out of stock</dt>
                <dd>{data.outOfStock} product(s)</dd>
                <dt>Stock value at cost</dt>
                <dd>{formatMoney(data.inventory.stockCostValue)}</dd>
                <dt>Stock value at selling price</dt>
                <dd>{formatMoney(data.inventory.stockRetailValue)}</dd>
              </dl>
            </div>
            <div className="card">
              <h2>Pricing summary</h2>
              <dl className="kv">
                <dt>Average estimated margin</dt>
                <dd>{formatPercent(data.pricing.averageMargin)}</dd>
                <dt>Products with a selling price</dt>
                <dd>{data.pricing.pricedProducts}</dd>
                <dt>Listing status</dt>
                <dd>
                  {data.listing.not_started} not started · {data.listing.in_progress} in progress · {data.listing.needs_changes} needs changes
                </dd>
              </dl>
              <p className="small muted mt-1">Estimates exclude marketplace fees, shipping, taxes and returns.</p>
            </div>
          </div>
          <div className="grid-2">
            <RecentProducts title="Recently added products" products={data.recentProducts} dateKey="createdAt" />
            <div className="card">
              <div className="card-header">
                <h2>Recent listing activity</h2>
                <Link href="/listings" className="small">Listing workspace →</Link>
              </div>
              {data.recentActivity.length === 0 ? (
                <Empty title="No listing activity yet" />
              ) : (
                data.recentActivity.map((a) => (
                  <div key={a.id} className="list-item">
                    <div className="grow">
                      <div>{a.summary}</div>
                      <div className="small muted">
                        {a.userName} · {formatDate(a.createdAt)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
