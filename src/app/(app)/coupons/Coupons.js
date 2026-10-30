'use client';

import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorState, Loading, useConfirm, useToast } from '@/components/Feedback';
import useCategories from '@/components/admin/useCategories';
import { formatRupees, shortDate } from '@/components/admin/format';
import { api } from '@/lib/client';
import CouponForm from './CouponForm';

function discountText(c) {
  if (c.kind === 'final_price') return `Pay ${formatRupees(c.value)}`;
  if (c.kind === 'amount_off') return `${formatRupees(c.value)} off`;
  if (c.kind === 'percent_off') return `${c.value}% off`;
  return c.kind;
}

function grantText(grant, names) {
  if (grant === 'all') return 'All categories';
  if (Array.isArray(grant) && grant.length) return grant.map((id) => names.get(id) || 'Deleted category').join(', ');
  return 'As per plan';
}

const expired = (c) => c.expiresAt && new Date(c.expiresAt) <= new Date();

export default function Coupons() {
  const toast = useToast();
  const confirm = useConfirm();
  const cats = useCategories();
  const [coupons, setCoupons] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError('');
    const res = await api('/api/coupons');
    if (res.ok) setCoupons(res.data.coupons);
    else setError(res.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const names = new Map((cats.categories || []).map((c) => [c.id, c.name]));
  const replace = (c) => setCoupons((list) => list.map((x) => (x.id === c.id ? c : x)));

  const toggle = async (c) => {
    if (c.isActive) {
      const ok = await confirm({
        title: `Deactivate ${c.code}?`,
        message: 'No new orders can use this coupon. You can turn it back on later.',
        confirmLabel: 'Deactivate',
      });
      if (!ok) return;
    }
    setBusy(c.id);
    const res = await api(`/api/coupons/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } });
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    replace(res.data.coupon);
    toast(`${c.code} ${res.data.coupon.isActive ? 'activated' : 'deactivated'}`, 'success');
  };

  const remove = async (c) => {
    const ok = await confirm({
      title: `Delete ${c.code}?`,
      message: 'This coupon will be deleted permanently.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusy(c.id);
    const res = await api(`/api/coupons/${c.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    setCoupons((list) => list.filter((x) => x.id !== c.id));
    toast(`${c.code} deleted`, 'success');
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Coupons</h1>
          <p>Discount codes for the buy page. A coupon and the launch offer never stack: the lower price wins.</p>
        </div>
      </div>

      <div className="card">
        <h2>Create coupon</h2>
        <CouponForm cats={cats} onCreated={(c) => setCoupons((list) => [c, ...(list || [])])} />
      </div>

      <div className="card">
        <div className="card-header">
          <h2>All coupons</h2>
          {coupons && <span className="small muted">{coupons.length}</span>}
        </div>
        {error && <ErrorState message={error} onRetry={load} />}
        {!coupons && !error && <Loading />}
        {coupons && coupons.length === 0 && <Empty title="No coupons yet">Create your first coupon with the form above.</Empty>}
        {coupons && coupons.length > 0 && (
          <div className="table-wrap stack-mobile admin-table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Plans</th>
                  <th className="num">Used</th>
                  <th className="num">Per email</th>
                  <th>Expiry</th>
                  <th>Grants</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-main">
                      <strong className="mono">{c.code}</strong>
                      {c.allowedEmails.length > 0 && (
                        <div className="small muted break" title={c.allowedEmails.join(', ')}>
                          Only for: {c.allowedEmails.length <= 2 ? c.allowedEmails.join(', ') : `${c.allowedEmails.length} emails`}
                        </div>
                      )}
                      {c.note && <div className="small muted">{c.note}</div>}
                    </td>
                    <td data-label="Discount">{discountText(c)}</td>
                    <td data-label="Plans">{c.plans.join(', ') || '—'}</td>
                    <td data-label="Used" className="num nowrap">
                      {c.usedCount} / {c.maxUses ?? '∞'}
                    </td>
                    <td data-label="Per email" className="num">
                      {c.maxUsesPerEmail}
                    </td>
                    <td data-label="Expiry" className="small nowrap">
                      {c.expiresAt ? shortDate(c.expiresAt) : 'Never'}
                    </td>
                    <td data-label="Grants" className="small">
                      {grantText(c.grants?.categoryAccess, names)}
                    </td>
                    <td data-label="Status">
                      {!c.isActive ? (
                        <span className="badge">Inactive</span>
                      ) : expired(c) ? (
                        <span className="badge badge-warning">Expired</span>
                      ) : c.maxUses != null && c.usedCount >= c.maxUses ? (
                        <span className="badge badge-warning">Used up</span>
                      ) : (
                        <span className="badge badge-success">Active</span>
                      )}
                    </td>
                    <td className="right nowrap cell-actions">
                      <button type="button" className="btn btn-sm" onClick={() => toggle(c)} disabled={busy === c.id}>
                        {c.isActive ? 'Deactivate' : 'Activate'}
                      </button>{' '}
                      {c.usedCount === 0 && (
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(c)} disabled={busy === c.id}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
