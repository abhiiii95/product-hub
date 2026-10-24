'use client';

import { useState } from 'react';
import { useToast } from './Feedback';
import { api } from '@/lib/client';
import { LISTING_STATUSES, LISTING_STATUS_LABELS } from '@/lib/constants';

const blank = (v) => (v === null || v === undefined ? '' : String(v));

// Admin-only editor for marketplace listing content. Creates when `listing` is absent.
export default function ListingEditor({ listing, productId, marketplace, onSaved, onCancel }) {
  const toast = useToast();
  const [values, setValues] = useState({
    title: listing?.title || '',
    description: listing?.description || '',
    styleId: listing?.styleId || '',
    marketplaceSku: listing?.marketplaceSku || '',
    marketplaceCategory: listing?.marketplaceCategory || '',
    keywords: (listing?.keywords || []).join(', '),
    highlights: (listing?.highlights || []).join('\n'),
    packQuantity: blank(listing?.packQuantity),
    suggestedPrice: blank(listing?.suggestedPrice),
    status: listing?.status || 'not_started',
  });
  const [attributes, setAttributes] = useState(listing?.attributes?.length ? listing.attributes : [{ name: '', value: '' }]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const setAttr = (i, key, val) => setAttributes((list) => list.map((a, j) => (j === i ? { ...a, [key]: val } : a)));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setErrors({});
    const body = {
      ...values,
      highlights: values.highlights.split('\n'),
      attributes: attributes.filter((a) => a.name.trim()),
    };
    const res = listing
      ? await api(`/api/listings/${listing.id}`, { method: 'PATCH', body })
      : await api('/api/listings', { method: 'POST', body: { ...body, productId, marketplace: marketplace.key } });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      setErrors(res.data?.details || {});
      return;
    }
    toast(listing ? 'Listing saved' : 'Listing created', 'success');
    onSaved(res.data.listing);
  };

  const id = (k) => `le-${listing?.id || 'new'}-${k}`;

  return (
    <form onSubmit={onSubmit}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {!listing && <p className="small muted">Blank title, description, keywords and price are pre-filled from the product.</p>}
      <div className="field">
        <label htmlFor={id('title')}>Listing title</label>
        <input id={id('title')} type="text" maxLength={300} value={values.title} onChange={set('title')} aria-invalid={errors.title ? 'true' : undefined} />
      </div>
      <div className="field">
        <label htmlFor={id('description')}>Listing description</label>
        <textarea id={id('description')} rows={6} maxLength={10000} value={values.description} onChange={set('description')} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={id('styleId')}>Style ID</label>
          <input id={id('styleId')} type="text" maxLength={100} value={values.styleId} onChange={set('styleId')} />
        </div>
        <div className="field">
          <label htmlFor={id('msku')}>Marketplace SKU</label>
          <input id={id('msku')} type="text" maxLength={100} value={values.marketplaceSku} onChange={set('marketplaceSku')} />
        </div>
        <div className="field">
          <label htmlFor={id('cat')}>Marketplace category</label>
          <input id={id('cat')} type="text" maxLength={300} value={values.marketplaceCategory} onChange={set('marketplaceCategory')} />
        </div>
        <div className="field">
          <label htmlFor={id('pack')}>Pack quantity</label>
          <input id={id('pack')} type="number" min="1" step="1" value={values.packQuantity} onChange={set('packQuantity')} />
          {errors.packQuantity && <div className="error-text">{errors.packQuantity}</div>}
        </div>
        <div className="field">
          <label htmlFor={id('price')}>Suggested selling price (₹)</label>
          <input id={id('price')} type="number" min="0" step="0.01" value={values.suggestedPrice} onChange={set('suggestedPrice')} />
        </div>
        <div className="field">
          <label htmlFor={id('status')}>Listing status</label>
          <select id={id('status')} value={values.status} onChange={set('status')}>
            {LISTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LISTING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={id('keywords')}>Search keywords</label>
        <input id={id('keywords')} type="text" value={values.keywords} onChange={set('keywords')} />
        <div className="hint">Comma separated</div>
      </div>
      <div className="field">
        <label htmlFor={id('highlights')}>Product highlights</label>
        <textarea id={id('highlights')} rows={4} value={values.highlights} onChange={set('highlights')} />
        <div className="hint">One highlight per line</div>
      </div>
      <fieldset>
        <legend>Marketplace attributes</legend>
        {attributes.map((a, i) => (
          <div key={i} className="row" style={{ marginBottom: '0.5rem', flexWrap: 'nowrap' }}>
            <label className="sr-only" htmlFor={id(`an${i}`)}>Attribute {i + 1} name</label>
            <input id={id(`an${i}`)} type="text" placeholder="Name (e.g. Fabric)" value={a.name} maxLength={100} onChange={(e) => setAttr(i, 'name', e.target.value)} />
            <label className="sr-only" htmlFor={id(`av${i}`)}>Attribute {i + 1} value</label>
            <input id={id(`av${i}`)} type="text" placeholder="Value" value={a.value} maxLength={1000} onChange={(e) => setAttr(i, 'value', e.target.value)} />
            <button type="button" className="btn btn-sm btn-ghost" aria-label={`Remove attribute ${i + 1}`} onClick={() => setAttributes((list) => list.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <p>
          <button type="button" className="btn btn-sm" onClick={() => setAttributes((list) => [...list, { name: '', value: '' }])}>
            + Add attribute
          </button>
        </p>
      </fieldset>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : listing ? 'Save listing' : `Create ${marketplace.name} listing`}
        </button>
      </div>
    </form>
  );
}
