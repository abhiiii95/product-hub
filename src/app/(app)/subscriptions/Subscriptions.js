'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorState } from '@/components/Feedback';
import useCategories from '@/components/admin/useCategories';
import { formatRupees } from '@/components/admin/format';
import { api } from '@/lib/client';
import ResellerTable from './ResellerTable';
import PaymentsTable from './PaymentsTable';

// Money actually received: refunded, failed and unpaid orders are left out.
const RECEIVED = ['paid', 'fulfilled', 'needs_review'];
const SUMMARY_LIMIT = 200;

const monthKey = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);

function Stat({ label, value, tone, sub }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

export default function Subscriptions() {
  const [resellers, setResellers] = useState(null);
  const [resellerError, setResellerError] = useState('');
  const [revenue, setRevenue] = useState(null);
  const [revenueError, setRevenueError] = useState('');
  // Bumped after any payment change so the payments table reloads too.
  const [paymentsVersion, setPaymentsVersion] = useState(0);
  const cats = useCategories();

  const loadResellers = useCallback(async () => {
    setResellerError('');
    const res = await api('/api/subscriptions');
    if (res.ok) setResellers(res.data.resellers);
    else setResellerError(res.error);
  }, []);

  // Revenue is computed in the browser from the latest payments (the API has no totals endpoint).
  const loadRevenue = useCallback(async () => {
    setRevenueError('');
    const res = await api(`/api/payments?limit=${SUMMARY_LIMIT}`);
    if (!res.ok) return setRevenueError(res.error);
    const now = monthKey(new Date());
    let total = 0;
    let month = 0;
    for (const p of res.data.items) {
      if (!RECEIVED.includes(p.status)) continue;
      const paise = p.price?.finalPaise || 0;
      total += paise;
      if (monthKey(p.paidAt || p.createdAt) === now) month += paise;
    }
    setRevenue({ total, month, partial: res.data.total > res.data.items.length });
  }, []);

  useEffect(() => {
    loadResellers();
    loadRevenue();
  }, [loadResellers, loadRevenue]);

  const onPaymentChanged = useCallback(() => {
    setPaymentsVersion((v) => v + 1);
    loadRevenue();
    loadResellers();
  }, [loadRevenue, loadResellers]);

  const counts = useMemo(() => {
    if (!resellers) return null;
    const active = resellers.filter((r) => r.plan?.active);
    return { active: active.length, expiring: active.filter((r) => r.plan.daysLeft <= 7).length };
  }, [resellers]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Subscriptions</h1>
          <p>Resellers, their plans and category access, and every payment.</p>
        </div>
      </div>

      <div className="stats" aria-live="polite">
        <Stat label="Active resellers" value={counts ? counts.active : '…'} tone="good" />
        <Stat label="Expiring in 7 days" value={counts ? counts.expiring : '…'} tone={counts?.expiring ? 'warn' : undefined} />
        <Stat
          label="Revenue this month"
          value={revenue ? formatRupees(revenue.month) : revenueError ? '—' : '…'}
          sub={revenue?.partial ? `From the latest ${SUMMARY_LIMIT} payments` : undefined}
        />
        <Stat
          label="Revenue total"
          value={revenue ? formatRupees(revenue.total) : revenueError ? '—' : '…'}
          sub={revenue?.partial ? `From the latest ${SUMMARY_LIMIT} payments` : undefined}
        />
      </div>
      {revenueError && <ErrorState message={`Could not load revenue: ${revenueError}`} onRetry={loadRevenue} />}

      <ResellerTable resellers={resellers} error={resellerError} onReload={loadResellers} cats={cats} />
      <PaymentsTable version={paymentsVersion} onChanged={onPaymentChanged} />
    </>
  );
}
