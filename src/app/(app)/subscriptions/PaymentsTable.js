'use client';

import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorState, Loading, useConfirm, useToast } from '@/components/Feedback';
import { fieldErrors, formatRupees, planName } from '@/components/admin/format';
import { api, buildQuery, formatDate } from '@/lib/client';

const STATUS = {
  created: ['Created', 'badge'],
  paid: ['Paid', 'badge badge-info'],
  fulfilled: ['Fulfilled', 'badge badge-success'],
  failed: ['Failed', 'badge badge-danger'],
  abandoned: ['Abandoned', 'badge'],
  refunded: ['Refunded', 'badge badge-warning'],
  needs_review: ['Needs review', 'badge badge-warning'],
};
const REFUNDABLE = ['paid', 'fulfilled', 'needs_review'];
const MARK_PAID_FROM = ['created', 'failed', 'abandoned', 'paid'];
const LIMIT = 50;
const COLS = 7;

function RefundForm({ payment, onDone, onCancel }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [note, setNote] = useState('');
  const [revokeDays, setRevokeDays] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const p = `refund-${payment.id}`;

  const submit = async (e) => {
    e.preventDefault();
    const days = revokeDays === '' ? null : Number(revokeDays);
    const ok = await confirm({
      title: 'Mark this payment refunded?',
      message: `Refund Razorpay dashboard mein khud karo; yahan sirf record banega.${days ? ` Reseller ke plan se ${days} din kam honge.` : ''}`,
      confirmLabel: 'Mark refunded',
    });
    if (!ok) return;
    const body = { refundNote: note };
    if (days) body.revokeDays = days;
    setSaving(true);
    setError('');
    setErrors({});
    const res = await api(`/api/payments/${payment.id}`, { method: 'PATCH', body });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return setErrors(fieldErrors(res));
    }
    toast('Payment marked refunded', 'success');
    onDone();
  };

  return (
    <form onSubmit={submit} className="inline-form">
      <h3 className="inline-title">Refund note for {payment.customer.email || payment.providerOrderId}</h3>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-grid">
        <div className="field span-all">
          <label htmlFor={`${p}-note`}>
            Refund note<span className="req" aria-hidden="true">*</span>
          </label>
          <input id={`${p}-note`} type="text" required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={errors.refundNote ? 'true' : undefined} />
          {errors.refundNote && <div className="error-text">{errors.refundNote}</div>}
        </div>
        <div className="field">
          <label htmlFor={`${p}-days`}>Remove plan days (optional)</label>
          <input id={`${p}-days`} type="number" min={1} max={3650} step={1} value={revokeDays} onChange={(e) => setRevokeDays(e.target.value)} aria-invalid={errors.revokeDays ? 'true' : undefined} />
          {errors.revokeDays && <div className="error-text">{errors.revokeDays}</div>}
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-danger" disabled={saving}>
          {saving ? 'Saving…' : 'Mark refunded'}
        </button>
      </div>
    </form>
  );
}

function Amount({ price }) {
  const final = price?.finalPaise;
  const discounted = price?.listPaise != null && final != null && final < price.listPaise;
  return (
    <>
      <strong>{final == null ? '—' : formatRupees(final)}</strong>
      {discounted && <div className="small muted"><s>{formatRupees(price.listPaise)}</s>{price.offerApplied ? ' · launch offer' : ''}</div>}
    </>
  );
}

