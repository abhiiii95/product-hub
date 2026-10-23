'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Loading, Empty, ErrorState } from '@/components/Feedback';
import { StockBadge } from '@/components/Badges';
import { MovementTable, StockAdjustForm } from '@/components/StockPanel';
import { api, buildQuery } from '@/lib/client';

export default function Inventory() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lowStock = searchParams.get('lowStock') === '1';
  const q = searchParams.get('q') || '';
  const page = searchParams.get('page') || '';

  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const [adjusting, setAdjusting] = useState(null);
  const [search, setSearch] = useState(q);
  const [movements, setMovements] = useState(null);
  const [movementPage, setMovementPage] = useState(1);

  const load = useCallback(async () => {
    setError('');
    const res = await api(`/api/products${buildQuery({ lowStock: lowStock ? '1' : '', q, page, sort: 'stock_asc', limit: 50 })}`);
    if (res.ok) setProducts(res.data);
    else setError(res.error);
  }, [lowStock, q, page]);

  const loadMovements = useCallback(async () => {
    const res = await api(`/api/inventory/movements?page=${movementPage}&limit=25`);
    if (res.ok) setMovements(res.data);
  }, [movementPage]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const update = (changes) => router.replace(`${pathname}${buildQuery({ lowStock: lowStock ? '1' : '', q, page: '', ...changes })}`, { scroll: false });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <p>Every stock change is recorded in the movement history.</p>
        </div>
      </div>
      <form
        className="filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: search.trim() });
        }}
      >
        <div className="grow">
          <label htmlFor="inv-q">Search</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="inv-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or SKU" />
            <button type="submit" className="btn">Search</button>
          </div>
        </div>
        <div style={{ flex: '0 0 auto', alignSelf: 'center', paddingTop: '1.1rem' }}>
          <label className="checkbox">
            <input type="checkbox" checked={lowStock} onChange={(e) => update({ lowStock: e.target.checked ? '1' : '' })} />
            Low stock only
          </label>
        </div>
      </form>

      {error && <ErrorState message={error} onRetry={load} />}
      {!products && !error && <Loading />}
      {products && products.items.length === 0 && <Empty title={lowStock ? 'No low-stock products' : 'No products found'} />}
      {products && products.items.length > 0 && (
        <div className="table-wrap stack-mobile">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Stock</th>
                <th className="num">Low-stock at</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.items.map((p) => (
                <Fragment key={p.id}>
                  <tr>
                    <td className="cell-main">
                      <Link href={`/products/${p.id}#stock`}>
                        <strong>{p.name}</strong>
                      </Link>
                      <div className="small muted mono">{p.sku}</div>
                    </td>
                    <td data-label="Stock" className="num">{p.stock}</td>
                    <td data-label="Low-stock at" className="num">{p.lowStockThreshold}</td>
                    <td data-label="Status">
                      <StockBadge product={p} />
                    </td>
                    <td className="right cell-actions">
                      <button type="button" className="btn btn-sm" aria-expanded={adjusting === p.id} onClick={() => setAdjusting(adjusting === p.id ? null : p.id)}>
                        {adjusting === p.id ? 'Close' : 'Adjust stock'}
                      </button>
                    </td>
                  </tr>
                  {adjusting === p.id && (
                    <tr>
                      <td className="cell-wide" colSpan={5} style={{ background: 'var(--surface-2)' }}>
                        <StockAdjustForm
                          productId={p.id}
                          currentStock={p.stock}
                          idPrefix={`adj-${p.id}`}
                          onDone={() => {
                            setAdjusting(null);
                            load();
                            loadMovements();
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {products && products.pages > 1 && (
        <nav className="pagination" aria-label="Product pages">
          <button type="button" className="btn btn-sm" disabled={products.page <= 1} onClick={() => update({ page: String(products.page - 1) })}>
            ← Previous
          </button>
          <span>
            Page {products.page} of {products.pages}
          </span>
          <button type="button" className="btn btn-sm" disabled={products.page >= products.pages} onClick={() => update({ page: String(products.page + 1) })}>
            Next →
          </button>
        </nav>
      )}

      <div className="card mt-1">
        <h2>Stock movement history</h2>
        {!movements ? <Loading /> : <MovementTable movements={movements.movements} showProduct />}
        {movements && movements.pages > 1 && (
          <nav className="pagination" aria-label="Movement pages">
            <button type="button" className="btn btn-sm" disabled={movementPage <= 1} onClick={() => setMovementPage((n) => n - 1)}>
              ← Newer
            </button>
            <span>
              Page {movements.page} of {movements.pages}
            </span>
            <button type="button" className="btn btn-sm" disabled={movementPage >= movements.pages} onClick={() => setMovementPage((n) => n + 1)}>
              Older →
            </button>
          </nav>
        )}
      </div>
    </>
  );
}
