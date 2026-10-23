'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from './Feedback';
import { api, formatDate } from '@/lib/client';
import { STOCK_MOVEMENT_LABELS } from '@/lib/constants';

export function MovementTable({ movements, showProduct = false }) {
  if (!movements.length) return <p className="muted small">No stock movements recorded yet.</p>;
  return (
    <div className="table-wrap stack-mobile">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {showProduct && <th>Product</th>}
            <th>Type</th>
            <th className="num">Change</th>
            <th className="num">Stock</th>
            <th>Reason</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id}>
              <td data-label="Date" className="nowrap">{formatDate(m.createdAt)}</td>
              {showProduct && (
                <td data-label="Product">
                  {m.productName} <span className="small muted mono">{m.sku}</span>
                </td>
              )}
              <td data-label="Type">{STOCK_MOVEMENT_LABELS[m.type] || m.type}</td>
              <td data-label="Change" className="num" style={{ color: m.quantityChange < 0 ? 'var(--danger)' : m.quantityChange > 0 ? 'var(--success)' : undefined }}>
                {m.quantityChange > 0 ? '+' : ''}
                {m.quantityChange}
              </td>
              <td data-label="Stock" className="num nowrap">
                {m.previousStock} → {m.newStock}
              </td>
              <td data-label="Reason">{m.reason || <span className="muted">—</span>}</td>
              <td data-label="By">{m.userName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Admin stock adjustment form. Every change is recorded as a movement.
export function StockAdjustForm({ productId, currentStock, onDone, idPrefix = 'stock' }) {
  const toast = useToast();
  const [type, setType] = useState('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const res = await api(`/api/products/${productId}/stock`, { method: 'POST', body: { type, quantity, reason } });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast(`Stock updated to ${res.data.stock}`, 'success');
    setQuantity('');
    setReason('');
    onDone(res.data);
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${idPrefix}-type`}>Change</label>
          <select id={`${idPrefix}-type`} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="add">Add stock (received)</option>
            <option value="remove">Reduce stock (sold, damaged…)</option>
            <option value="set">Set exact count (stock take)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-qty`}>{type === 'set' ? 'New stock count' : 'Quantity'}</label>
          <input
            id={`${idPrefix}-qty`}
            type="number"
            min={type === 'set' ? 0 : 1}
            max={type === 'remove' ? currentStock : undefined}
            step="1"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="field span-all">
          <label htmlFor={`${idPrefix}-reason`}>
            Reason / note{type !== 'add' && <span className="req" aria-hidden="true">*</span>}
          </label>
          <input id={`${idPrefix}-reason`} type="text" maxLength={500} required={type !== 'add'} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. New shipment from supplier" />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Record stock change'}
        </button>
      </div>
    </form>
  );
}

export default function StockPanel({ productId, onStockChange }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [threshold, setThreshold] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await api(`/api/products/${productId}/stock`);
    if (!res.ok) return setError(res.error);
    setData(res.data);
    setThreshold(String(res.data.lowStockThreshold));
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveThreshold = async (e) => {
    e.preventDefault();
    const res = await api(`/api/products/${productId}/stock`, { method: 'PATCH', body: { lowStockThreshold: threshold } });
    if (!res.ok) return toast(res.error, 'error');
    toast('Low-stock threshold saved', 'success');
    setData((d) => ({ ...d, lowStockThreshold: res.data.lowStockThreshold }));
    onStockChange?.({ lowStockThreshold: res.data.lowStockThreshold });
  };

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;
  const low = data.stock <= data.lowStockThreshold;

  return (
    <div className="card" id="stock">
      <div className="card-header">
        <h2>Inventory</h2>
        <span className={data.stock <= 0 ? 'badge badge-danger' : low ? 'badge badge-warning' : 'badge badge-success'}>
          {data.stock} in stock{low ? ' · low' : ''}
        </span>
      </div>
      {low && <div className="alert alert-warning">Stock is at or below the low-stock threshold ({data.lowStockThreshold}).</div>}
      <StockAdjustForm
        productId={productId}
        currentStock={data.stock}
        onDone={(res) => {
          setData((d) => ({ ...d, stock: res.stock, movements: [res.movement, ...d.movements] }));
          onStockChange?.({ stock: res.stock });
        }}
      />
      <form onSubmit={saveThreshold} className="row" style={{ alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div>
          <label htmlFor="threshold">Low-stock threshold</label>
          <input id="threshold" type="number" min="0" step="1" required value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ maxWidth: 140 }} />
        </div>
        <button type="submit" className="btn" disabled={String(data.lowStockThreshold) === threshold}>
          Save threshold
        </button>
      </form>
      <h3>Stock movement history</h3>
      <MovementTable movements={data.movements} />
    </div>
  );
}
