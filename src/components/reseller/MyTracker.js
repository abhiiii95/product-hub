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
    toast(`${portalName(newPortal, body.portalLabel)} added to your tracker`, 'success');
  };

  const removePortal = async () => {
    const ok = await confirm({
      title: `Remove the ${activeName} tracker?`,
      message: 'The status, your notes and the saved AI versions for this portal will be deleted.',
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
    toast('Note saved', 'success');
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
          <h2>My tracker</h2>
          <div className="small muted">Only you can see this. Each portal has its own status and notes.</div>
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
              <option value="">Choose a portal</option>
              {remaining.map((p) => (
                <option key={p} value={p}>
                  {RESELLER_PORTAL_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          {newPortal === 'other' && (
            <div className="field">
              <label htmlFor={`add-portal-name-${productId}`}>Portal name</label>
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
                label={`Status on ${activeName}`}
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
          <div className="hint">{tracker ? `Last updated ${formatDate(tracker.updatedAt)}` : 'No status set yet.'}</div>
        </div>

        {aiEnabled && marketplace && (
          <ListingGenerator key={active} productId={productId} marketplace={marketplace} portal={active} portalLabel={activeName} onSaved={upsert} />
        )}

        <div>
          <h3>Saved AI versions {versions.length > 0 && <span className="muted small">({versions.length})</span>}</h3>
          {versions.length === 0 ? (
            <p className="small muted">No versions saved yet. Use &quot;Generate new version&quot; above to create one, then save it.</p>
          ) : (
            <>
              <SavedVersion version={versions[0]} index={0} />
              {versions.length > 1 && (
                <details className="previous-versions">
                  <summary>Older versions ({versions.length - 1})</summary>
                  {versions.slice(1).map((v, i) => (
                    <SavedVersion key={`${v.savedAt}-${i}`} version={v} index={i + 1} />
                  ))}
                </details>
              )}
            </>
          )}
        </div>

        <div>
          <h3>My notes</h3>
          {notes.length === 0 ? (
            <p className="small muted">No notes yet.</p>
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
              placeholder="Private note (e.g. listing link, price, what to change)"
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
