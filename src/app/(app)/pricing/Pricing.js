'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Loading, Empty, ErrorState } from '@/components/Feedback';
import { api, formatMoney, formatPercent } from '@/lib/client';
import { computePricing } from '@/lib/pricing';

function Calculator() {
  const [values, setValues] = useState({ purchaseCost: '', packagingCost: '', additionalCost: '', sellingPrice: '' });
  const r = computePricing(values);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const inputs = [
    ['purchaseCost', 'Purchase cost (₹)'],
    ['packagingCost', 'Packaging cost (₹)'],
    ['additionalCost', 'Additional cost (₹)'],
    ['sellingPrice', 'Selling price (₹)'],
  ];
  return (
    <div className="card">
      <h2>Quick calculator</h2>
      <div className="form-grid">
        {inputs.map(([k, label]) => (
          <div key={k} className="field">
            <label htmlFor={`calc-${k}`}>{label}</label>
            <input id={`calc-${k}`} type="number" min="0" step="0.01" value={values[k]} onChange={set(k)} />
          </div>
        ))}
      </div>
      <div className="stats" style={{ marginBottom: 0 }}>
        <div className="stat">
          <div className="label">Total cost</div>
          <div className="value">{formatMoney(r.totalCost)}</div>
        </div>
        <div className={`stat ${r.profit < 0 ? 'warn' : 'good'}`}>
          <div className="label">Estimated profit</div>
          <div className="value">{formatMoney(r.profit)}</div>
        </div>
        <div className="stat">
          <div className="label">Estimated margin</div>
          <div className="value">{r.margin === null ? 'N/A' : formatPercent(r.margin)}</div>
        </div>
      </div>
      <p className="small muted mt-1">
        Total cost = purchase + packaging + additional. Profit = selling price − total cost. Margin = profit ÷ selling price × 100.
        Estimates exclude marketplace fees, shipping deductions, taxes and return-related charges.
      </p>
    </div>
  );
}

export default function Pricing() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('margin_asc');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setError('');
    const res = await api(`/api/products?limit=100&page=${page}&sort=name_asc`);
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data
    ? [...data.items].sort((a, b) => {
        const ma = a.pricing.margin ?? -Infinity;
        const mb = b.pricing.margin ?? -Infinity;
        if (sort === 'margin_asc') return ma - mb;
        if (sort === 'margin_desc') return mb - ma;
        if (sort === 'profit_desc') return b.pricing.profit - a.pricing.profit;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Pricing Calculator</h1>
          <p>Admin-only cost, profit and margin estimates.</p>
        </div>
      </div>
      <Calculator />
      <div className="card">
        <div className="card-header">
          <h2>Product pricing</h2>
          <div>
            <label htmlFor="pr-sort" className="sr-only">Sort products</label>
            <select id="pr-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="margin_asc">Lowest margin first</option>
              <option value="margin_desc">Highest margin first</option>
              <option value="profit_desc">Highest profit first</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
        {error && <ErrorState message={error} onRetry={load} />}
        {!data && !error && <Loading />}
        {data && rows.length === 0 && <Empty title="No products yet" />}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Purchase</th>
                  <th className="num">Packaging</th>
                  <th className="num">Additional</th>
                  <th className="num">Total cost</th>
                  <th className="num">Selling price</th>
                  <th className="num">Est. profit</th>
                  <th className="num">Est. margin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/products/${p.id}/edit`}>{p.name}</Link>
                      <div className="small muted mono">{p.sku}</div>
                    </td>
                    <td className="num">{formatMoney(p.pricing.purchaseCost)}</td>
                    <td className="num">{formatMoney(p.pricing.packagingCost)}</td>
                    <td className="num">{formatMoney(p.pricing.additionalCost)}</td>
                    <td className="num">{formatMoney(p.pricing.totalCost)}</td>
                    <td className="num">{formatMoney(p.pricing.sellingPrice)}</td>
                    <td className="num" style={{ color: p.pricing.profit < 0 ? 'var(--danger)' : undefined }}>
                      {formatMoney(p.pricing.profit)}
                    </td>
                    <td className="num">{p.pricing.margin === null ? 'N/A' : formatPercent(p.pricing.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pages > 1 && (
          <nav className="pagination" aria-label="Pagination">
            <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
              ← Previous
            </button>
            <span>
              Page {data.page} of {data.pages}
            </span>
            <button type="button" className="btn btn-sm" disabled={page >= data.pages} onClick={() => setPage((n) => n + 1)}>
              Next →
            </button>
          </nav>
        )}
      </div>
    </>
  );
}
