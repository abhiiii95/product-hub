'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Loading, ErrorState, useConfirm, useToast } from '@/components/Feedback';
import CustomFieldInput from '@/components/CustomFieldInput';
import { api } from '@/lib/client';
import { FIELD_TYPES, FIELD_TYPE_LABELS } from '@/lib/constants';

let tempCounter = 0;
const newField = () => ({ tempId: `new-${++tempCounter}`, key: '', label: '', type: 'text', options: '', required: false, helpText: '' });
const fromServer = (f) => ({ ...f, tempId: f.id, options: (f.options || []).join(', ') });
const rowId = (f) => f.id || f.tempId;

export default function CategoryEditor({ id }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [category, setCategory] = useState(null);
  const [details, setDetails] = useState({ name: '', description: '' });
  const [fields, setFields] = useState([]);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const apply = (c) => {
    setCategory(c);
    setDetails({ name: c.name, description: c.description });
    setFields(c.fields.map(fromServer));
    setDirty(false);
  };

  const load = useCallback(async () => {
    setError('');
    const res = await api(`/api/categories/${id}`);
    if (res.ok) apply(res.data.category);
    else setError(res.error);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const updateField = (index, changes) => {
    setFields((list) => list.map((f, i) => (i === index ? { ...f, ...changes } : f)));
    setDirty(true);
  };
  const move = (index, delta) => {
    setFields((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
    setDirty(true);
  };
  const removeField = async (index) => {
    const f = fields[index];
    if (f.id) {
      const ok = await confirm({
        title: `Remove field "${f.label}"?`,
        message: 'Existing product values for this field will no longer be shown. Save to apply.',
        confirmLabel: 'Remove field',
      });
      if (!ok) return;
    }
    setFields((list) => list.filter((_, i) => i !== index));
    setDirty(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    const body = {
      ...details,
      fields: fields.map((f, order) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        options: f.options,
        required: f.required,
        helpText: f.helpText,
        order,
      })),
    };
    const res = await api(`/api/categories/${id}`, { method: 'PATCH', body });
    setSaving(false);
    if (!res.ok) return setSaveError(res.error);
    apply(res.data.category);
    toast('Category saved', 'success');
  };

  const toggleActive = async () => {
    const res = await api(`/api/categories/${id}`, { method: 'PATCH', body: { isActive: !category.isActive } });
    if (!res.ok) return toast(res.error, 'error');
    setCategory(res.data.category);
    toast(res.data.category.isActive ? 'Category reactivated' : 'Category deactivated', 'success');
  };

  const remove = async () => {
    const ok = await confirm({ title: `Delete category "${category.name}"?`, message: 'Only categories with no products can be deleted.', confirmLabel: 'Delete category' });
    if (!ok) return;
    const res = await api(`/api/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast(res.error, 'error');
    toast('Category deleted', 'success');
    router.push('/categories');
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!category) return <Loading />;

  const previewFields = fields
    .filter((f) => f.label.trim())
    .map((f) => ({ ...f, id: rowId(f), key: f.key || rowId(f), options: String(f.options).split(',').map((o) => o.trim()).filter(Boolean) }));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <Link href="/categories">Categories</Link> / {category.name}
          </div>
          <h1>{category.name}</h1>
          <p>
            {category.productCount} product(s) · {category.isActive ? 'Active' : 'Inactive'}
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={toggleActive}>
            {category.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
          {category.productCount === 0 && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              Delete
            </button>
          )}
        </div>
      </div>

      <form onSubmit={save}>
        {saveError && <div className="alert alert-error" role="alert">{saveError}</div>}
        <div className="card">
          <h2>Details</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="c-name">Name<span className="req" aria-hidden="true">*</span></label>
              <input
                id="c-name"
                type="text"
                required
                maxLength={100}
                value={details.name}
                onChange={(e) => {
                  setDetails((d) => ({ ...d, name: e.target.value }));
                  setDirty(true);
                }}
              />
            </div>
            <div className="field span-all">
              <label htmlFor="c-desc">Description</label>
              <textarea
                id="c-desc"
                rows={2}
                maxLength={1000}
                value={details.description}
                onChange={(e) => {
                  setDetails((d) => ({ ...d, description: e.target.value }));
                  setDirty(true);
                }}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Custom fields ({fields.length})</h2>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setFields((list) => [...list, newField()]);
                setDirty(true);
              }}
            >
              + Add field
            </button>
          </div>
          {fields.length === 0 && <p className="muted">No custom fields yet. Add fields such as size, fabric, compatible model…</p>}
          {fields.map((f, index) => {
            const rid = rowId(f);
            return (
              <div key={rid} className="field-row">
                <div>
                  <label htmlFor={`fl-${rid}`}>Label<span className="req" aria-hidden="true">*</span></label>
                  <input id={`fl-${rid}`} type="text" required maxLength={80} value={f.label} onChange={(e) => updateField(index, { label: e.target.value })} placeholder="e.g. Compatible phone model" />
                  <label htmlFor={`fk-${rid}`} className="mt-1">Field name (key)</label>
                  <input id={`fk-${rid}`} type="text" maxLength={60} value={f.key} onChange={(e) => updateField(index, { key: e.target.value })} placeholder="auto from label" className="mono" />
                  <div className="hint">Renaming moves existing product values to the new name.</div>
                </div>
                <div>
                  <label htmlFor={`ft-${rid}`}>Type</label>
                  <select id={`ft-${rid}`} value={f.type} onChange={(e) => updateField(index, { type: e.target.value })}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  {f.type === 'dropdown' && (
                    <>
                      <label htmlFor={`fo-${rid}`} className="mt-1">Options<span className="req" aria-hidden="true">*</span></label>
                      <input id={`fo-${rid}`} type="text" required value={f.options} onChange={(e) => updateField(index, { options: e.target.value })} placeholder="Comma separated, e.g. S, M, L" />
                    </>
                  )}
                  <label htmlFor={`fh-${rid}`} className="mt-1">Help text</label>
                  <input id={`fh-${rid}`} type="text" maxLength={200} value={f.helpText} onChange={(e) => updateField(index, { helpText: e.target.value })} />
                </div>
                <div>
                  <span className="sr-only">Options for field {index + 1}</span>
                  <label className="checkbox" style={{ marginTop: '1.6rem' }}>
                    <input type="checkbox" checked={f.required} onChange={(e) => updateField(index, { required: e.target.checked })} />
                    Required
                  </label>
                  <div className="small muted">Position {index + 1}</div>
                </div>
                <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <button type="button" className="btn btn-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${f.label || 'field'} up`}>
                    ↑ Up
                  </button>
                  <button type="button" className="btn btn-sm" disabled={index === fields.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${f.label || 'field'} down`}>
                    ↓ Down
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeField(index)}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <div className="form-actions">
            {dirty && <span className="small muted" style={{ alignSelf: 'center' }}>Unsaved changes</span>}
            <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save category'}
            </button>
          </div>
        </div>
      </form>

      {previewFields.length > 0 && (
        <div className="card">
          <h2>Form preview</h2>
          <p className="small muted">This is how the fields appear when adding a {details.name || 'product'}.</p>
          <fieldset disabled style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-grid">
              {previewFields.map((f) => (
                <CustomFieldInput key={f.id} field={{ ...f, key: `preview-${f.id}` }} value={undefined} onChange={() => {}} />
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </>
  );
}
