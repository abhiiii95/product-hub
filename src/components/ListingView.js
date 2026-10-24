'use client';

import { useState } from 'react';
import CopyButton, { CopyField } from './CopyButton';
import { ListingStatusBadge } from './Badges';
import { useToast } from './Feedback';
import { api, formatDate, formatMoney } from '@/lib/client';
import { LISTING_STATUSES, LISTING_STATUS_LABELS } from '@/lib/constants';

function listingAsText(listing, marketplaceName) {
  const lines = [
    `Marketplace: ${marketplaceName}`,
    `Title: ${listing.title}`,
    `Style ID: ${listing.styleId}`,
    `SKU: ${listing.marketplaceSku}`,
    `Category: ${listing.marketplaceCategory}`,
    '',
    'Description:',
    listing.description,
    '',
    `Keywords: ${listing.keywords.join(', ')}`,
  ];
  if (listing.highlights.length) lines.push('', 'Highlights:', ...listing.highlights.map((h) => `• ${h}`));
  if (listing.attributes.length) lines.push('', 'Attributes:', ...listing.attributes.map((a) => `${a.name}: ${a.value}`));
  if (listing.packQuantity) lines.push('', `Pack quantity: ${listing.packQuantity}`);
  if (listing.suggestedPrice != null) lines.push(`Suggested price: ${listing.suggestedPrice}`);
  return lines.join('\n');
}

// Workflow controls available to both roles: status + append-only notes.
export function ListingWorkflow({ listing, onUpdated }) {
  const toast = useToast();
  const [status, setStatus] = useState(listing.status);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const saveStatus = async (next) => {
    const previous = status;
    setStatus(next);
    setSaving(true);
    const res = await api(`/api/listings/${listing.id}`, { method: 'PATCH', body: { status: next } });
    setSaving(false);
    if (!res.ok) {
      setStatus(previous);
      toast(res.error, 'error');
      return;
    }
    toast(`Status set to ${LISTING_STATUS_LABELS[next]}`, 'success');
    onUpdated(res.data.listing);
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    const res = await api(`/api/listings/${listing.id}/notes`, { method: 'POST', body: { text: note } });
    setSaving(false);
    if (!res.ok) return toast(res.error, 'error');
    setNote('');
    toast('Note added', 'success');
    onUpdated({ ...listing, status, notes: [...listing.notes, res.data.note] });
  };

  return (
    <div className="stack">
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor={`status-${listing.id}`}>Listing status</label>
        <div className="row">
          <select id={`status-${listing.id}`} value={status} onChange={(e) => saveStatus(e.target.value)} disabled={saving} style={{ maxWidth: 240 }}>
            {LISTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LISTING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <ListingStatusBadge status={status} />
        </div>
        <div className="hint">
          Last updated {formatDate(listing.updatedAt)}
          {listing.updatedByName ? ` by ${listing.updatedByName}` : ''}
        </div>
      </div>
      <div>
        <h3>Listing notes</h3>
        {listing.notes.length === 0 ? (
          <p className="small muted">No notes yet.</p>
        ) : (
          <div>
            {listing.notes.map((n) => (
              <div key={n.id} className="list-item">
                <div className="grow">
                  <div className="pre-wrap">{n.text}</div>
                  <div className="small muted">
                    {n.userName} · {formatDate(n.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addNote} className="mt-1">
          <label htmlFor={`note-${listing.id}`} className="sr-only">Add a note</label>
          <textarea id={`note-${listing.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (e.g. listing link, issue found, changes needed)" maxLength={2000} rows={2} required />
          <div className="form-actions">
            <button type="submit" className="btn btn-sm btn-primary" disabled={saving || !note.trim()}>
              Add note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Copy-friendly display of listing content.
export function ListingContent({ listing, marketplaceName }) {
  const attributesText = listing.attributes.map((a) => `${a.name}: ${a.value}`).join('\n');
  return (
    <div>
      <div className="row-between" style={{ marginBottom: '0.75rem' }}>
        <span className="small muted">Click a Copy button to copy that field.</span>
        <CopyButton text={listingAsText(listing, marketplaceName)} label="Copy all content" what="all listing content" />
      </div>
      <CopyField label="Listing title" value={listing.title} />
      <CopyField label="Description" value={listing.description} multiline />
      <div className="grid-2" style={{ gap: '0 0.75rem' }}>
        <CopyField label="Style ID" value={listing.styleId} />
        <CopyField label="Marketplace SKU" value={listing.marketplaceSku} />
        <CopyField label="Marketplace category" value={listing.marketplaceCategory} />
        <CopyField label="Pack quantity" value={listing.packQuantity} />
        <CopyField label="Suggested selling price" value={listing.suggestedPrice} />
      </div>
      <CopyField label="Search keywords" value={listing.keywords} />
      <div className="copy-field">
        <div className="cf-head">
          <span className="cf-label">Product highlights</span>
          <CopyButton text={listing.highlights.join('\n')} what="all highlights" label="Copy all" />
        </div>
        {listing.highlights.length === 0 ? (
          <div className="cf-empty">Not provided</div>
        ) : (
          listing.highlights.map((h, i) => (
            <div key={i} className="row-between" style={{ padding: '0.2rem 0' }}>
              <span>• {h}</span>
              <CopyButton text={h} what={`highlight ${i + 1}`} />
            </div>
          ))
        )}
      </div>
      <div className="copy-field">
        <div className="cf-head">
          <span className="cf-label">Marketplace attributes</span>
          <CopyButton text={attributesText} what="all attributes" label="Copy all" />
        </div>
        {listing.attributes.length === 0 ? (
          <div className="cf-empty">Not provided</div>
        ) : (
          <table>
            <tbody>
              {listing.attributes.map((a, i) => (
                <tr key={i}>
                  <td className="muted" style={{ width: '40%' }}>{a.name}</td>
                  <td>{a.value}</td>
                  <td className="right">
                    <CopyButton text={a.value} what={`${a.name} value`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {listing.suggestedPrice != null && <p className="small muted">Suggested price: {formatMoney(listing.suggestedPrice)}</p>}
      {listing.previousVersions?.length > 0 && (
        <details className="previous-versions">
          <summary>Previous versions ({listing.previousVersions.length})</summary>
          {listing.previousVersions.map((v, i) => (
            <div key={i} className="previous-version">
              <div className="small muted">
                Used until {formatDate(v.savedAt)}
                {v.savedByName ? ` · ${v.savedByName}` : ''}
              </div>
              <CopyField label="Title" value={v.title} />
              <CopyField label="Description" value={v.description} multiline />
              <div className="grid-2" style={{ gap: '0 0.75rem' }}>
                <CopyField label="Style ID" value={v.styleId} />
                <CopyField label="SKU" value={v.marketplaceSku} />
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
