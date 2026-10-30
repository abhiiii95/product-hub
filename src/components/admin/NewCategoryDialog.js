'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

// Small native <dialog> that creates a category by name (POST /api/categories).
// After creating, it offers a link to set up the category's fields later.
export default function NewCategoryDialog({ open, onClose, onCreated }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName('');
      setError('');
      setCreated(null);
      dialog.showModal();
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const clean = name.trim();
    if (!clean) {
      setError('Category ka naam likho');
      return;
    }
    setSaving(true);
    setError('');
    const res = await api('/api/categories', { method: 'POST', body: { name: clean } });
    setSaving(false);
    if (!res.ok) {
      setError(res.data?.details?.name || res.error);
      return;
    }
    setCreated(res.data.category);
    onCreated(res.data.category);
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="new-cat-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id="new-cat-title">New category</h2>
      {created ? (
        <>
          <p className="alert alert-success" role="status">
            <strong>{created.name}</strong> ban gayi aur product mein select ho gayi.
          </p>
          <p className="small muted">
            Is category ke special fields (size, fabric…) baad mein set kar sakte ho:{' '}
            <a href={`/categories/${created.id}`} target="_blank" rel="noopener noreferrer">
              Set up fields (new tab)
            </a>
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
              Done
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="new-cat-name">
              Category name<span className="req" aria-hidden="true">*</span>
            </label>
            <input
              ref={inputRef}
              id="new-cat-name"
              type="text"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'new-cat-error' : undefined}
              autoComplete="off"
            />
            {error && (
              <div className="error-text" id="new-cat-error" role="alert">
                {error}
              </div>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create category'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
