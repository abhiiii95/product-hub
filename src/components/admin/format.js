// Small display helpers shared by the admin screens (Subscriptions, Coupons, Users).
import { PLANS } from '@/lib/plans';
import { formatRupees } from '@/lib/site';

export { formatRupees };

export function planName(code) {
  return PLANS[code]?.name || (code ? code.toUpperCase() : '—');
}

// "12 Nov 2026" in Indian time; "—" for empty values.
export function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

// The field-level error map the API sends as `details` (from Validator), or {}.
export function fieldErrors(res) {
  const details = res?.data?.details;
  return details && typeof details === 'object' && !Array.isArray(details) ? details : {};
}

// Reseller plan status shown as a badge: Active, Comp (free days), Expired or No plan.
export function planStatus(user) {
  const plan = user.plan || {};
  if (plan.active) {
    if (user.planSource === 'comp') return { label: 'Comp', className: 'badge badge-info' };
    return { label: 'Active', className: 'badge badge-success' };
  }
  if (user.planEndsAt) return { label: 'Expired', className: 'badge badge-danger' };
  return { label: 'No plan', className: 'badge' };
}
