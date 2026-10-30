'use client';

import { useState } from 'react';
import { CopyField } from './CopyButton';
import { useConfirm, useToast } from './Feedback';
import { api } from '@/lib/client';

// Generates a fresh title / description / style ID / SKU for this product with AI
// (based only on this product's saved data and photos). Available to both roles.
// Admin (no `portal`): saves into the shared marketplace listing; onSaved gets the listing.
// Reseller (`portal` set): saves into their own tracker for that portal; onSaved gets the tracker.
const DAILY_LIMIT_MESSAGE = 'You have used all 5 AI generations for today. Try again tomorrow.';

export default function ListingGenerator({ productId, marketplace, hasListing, onSaved, portal, portalLabel }) {
  const reseller = Boolean(portal);
  const toast = useToast();
  const confirm = useConfirm();
  const [version, setVersion] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');

  const generate = async () => {
    setBusy('generate');
    setError('');
    setSavedNote('');
    const body = reseller ? { marketplace: marketplace.key, portal } : { marketplace: marketplace.key };
    const res = await api(`/api/products/${productId}/listing-version`, { method: 'POST', body });
    setBusy('');
    if (!res.ok) return setError(res.status === 429 && res.data?.details?.code === 'ai_daily_limit' ? DAILY_LIMIT_MESSAGE : res.error);
    setVersion(res.data.version);
  };

  const saveToTracker = async () => {
    setBusy('save');
    const res = await api(`/api/products/${productId}/listing-version`, {
      method: 'PUT',
      body: { portal, title: version.title, description: version.description, styleId: version.styleId, sku: version.sku },
    });
    setBusy('');
    if (!res.ok) return toast(res.error, 'error');
    toast('Saved to your tracker', 'success');
    setSavedNote('Saved to your tracker. You can find it under "Saved AI versions" below.');
    setVersion(null);
    onSaved(res.data.tracker);
  };

  const save = async () => {
    if (reseller) return saveToTracker();
    if (hasListing) {
      const ok = await confirm({
        title: `Use this version for ${marketplace.name}?`,
        message: 'The current title, description, style ID and SKU move to "Previous versions", so nothing is lost.',
        confirmLabel: 'Save version',
        danger: false,
      });
      if (!ok) return;
    }
    setBusy('save');
    const res = await api(`/api/products/${productId}/listing-version`, {
      method: 'PUT',
      body: { marketplace: marketplace.key, title: version.title, description: version.description, styleId: version.styleId, sku: version.sku },
    });
    setBusy('');
    if (!res.ok) return toast(res.error, 'error');
    toast(`Saved to the ${marketplace.name} listing`, 'success');
    setVersion(null);
    onSaved(res.data.listing);
  };

  return (
    <div className="generator">
      <div className="row-between">
        <div>
          <strong>✨ New title, description, style ID &amp; SKU</strong>
          <div className="small muted">
            Written by AI from this product&apos;s saved details and photos only.
            {reseller && ' You can generate up to 5 times a day.'}
          </div>
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={generate} disabled={Boolean(busy)}>
          {busy === 'generate' ? 'Writing…' : version ? 'Generate another' : 'Generate new version'}
        </button>
      </div>
      {busy === 'generate' && (
        <div className="row small mt-1" role="status">
          <span className="spinner" style={{ margin: 0, width: 16, height: 16, borderWidth: 2 }} aria-hidden="true" />
          Writing a new version… usually 5–20 seconds
        </div>
      )}
      {error && <div className="alert alert-error mt-1" role="alert" style={{ marginBottom: 0 }}>{error}</div>}
      {savedNote && !version && (
        <div className="alert alert-success mt-1" role="status" style={{ marginBottom: 0 }}>
          {savedNote}
        </div>
      )}
      {version && busy !== 'generate' && (
        <div className="mt-1">
          <CopyField label="New title" value={version.title} />
          <CopyField label="New description" value={version.description} multiline />
          <div className="grid-2" style={{ gap: '0 0.75rem' }}>
            <CopyField label="New style ID" value={version.styleId} />
            <CopyField label="New SKU" value={version.sku} />
          </div>
          {version.usedPhotos === 0 && <p className="small muted">This product has no photos, so only its saved text was used.</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-sm" onClick={() => setVersion(null)} disabled={Boolean(busy)}>
              Discard
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={Boolean(busy)}>
              {busy === 'save' ? 'Saving…' : reseller ? `Save to my ${portalLabel ? `${portalLabel} ` : ''}tracker` : `Save to ${marketplace.name} listing`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
