'use client';

import { useState } from 'react';
import { useToast } from '@/components/Feedback';
import CategoryAccessPicker, { knownIds } from '@/components/admin/CategoryAccessPicker';
import { fieldErrors } from '@/components/admin/format';
import { api } from '@/lib/client';
import { PLAN_CODES, PLANS } from '@/lib/plans';

const KINDS = [
  ['final_price', 'Final price (₹)'],
  ['amount_off', 'Amount off (₹)'],
  ['percent_off', 'Percent off (%)'],
];

const EMPTY = {
  code: '',
  kind: 'final_price',
  value: '',
  plans: [...PLAN_CODES],
  maxUses: '',
  maxUsesPerEmail: '1',
  allowedEmails: '',
  expiresAt: '',
  grants: { mode: 'plan', ids: [] },
  note: '',
};

// Team-member preset: ₹1 for up to 12 purchases by one email, all categories.
const TEAM_PRESET = { kind: 'final_price', value: '1', maxUsesPerEmail: '12', grants: { mode: 'all', ids: [] } };

function Field({ id, label, required, error, hint, className, children }) {
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

// Builds the API body. Rupee kinds are sent in paise; percent stays a whole number.
function toBody(v, categories) {
  const raw = v.value === '' ? null : Number(v.value);
  const value = raw === null || Number.isNaN(raw) ? v.value : v.kind === 'percent_off' ? raw : Math.round(raw * 100);
  return {
    code: v.code.trim().toUpperCase(),
    kind: v.kind,
    value,
    plans: v.plans,
    maxUses: v.maxUses === '' ? null : Number(v.maxUses),
    maxUsesPerEmail: v.maxUsesPerEmail === '' ? 1 : Number(v.maxUsesPerEmail),
    allowedEmails: v.allowedEmails
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
    // End of the chosen day in Indian time.
    expiresAt: v.expiresAt ? `${v.expiresAt}T23:59:59+05:30` : null,
    isActive: true,
    grants: { categoryAccess: v.grants.mode === 'plan' ? null : v.grants.mode === 'all' ? 'all' : knownIds(v.grants.ids, categories) },
    note: v.note,
  };
}

export default function CouponForm({ cats, onCreated }) {
  const toast = useToast();
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setV((s) => ({ ...s, [key]: e.target.value }));
  const togglePlan = (code) => setV((s) => ({ ...s, plans: s.plans.includes(code) ? s.plans.filter((c) => c !== code) : [...s.plans, code] }));
  const invalid = (key) => (errors[key] ? 'true' : undefined);
  const rupees = v.kind !== 'percent_off';

  const submit = async (e) => {
    e.preventDefault();
    const local = {};
    if (v.plans.length === 0) local.plans = 'Choose at least one plan';
    if (v.grants.mode === 'selected' && knownIds(v.grants.ids, cats.categories).length === 0) local.grants = 'Choose at least one category, or pick another option';
    if (Object.keys(local).length) {
      setErrors(local);
      setError('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    setError('');
    setErrors({});
    const res = await api('/api/coupons', { method: 'POST', body: toBody(v, cats.categories) });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return setErrors(fieldErrors(res));
    }
    toast(`Coupon ${res.data.coupon.code} created`, 'success');
    setV(EMPTY);
    onCreated(res.data.coupon);
  };

  return (
    <form onSubmit={submit}>
      <div className="alert alert-info coupon-preset">
        <span>
          Harsh jaise team member ke liye: <strong>Final price ₹1, max per email 12, expiry, All categories</strong>.
        </span>
        <button type="button" className="btn btn-sm" onClick={() => setV((s) => ({ ...s, ...TEAM_PRESET }))}>
          Use this preset
        </button>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-grid">
        <Field id="c-code" label="Code" required error={errors.code} hint="4-32 characters: A-Z, 0-9 or -">
          <input
            id="c-code"
            type="text"
            required
            minLength={4}
            maxLength={32}
            autoComplete="off"
            className="mono upper"
            value={v.code}
            onChange={set('code')}
            aria-invalid={invalid('code')}
          />
        </Field>
        <Field id="c-kind" label="Discount type" required error={errors.kind}>
          <select id="c-kind" value={v.kind} onChange={set('kind')} aria-invalid={invalid('kind')}>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="c-value"
          label={v.kind === 'final_price' ? 'Final price (₹)' : v.kind === 'amount_off' ? 'Amount off (₹)' : 'Percent off (%)'}
          required
          error={errors.value}
          hint={v.kind === 'final_price' ? 'Buyer pays this amount. Minimum ₹1.' : v.kind === 'amount_off' ? 'Price never goes below ₹1.' : '1 to 100'}
        >
          <input
            id="c-value"
            type="number"
            required
            min={rupees ? (v.kind === 'final_price' ? 1 : 0.01) : 1}
            max={rupees ? 100000 : 100}
            step={rupees ? 0.01 : 1}
            inputMode="decimal"
            value={v.value}
            onChange={set('value')}
            aria-invalid={invalid('value')}
          />
        </Field>
        <div className="field">
          <span className="label-like" id="c-plans-label">
            Plans<span className="req" aria-hidden="true">*</span>
          </span>
          <div className="row" role="group" aria-labelledby="c-plans-label">
            {PLAN_CODES.map((code) => (
              <label key={code} className="checkbox" htmlFor={`c-plan-${code}`}>
                <input id={`c-plan-${code}`} type="checkbox" checked={v.plans.includes(code)} onChange={() => togglePlan(code)} />
                {code} · {PLANS[code].name}
              </label>
            ))}
          </div>
          {errors.plans && <div className="error-text">{errors.plans}</div>}
        </div>
        <Field id="c-max" label="Max uses (total)" error={errors.maxUses} hint="Khaali = unlimited">
          <input id="c-max" type="number" min={1} step={1} value={v.maxUses} onChange={set('maxUses')} aria-invalid={invalid('maxUses')} />
        </Field>
        <Field id="c-per-email" label="Max uses per email" error={errors.maxUsesPerEmail}>
          <input id="c-per-email" type="number" min={1} max={1000} step={1} value={v.maxUsesPerEmail} onChange={set('maxUsesPerEmail')} aria-invalid={invalid('maxUsesPerEmail')} />
        </Field>
        <Field id="c-expiry" label="Expiry date" error={errors.expiresAt} hint="Us din raat 11:59 (IST) tak chalega. Khaali = kabhi nahi.">
          <input id="c-expiry" type="date" value={v.expiresAt} onChange={set('expiresAt')} aria-invalid={invalid('expiresAt')} />
        </Field>
        <Field id="c-emails" label="Allowed emails (optional)" error={errors.allowedEmails} hint="Comma separated. Khaali = koi bhi email." className="span-all">
          <textarea id="c-emails" rows={2} value={v.allowedEmails} onChange={set('allowedEmails')} aria-invalid={invalid('allowedEmails')} />
        </Field>
        <div className="span-all">
          <CategoryAccessPicker
            idPrefix="c-grants"
            legend="Grants category access"
            categories={cats.categories}
            loadError={cats.error}
            onRetry={cats.reload}
            value={v.grants}
            onChange={(grants) => setV((s) => ({ ...s, grants }))}
            allowPlan
            error={errors.grants}
            hint="Plan ke hisaab se = plan jo deta hai wahi. All ya chosen = coupon se extra access."
          />
        </div>
        <Field id="c-note" label="Note" error={errors.note} className="span-all">
          <input id="c-note" type="text" maxLength={500} value={v.note} onChange={set('note')} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={() => { setV(EMPTY); setErrors({}); setError(''); }}>
          Clear
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Creating…' : 'Create coupon'}
        </button>
      </div>
    </form>
  );
}