export default function PaymentsTable({ version, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refundId, setRefundId] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError('');
    const res = await api(`/api/payments${buildQuery({ status, q: query, page, limit: LIMIT })}`);
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, [status, query, page]);

  useEffect(() => {
    load();
  }, [load, version]);

  const markPaid = async (p) => {
    const ok = await confirm({
      title: 'Mark this test order paid?',
      message: `Test mode: ${p.customer.email} ka account/plan ban jayega jaise asli payment par banta hai.`,
      confirmLabel: 'Mark paid',
      danger: false,
    });
    if (!ok) return;
    setBusy(p.id);
    const res = await api(`/api/payments/${p.id}`, { method: 'PATCH', body: { markPaid: true } });
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    toast(`Order ${res.data.result?.status || 'updated'}${res.data.result?.newAccount ? ' · new account created' : ''}`, 'success');
    onChanged();
  };

  const search = (e) => {
    e.preventDefault();
    setPage(1);
    setQuery(q.trim());
  };

  const items = data?.items || [];
  const pages = data ? Math.max(1, Math.ceil(data.total / (data.limit || LIMIT))) : 1;
  const mock = data?.mode === 'mock';

  return (
    <div className="card">
      <div className="card-header">
        <h2>Payments</h2>
        {mock && <span className="badge badge-warning">Test mode (mock payments)</span>}
      </div>
      <form className="filters" onSubmit={search} role="search">
        <div className="grow">
          <label htmlFor="pay-q">Search</label>
          <input id="pay-q" type="search" placeholder="Email, phone, name or order id" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pay-status">Status</label>
          <select
            id="pay-status"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([value, [label]]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="filters-submit">
          <button type="submit" className="btn">
            Search
          </button>
        </div>
      </form>
      {error && <ErrorState message={error} onRetry={load} />}
      {!data && !error && <Loading />}
      {data && items.length === 0 && (
        <Empty title={status || query ? 'No payments match' : 'No payments yet'}>
          {status || query ? 'Filter ya search badal ke dekho.' : 'Jab koi /buy page se plan khareedega, payment yahan dikhega.'}
        </Empty>
      )}
      {items.length > 0 && (
        <div className="table-wrap stack-mobile admin-table">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Date</th>
                <th>Plan</th>
                <th className="num">Amount</th>
                <th>Coupon</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const [label, className] = STATUS[p.status] || [p.status, 'badge'];
                const canMarkPaid = mock && p.provider === 'mock' && MARK_PAID_FROM.includes(p.status);
                const canRefund = REFUNDABLE.includes(p.status);
                return [
                  <tr key={p.id}>
                    <td className="cell-main">
                      <strong>{p.customer.name || '—'}</strong>
                      <div className="small muted break">{p.customer.email}</div>
                      {p.customer.phone && <div className="small muted">{p.customer.phone}</div>}
                      <div className="small muted mono break">{p.providerOrderId}</div>
                    </td>
                    <td data-label="Date" className="small nowrap">
                      {formatDate(p.paidAt || p.createdAt)}
                    </td>
                    <td data-label="Plan">{planName(p.planCode)}</td>
                    <td data-label="Amount" className="num">
                      <div>
                        <Amount price={p.price} />
                      </div>
                    </td>
                    <td data-label="Coupon">{p.couponCode ? <span className="mono">{p.couponCode}</span> : <span className="muted">—</span>}</td>
                    <td data-label="Status">
                      <div>
                        <span className={className}>{label}</span>
                        {p.provider === 'mock' && <span className="badge badge-gap">Test</span>}
                        {p.review?.reason && <div className="small muted">{p.review.reason}</div>}
                        {p.refund?.note && <div className="small muted">Refund: {p.refund.note}</div>}
                        {p.failure && <div className="small muted">{typeof p.failure === 'string' ? p.failure : p.failure.reason || p.failure.description || ''}</div>}
                      </div>
                    </td>
                    <td className="right nowrap cell-actions">
                      {canMarkPaid && (
                        <button type="button" className="btn btn-sm" onClick={() => markPaid(p)} disabled={busy === p.id}>
                          {busy === p.id ? 'Working…' : 'Mark paid (test)'}
                        </button>
                      )}{' '}
                      {canRefund && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          aria-expanded={refundId === p.id}
                          onClick={() => setRefundId((id) => (id === p.id ? null : p.id))}
                        >
                          Refund note
                        </button>
                      )}
                      {!canMarkPaid && !canRefund && <span className="muted small">—</span>}
                    </td>
                  </tr>,
                  refundId === p.id && (
                    <tr key={`${p.id}-refund`} className="panel-row">
                      <td className="cell-wide" colSpan={COLS}>
                        <RefundForm
                          payment={p}
                          onCancel={() => setRefundId(null)}
                          onDone={() => {
                            setRefundId(null);
                            onChanged();
                          }}
                        />
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > LIMIT && (
        <div className="pagination">
          <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
            ← Previous
          </button>
          <span>
            Page {page} of {pages} · {data.total} payments
          </span>
          <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
