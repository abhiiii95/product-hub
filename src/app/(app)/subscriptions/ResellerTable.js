'use client';

import { useMemo, useState } from 'react';
import { Empty, ErrorState, Loading, useConfirm, useToast } from '@/components/Feedback';
import CategoryAccessPicker, { toAdminAccess } from '@/components/admin/CategoryAccessPicker';
import SecretField from '@/components/admin/SecretField';
import { fieldErrors, planName, planStatus, shortDate } from '@/components/admin/format';
import { api } from '@/lib/client';
import { PLAN_CODES, PLANS } from '@/lib/plans';

const SOURCE_LABELS = { purchase: 'Purchase', admin: 'Admin', migration: 'Migration' };
const COLS = 8;

function PlanForm({ reseller, onDone, onCancel }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [action, setAction] = useState('extend');
  const [days, setDays] = useState('30');
  const [planCode, setPlanCode] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const p = `plan-${reseller.id}`;

  const submit = async (e) => {
    e.preventDefault();
    const n = days === '' ? null : Number(days);
    const message =
      action === 'extend'
        ? `${reseller.name} ka plan ${n} din badh jayega.`
        : action === 'comp'
          ? `${reseller.name} ko ${n} free din milenge${planCode ? ` (${planName(planCode)})` : ''}.`
          : n
            ? `${reseller.name} ke plan se ${n} din kam ho jayenge.`
            : `${reseller.name} ka plan abhi khatam ho jayega. Woh catalog nahi dekh payenge.`;
    const ok = await confirm({
      title: action === 'revoke' ? 'Revoke plan?' : action === 'comp' ? 'Give free days?' : 'Extend plan?',
      message,
      confirmLabel: action === 'revoke' ? 'Revoke' : action === 'comp' ? 'Give free days' : 'Extend',
      danger: action === 'revoke',
    });
    if (!ok) return;
    const body = { action, note };
    if (n) body.days = n;
    if (action === 'comp' && planCode) body.planCode = planCode;
    setSaving(true);
    setError('');
    setErrors({});
    const res = await api(`/api/users/${reseller.id}/plan`, { method: 'POST', body });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return setErrors(fieldErrors(res));
    }
    toast(`Plan updated. Ends ${shortDate(res.data.plan?.endsAt)}.`, 'success');
    onDone();
  };

  return (
    <form onSubmit={submit} className="inline-form">
      <h3 className="inline-title">Plan for {reseller.name}</h3>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="row access-modes" role="radiogroup" aria-label="Plan action">
        {[
          ['extend', 'Extend'],
          ['comp', 'Comp (free days)'],
          ['revoke', 'Revoke'],
        ].map(([value, label]) => (
          <label key={value} className="checkbox">
            <input type="radio" name={`${p}-action`} checked={action === value} onChange={() => setAction(value)} />
            {label}
          </label>
        ))}
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${p}-days`}>
            Days{action !== 'revoke' && <span className="req" aria-hidden="true">*</span>}
          </label>
          <input
            id={`${p}-days`}
            type="number"
            min={1}
            max={3650}
            step={1}
            required={action !== 'revoke'}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-invalid={errors.days ? 'true' : undefined}
          />
          {action === 'revoke' && <div className="hint">Khaali chhodo to plan abhi khatam.</div>}
          {errors.days && <div className="error-text">{errors.days}</div>}
        </div>
        {action === 'comp' && (
          <div className="field">
            <label htmlFor={`${p}-code`}>Plan</label>
            <select id={`${p}-code`} value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
              <option value="">Keep current plan</option>
              {PLAN_CODES.map((code) => (
                <option key={code} value={code}>
                  {PLANS[code].name} ({code})
                </option>
              ))}
            </select>
            {errors.planCode && <div className="error-text">{errors.planCode}</div>}
          </div>
        )}
        <div className="field span-all">
          <label htmlFor={`${p}-note`}>Note</label>
          <input id={`${p}-note`} type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          {errors.note && <div className="error-text">{errors.note}</div>}
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={action === 'revoke' ? 'btn btn-danger' : 'btn btn-primary'} disabled={saving}>
          {saving ? 'Saving…' : action === 'revoke' ? 'Revoke' : action === 'comp' ? 'Give free days' : 'Extend plan'}
        </button>
      </div>
    </form>
  );
}

function AccessForm({ reseller, cats, onDone, onCancel }) {
  const toast = useToast();
  const confirm = useConfirm();
  const initial = reseller.categoryAccess || {};
  const [value, setValue] = useState({ mode: initial.adminMode === 'all' ? 'all' : 'selected', ids: initial.adminCategoryIds || [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selfPicks = (reseller.access?.categories || []).filter((c) => c.via === 'self');
  const allAccessUntil = reseller.allAccessUntil && new Date(reseller.allAccessUntil) > new Date() ? reseller.allAccessUntil : null;

  const submit = async (e) => {
    e.preventDefault();
    const body = toAdminAccess(value, cats.categories);
    const ok = await confirm({
      title: 'Change category access?',
      message:
        body.adminMode === 'all'
          ? `${reseller.name} ko saari categories dikhengi.`
          : `${reseller.name} ko ${body.adminCategoryIds.length} category(s) aap ki taraf se milengi, plus jo unhone khud chuni hain.`,
      confirmLabel: 'Save access',
      danger: false,
    });
    if (!ok) return;
    setSaving(true);
    setError('');
    const res = await api(`/api/users/${reseller.id}/access`, { method: 'PUT', body });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast('Category access saved', 'success');
    onDone();
  };

  return (
    <form onSubmit={submit} className="inline-form">
      <h3 className="inline-title">Category access for {reseller.name}</h3>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {allAccessUntil && (
        <p className="small muted">Plan ya coupon se abhi saari categories khuli hain, {shortDate(allAccessUntil)} tak.</p>
      )}
      <CategoryAccessPicker
        idPrefix={`access-${reseller.id}`}
        legend="Admin grant"
        categories={cats.categories}
        loadError={cats.error}
        onRetry={cats.reload}
        value={value}
        onChange={setValue}
        hint="Reseller ki apni chuni hui categories alag se rehti hain; yeh unke upar extra access hai."
      />
      {selfPicks.length > 0 && (
        <p className="small muted">Reseller ne khud chuni: {selfPicks.map((c) => c.name).join(', ')}</p>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save access'}
        </button>
      </div>
    </form>
  );
}

function AccessCell({ access }) {
  if (access?.all) return <span className="badge badge-success">All</span>;
  const list = access?.categories || [];
  if (list.length === 0) return <span className="muted">None</span>;
  return (
    <span className="chips access-chips">
      {list.map((c) => (
        <span key={c.id} className="chip" title={c.via === 'self' ? 'Picked by the reseller' : 'Granted by admin'}>
          {c.name}
          {c.via === 'self' ? ' ·self' : ''}
        </span>
      ))}
    </span>
  );
}

const FILTERS = [
  ['', 'All resellers'],
  ['active', 'Active'],
  ['expiring', 'Expiring in 7 days'],
  ['comp', 'Comp'],
  ['expired', 'Expired / no plan'],
  ['pending', 'Password not changed yet'],
];

function matches(r, filter, q) {
  if (filter === 'active' && !r.plan?.active) return false;
  if (filter === 'expiring' && !(r.plan?.active && r.plan.daysLeft <= 7)) return false;
  if (filter === 'comp' && !(r.plan?.active && r.planSource === 'comp')) return false;
  if (filter === 'expired' && r.plan?.active) return false;
  if (filter === 'pending' && !r.pendingPassword) return false;
  if (!q) return true;
  return [r.name, r.email, r.phone].some((v) => v && v.toLowerCase().includes(q));
}

export default function ResellerTable({ resellers, error, onReload, cats }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [panel, setPanel] = useState({ id: null, mode: null });
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (resellers || []).filter((r) => matches(r, filter, q));
  }, [resellers, filter, query]);

  const togglePanel = (id, mode) => setPanel((p) => (p.id === id && p.mode === mode ? { id: null, mode: null } : { id, mode }));
  const done = () => {
    setPanel({ id: null, mode: null });
    onReload();
  };

  const resend = async (r) => {
    const ok = await confirm({
      title: `Send a new welcome email to ${r.name}?`,
      message: 'Naya temporary password banega aur purana kaam nahi karega. Reseller sabhi devices se sign out ho jayega.',
      confirmLabel: 'Send email',
    });
    if (!ok) return;
    setBusy(r.id);
    const res = await api(`/api/users/${r.id}/resend-welcome`, { method: 'POST' });
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    toast(`Welcome email queued for ${r.email}`, 'success');
    onReload();
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Resellers</h2>
        {resellers && (
          <span className="small muted">
            {shown.length} of {resellers.length}
          </span>
        )}
      </div>
      <div className="filters">
        <div className="grow">
          <label htmlFor="res-q">Search</label>
          <input id="res-q" type="search" placeholder="Name, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div>
          <label htmlFor="res-filter">Show</label>
          <select id="res-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <ErrorState message={error} onRetry={onReload} />}
      {!resellers && !error && <Loading />}
      {resellers && resellers.length === 0 && (
        <Empty title="No resellers yet">Jab koi plan khareedega ya aap User Management se account banayenge, woh yahan dikhega.</Empty>
      )}
      {resellers && resellers.length > 0 && shown.length === 0 && <Empty title="No reseller matches">Search ya filter badal ke dekho.</Empty>}
      {shown.length > 0 && (
        <div className="table-wrap stack-mobile admin-table">
          <table>
            <thead>
              <tr>
                <th>Reseller</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Ends</th>
                <th>Categories</th>
                <th>Source</th>
                <th>Temp password</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const status = planStatus(r);
                const open = panel.id === r.id;
                return [
                  <tr key={r.id}>
                    <td className="cell-main">
                      <strong>{r.name}</strong>
                      {!r.isActive && <span className="badge badge-danger badge-gap">Deactivated</span>}
                      <div className="small muted break">{r.email}</div>
                      {r.phone && <div className="small muted">{r.phone}</div>}
                    </td>
                    <td data-label="Plan">
                      {planName(r.planCode)}
                      {r.plan?.tier === 'all' && r.planCode !== 'm3' && <div className="small muted">All access</div>}
                    </td>
                    <td data-label="Status">
                      <span className={status.className}>{status.label}</span>
                      {r.plan?.active && r.plan.daysLeft <= 7 && <div className="small warn-text">{r.plan.daysLeft} din baaki</div>}
                    </td>
                    <td data-label="Ends" className="nowrap small">
                      {shortDate(r.plan?.endsAt || r.planEndsAt)}
                    </td>
                    <td data-label="Categories">
                      <AccessCell access={r.access} />
                    </td>
                    <td data-label="Source" className="small">
                      {SOURCE_LABELS[r.source] || r.source || '—'}
                    </td>
                    <td data-label="Temp password">
                      <div className="secret-cell">
                        {r.pendingPassword ? (
                          <SecretField value={r.pendingPassword} what={`temporary password for ${r.name}`} />
                        ) : (
                          <span className="small muted">{r.mustChangePassword ? 'Not stored' : 'Changed by user'}</span>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => resend(r)}
                          disabled={busy === r.id || !r.isActive}
                          title={r.isActive ? undefined : 'Activate the account first'}
                        >
                          {busy === r.id ? 'Sending…' : 'Resend mail'}
                        </button>
                      </div>
                    </td>
                    <td className="right nowrap cell-actions">
                      <button type="button" className="btn btn-sm" aria-expanded={open && panel.mode === 'plan'} onClick={() => togglePanel(r.id, 'plan')}>
                        Plan…
                      </button>{' '}
                      <button type="button" className="btn btn-sm" aria-expanded={open && panel.mode === 'access'} onClick={() => togglePanel(r.id, 'access')}>
                        Access…
                      </button>
                    </td>
                  </tr>,
                  open && (
                    <tr key={`${r.id}-panel`} className="panel-row">
                      <td className="cell-wide" colSpan={COLS}>
                        {panel.mode === 'plan' ? (
                          <PlanForm reseller={r} onDone={done} onCancel={() => setPanel({ id: null, mode: null })} />
                        ) : (
                          <AccessForm reseller={r} cats={cats} onDone={done} onCancel={() => setPanel({ id: null, mode: null })} />
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

