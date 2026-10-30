'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CopyField } from '../CopyButton';
import { useConfirm, useToast } from '../Feedback';
import ListingGenerator from '../ListingGenerator';
import { TrackerStatusBadge, TrackerStatusSelect, portalName } from './TrackerBits';
import { api, formatDate } from '@/lib/client';
import { DEFAULT_MARKETPLACE, RESELLER_PORTALS, RESELLER_PORTAL_LABELS } from '@/lib/constants';

function SavedVersion({ version, index }) {
  return (
    <div className="rs-version">
      <div className="small muted">
        #{index + 1} · Saved {formatDate(version.savedAt)}
      </div>
      <CopyField label="Title" value={version.title} />
      <CopyField label="Description" value={version.description} multiline />
      <div className="grid-2" style={{ gap: '0 0.75rem' }}>
        <CopyField label="Style ID" value={version.styleId} />
        <CopyField label="SKU" value={version.sku} />
      </div>
    </div>
  );
}

// The reseller's private tracker for one product: one tab per portal with their own
// status, private notes and saved AI versions. Nothing here is visible to other resellers.
export default function MyTracker({ productId, trackers, onChange, onReload, aiEnabled, marketplace }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [active, setActive] = useState(DEFAULT_MARKETPLACE);
  const [adding, setAdding] = useState(false);
  const [newPortal, setNewPortal] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  // Links from My Listings point at #my-tracker, which renders after the data loads.
  useEffect(() => {
    if (window.location.hash === '#my-tracker') document.getElementById('my-tracker')?.scrollIntoView({ block: 'start' });
  }, []);

  const portals = RESELLER_PORTALS.filter((p) => p === DEFAULT_MARKETPLACE || trackers.some((t) => t.portal === p));
  const remaining = RESELLER_PORTALS.filter((p) => !portals.includes(p));
  const tracker = trackers.find((t) => t.portal === active) || null;
  const activeName = portalName(active, tracker?.portalLabel);

  const upsert = (updated) =>
    onChange((list) => (list.some((t) => t.portal === updated.portal) ? list.map((t) => (t.portal === updated.portal ? updated : t)) : [...list, updated]));

  const addPortal = async (e) => {
    e.preventDefault();
    if (!newPortal) return;
    setBusy('portal');
    const body = { portal: newPortal, status: 'not_started' };
    if (newPortal === 'other' && newLabel.trim()) body.portalLabel = newLabel.trim();
    const res = await api(`/api/my-listings/${productId}`, { method: 'PUT', body });
    setBusy('');
    if (!res.ok) return toast(res.error, 'error');
    upsert(res.data.tracker);
    setActive(newPortal);
    setAdding(false);
    setNewPortal('');
    setNewLabel('');
    toast(`${portalName(newPortal, body.portalLabel)} tracker mein add ho gaya`, 'success');
  };

  const removePortal = async () => {
    const ok = await confirm({
      title: `${activeName} tracker hatana hai?`,
      message: 'Is portal ka status, aapke notes aur saved AI versions mit jayenge.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusy('remove');
    const res = await api(`/api/my-listings/${productId}?portal=${encodeURIComponent(active)}`, { method: 'DELETE' });
    setBusy('');
    if (!res.ok) return toast(res.error, 'error');
    onChange((list) => list.filter((t) => t.portal !== active));
    setActive(DEFAULT_MARKETPLACE);
    toast('Tracker entry removed', 'success');
  };

  const addNote = async (e) => {
    e.preventDefault();
    const text = note.trim();
    if (!text) return;
    setBusy('note');
    const res = await api(`/api/my-listings/${productId}/notes`, { method: 'POST', body: { portal: active, text } });
    setBusy('');
    if (!res.ok) return toast(res.error, 'error');
    setNote('');
    toast('Note save ho gaya', 'success');
    // The first note creates the record; reload to get it in full.
    if (tracker) upsert({ ...tracker, notes: [...tracker.notes, res.data.note] });
    else onReload();
  };

  const notes = tracker?.notes || [];
  const versions = tracker?.savedVersions || [];

  return (
    <div className="card" id="my-tracker">
      <div className="card-header">
        <div>
          <h2>Mera tracker</h2>
          <div className="small muted">Sirf aap dekh sakte ho. Har portal ka apna status aur notes.</div>
        </div>
        <Link href="/my-listings" className="small">
          My Listings →
        </Link>
      </div>

      <div className="tabs rs-portal-tabs" role="tablist" aria-label="Portals">
        {portals.map((p) => {
          const t = trackers.find((x) => x.portal === p);
          return (
            <button key={p} type="button" role="tab" aria-selected={p === active} onClick={() => setActive(p)}>
              {portalName(p, t?.portalLabel)} {t ? <TrackerStatusBadge status={t.status} /> : null}
            </button>
          );
        })}
        {remaining.length > 0 && !adding && (
          <button type="button" className="rs-add-portal" onClick={() => setAdding(true)}>
            + Portal
          </button>
        )}
      </div>

      {adding && (
        <form className="rs-add-form" onSubmit={addPortal}>
          <div className="field">
            <label htmlFor={`add-portal-${productId}`}>Portal</label>
            <select id={`add-portal-${productId}`} value={newPortal} onChange={(e) => setNewPortal(e.target.value)} required>
              <option value="">Portal chuno</option>
              {remaining.map((p) => (
                <option key={p} value={p}>
                  {RESELLER_PORTAL_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          {newPortal === 'other' && (
            <div className="field">
              <label htmlFor={`add-portal-name-${productId}`}>Portal ka naam</label>
              <input id={`add-portal-name-${productId}`} type="text" maxLength={40} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Facebook" />
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-sm" onClick={() => setAdding(false)} disabled={busy === 'portal'}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={!newPortal || busy === 'portal'}>
              {busy === 'portal' ? 'Adding…' : 'Add portal'}
            </button>
          </div>
        </form>
      )}

      <div className="stack">
        <div className="field" style={{ marginBottom: 0 }}>
          <div className="row-between">
            <div className="rs-status-field">
              <TrackerStatusSelect
                key={`${active}-${tracker?.status || 'none'}`}
                id={`tracker-status-${productId}-${active}`}
                label={`${activeName} par status`}
                productId={productId}
                portal={active}
                status={tracker?.status}
                onSaved={upsert}
              />
            </div>
            {tracker && (
              <button type="button" className="btn btn-sm btn-danger" onClick={removePortal} disabled={busy === 'remove'}>
                Remove
              </button>
            )}
          </div>
          <div className="hint">{tracker ? `Last updated ${formatDate(tracker.updatedAt)}` : 'Abhi status set nahi kiya.'}</div>
        </div>

        {aiEnabled && marketplace && (
          <ListingGenerator key={active} productId={productId} marketplace={marketplace} portal={active} portalLabel={activeName} onSaved={upsert} />
        )}

        <div>
          <h3>Saved AI versions {versions.length > 0 && <span className="muted small">({versions.length})</span>}</h3>
          {versions.length === 0 ? (
            <p className="small muted">Abhi koi version save nahi kiya. Upar &quot;Generate new version&quot; se banao aur save karo.</p>
          ) : (
            <>
              <SavedVersion version={versions[0]} index={0} />
              {versions.length > 1 && (
                <details className="previous-versions">
                  <summary>Purane versions ({versions.length - 1})</summary>
                  {versions.slice(1).map((v, i) => (
                    <SavedVersion key={`${v.savedAt}-${i}`} version={v} index={i + 1} />
                  ))}
                </details>
              )}
            </>
          )}
        </div>

        <div>
          <h3>Mere notes</h3>
          {notes.length === 0 ? (
            <p className="small muted">Abhi koi note nahi.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="list-item">
                <div className="grow">
                  <div className="pre-wrap">{n.text}</div>
                  <div className="small muted">{formatDate(n.createdAt)}</div>
                </div>
              </div>
            ))
          )}
          <form onSubmit={addNote} className="mt-1">
            <label htmlFor={`tracker-note-${productId}-${active}`} className="sr-only">
              Private note for {activeName}
            </label>
            <textarea
              id={`tracker-note-${productId}-${active}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Private note (e.g. listing link, price, kya badalna hai)"
              maxLength={2000}
              rows={2}
              required
            />
            <div className="form-actions">
              <button type="submit" className="btn btn-sm btn-primary" disabled={busy === 'note' || !note.trim()}>
                {busy === 'note' ? 'Saving…' : 'Add note'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
