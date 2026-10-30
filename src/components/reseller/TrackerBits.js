'use client';

import { useState } from 'react';
import { useToast } from '../Feedback';
import { api } from '@/lib/client';
import { RESELLER_LISTING_STATUSES, RESELLER_LISTING_STATUS_LABELS, RESELLER_PORTAL_LABELS } from '@/lib/constants';

const STATUS_CLASSES = {
  not_started: 'badge',
  in_progress: 'badge badge-info',
  listed: 'badge badge-success',
  needs_changes: 'badge badge-warning',
  paused: 'badge badge-danger',
};

export function TrackerStatusBadge({ status }) {
  return <span className={STATUS_CLASSES[status] || 'badge'}>{RESELLER_LISTING_STATUS_LABELS[status] || 'Not Started'}</span>;
}

// "Meesho", or the reseller's own name for an "other" portal.
export function portalName(portal, portalLabel) {
  if (portal === 'other' && portalLabel) return portalLabel;
  return RESELLER_PORTAL_LABELS[portal] || portal;
}

// Status dropdown that saves the reseller's own status for one product on one portal.
// onSaved receives the updated tracker record from the API.
export function TrackerStatusSelect({ productId, portal, status, onSaved, id, label = 'Status', hideLabel = false }) {
  const toast = useToast();
  const [value, setValue] = useState(status || 'not_started');
  const [saving, setSaving] = useState(false);

  const save = async (next) => {
    const previous = value;
    setValue(next);
    setSaving(true);
    const res = await api(`/api/my-listings/${productId}`, { method: 'PUT', body: { portal, status: next } });
    setSaving(false);
    if (!res.ok) {
      setValue(previous);
      toast(res.error, 'error');
      return;
    }
    toast(`Status: ${RESELLER_LISTING_STATUS_LABELS[next]}`, 'success');
    onSaved?.(res.data.tracker);
  };

  return (
    <>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <select id={id} className="rs-status-select" value={value} onChange={(e) => save(e.target.value)} disabled={saving} aria-busy={saving}>
        {RESELLER_LISTING_STATUSES.map((s) => (
          <option key={s} value={s}>
            {RESELLER_LISTING_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </>
  );
}

// All of the reseller's tracker records for one product (GET /api/my-listings?productId=).
export async function loadTrackersForProduct(productId) {
  const res = await api(`/api/my-listings?productId=${encodeURIComponent(productId)}&limit=100`);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, trackers: res.data.items };
}
