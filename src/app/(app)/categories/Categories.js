'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Loading, Empty, ErrorState, useToast } from '@/components/Feedback';
import { api } from '@/lib/client';

export default function Categories() {
  const router = useRouter();
  const toast = useToast();
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const res = await api('/api/categories');
    if (res.ok) setCategories(res.data.categories);
    else setError(res.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(true);
    setFormError('');
    const res = await api('/api/categories', { method: 'POST', body: { name: form.get('name'), description: form.get('description') } });
    setSaving(false);
    if (!res.ok) return setFormError(res.error);
    toast('Category created. Now add its fields.', 'success');
    router.push(`/categories/${res.data.category.id}`);
  };

  const toggle = async (category) => {
    const res = await api(`/api/categories/${category.id}`, { method: 'PATCH', body: { isActive: !category.isActive } });
    if (!res.ok) return toast(res.error, 'error');
    toast(`Category ${res.data.category.isActive ? 'reactivated' : 'deactivated'}`, 'success');
    setCategories((list) => list.map((c) => (c.id === category.id ? res.data.category : c)));
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Categories &amp; Fields</h1>
          <p>Each category has its own custom fields that appear on the product form.</p>
        </div>
      </div>
      <div className="detail-layout" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <div>
          {error && <ErrorState message={error} onRetry={load} />}
          {!categories && !error && <Loading />}
          {categories && categories.length === 0 && <Empty title="No categories yet">Create your first category using the form.</Empty>}
          {categories && categories.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Fields</th>
                    <th className="num">Products</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/categories/${c.id}`}>
                          <strong>{c.name}</strong>
                        </Link>
                        {c.description && <div className="small muted">{c.description}</div>}
                      </td>
                      <td className="num">{c.fields.length}</td>
                      <td className="num">
                        <Link href={`/products?category=${c.id}`}>{c.productCount}</Link>
                      </td>
                      <td>{c.isActive ? <span className="badge badge-success">Active</span> : <span className="badge">Inactive</span>}</td>
                      <td className="right nowrap">
                        <Link className="btn btn-sm" href={`/categories/${c.id}`}>
                          Configure fields
                        </Link>{' '}
                        <button type="button" className="btn btn-sm" onClick={() => toggle(c)}>
                          {c.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <h2>New category</h2>
          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          <form onSubmit={create}>
            <div className="field">
              <label htmlFor="cat-name">Name<span className="req" aria-hidden="true">*</span></label>
              <input id="cat-name" name="name" type="text" required maxLength={100} placeholder="e.g. Mobile Covers" />
            </div>
            <div className="field">
              <label htmlFor="cat-desc">Description</label>
              <textarea id="cat-desc" name="description" rows={2} maxLength={1000} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create category'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
