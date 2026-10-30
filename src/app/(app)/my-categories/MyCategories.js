'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Loading, Empty, ErrorState, useConfirm, useToast } from '@/components/Feedback';
import { api, formatDate } from '@/lib/client';
import { SITE } from '@/lib/site';

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

export default function MyCategories() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await api('/api/my-categories');
    if (!res.ok) return setError(res.error);
    setData(res.data);
    setPicked(res.data.selfCategoryIds);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const header = (
    <div className="page-header">
      <div>
        <h1>My Categories</h1>
        <p>Jo categories aapke paas hain, unke products catalog mein dikhte hain.</p>
      </div>
      <Link className="btn" href="/products">
        Product catalog →
      </Link>
    </div>
  );

  if (error) {
    return (
      <>
        {header}
        <ErrorState message={error} onRetry={load} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {header}
        <Loading label="Loading categories…" />
      </>
    );
  }

  const nameOf = Object.fromEntries(data.categories.map((c) => [c.id, c]));

  if (data.all) {
    return (
      <>
        {header}
        <div className="card">
          <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
            <strong>Aapke paas saari categories hain.</strong> Kuch chunne ki zaroorat nahi.
          </div>
          {data.categories.length === 0 ? (
            <Empty title="Abhi koi category nahi hai" />
          ) : (
            <ul className="rs-cat-list">
              {data.categories.map((c) => (
                <li key={c.id} className="rs-cat-item">
                  <Link href={`/products?category=${c.id}`}>{c.name}</Link>
                  <span className="small muted">{c.productCount} products</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  const adminIds = data.adminCategoryIds.filter((id) => nameOf[id]);
  const choices = data.categories.filter((c) => !adminIds.includes(c.id));
  const lockedUntil = data.canChangeAt && new Date(data.canChangeAt) > new Date() ? data.canChangeAt : null;
  const canPick = data.limit > 0;
  const changed = !sameSet(picked, data.selfCategoryIds);
  const full = picked.length >= data.limit;
  const nothingYet = adminIds.length === 0 && data.selfCategoryIds.length === 0;

  const toggle = (id) => {
    setSaveError('');
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= data.limit ? list : [...list, id]));
  };

  const save = async () => {
    const ok = await confirm({
      title: 'Ye categories save karein?',
      message: 'Save karne ke baad 7 din tak badal nahi paoge.',
      confirmLabel: 'Save categories',
      danger: false,
    });
    if (!ok) return;
    setSaving(true);
    setSaveError('');
    const res = await api('/api/my-categories', { method: 'PUT', body: { categoryIds: picked } });
    setSaving(false);
    if (!res.ok) {
      const until = res.data?.details?.code === 'change_too_soon' && res.data.details.canChangeAt;
      setSaveError(until ? `Aap ${formatDate(until, false)} ke baad hi categories badal paoge.` : res.error);
      return;
    }
    toast('Categories save ho gayi', 'success');
    await load();
    // The app shell reads the access summary on the server; refresh it.
    router.refresh();
  };

  return (
    <>
      {header}

      {nothingYet && canPick && (
        <div className="alert alert-warning">
          <strong>Pehle apni categories chuno.</strong> Inhi categories ke products aapke catalog mein dikhenge.
        </div>
      )}

      {adminIds.length > 0 && (
        <div className="card">
          <h2>Admin ne di</h2>
          <p className="small muted">Ye categories admin ne aapko di hain. Ye aapki limit mein count nahi hoti.</p>
          <ul className="rs-cat-list">
            {adminIds.map((id) => (
              <li key={id} className="rs-cat-item is-locked">
                <span>
                  <span aria-hidden="true">🔒 </span>
                  {nameOf[id].name}
                </span>
                <span className="small muted">{nameOf[id].productCount} products</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!canPick && (
        <div className="card">
          <h2>Aur categories chahiye?</h2>
          <p>Aapke abhi ke plan mein khud categories chunne ka option nahi hai.</p>
          <ul className="rs-help-list">
            <li>
              Admin se baat karo: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            </li>
            <li>
              Ya <strong>Pro plan</strong> lo, usme saari categories milti hain.
            </li>
          </ul>
          <Link className="btn btn-primary" href="/renew?plan=m3">
            Pro plan dekho
          </Link>
        </div>
      )}

      {canPick && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Apni categories chuno</h2>
              <div className="small muted">
                Aap {data.limit} categories tak chun sakte ho. Chuni: {picked.length} / {data.limit}
              </div>
            </div>
          </div>

          {lockedUntil && (
            <div className="alert alert-info">
              Aapne haal hi mein categories badli hain. Agla badlav <strong>{formatDate(lockedUntil, false)}</strong> ke baad kar paoge.
            </div>
          )}

          {choices.length === 0 ? (
            <Empty title="Abhi chunne ke liye koi category nahi hai" />
          ) : (
            <fieldset className="rs-cat-fieldset" disabled={Boolean(lockedUntil) || saving}>
              <legend className="sr-only">Categories</legend>
              <ul className="rs-cat-list">
                {choices.map((c) => {
                  const checked = picked.includes(c.id);
                  const blocked = !checked && full;
                  return (
                    <li key={c.id} className={`rs-cat-item${checked ? ' is-checked' : ''}${blocked ? ' is-disabled' : ''}`}>
                      <label className="checkbox" htmlFor={`cat-${c.id}`}>
                        <input id={`cat-${c.id}`} type="checkbox" checked={checked} disabled={blocked} onChange={() => toggle(c.id)} />
                        {c.name}
                      </label>
                      <span className="small muted">{c.productCount} products</span>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}

          {full && !lockedUntil && <p className="small muted">Limit poori ho gayi. Doosri category chunne ke liye pehle ek hatao.</p>}
          {saveError && (
            <div className="alert alert-error" role="alert">
              {saveError}
            </div>
          )}

          <div className="form-actions">
            {changed && !lockedUntil && (
              <button type="button" className="btn" onClick={() => setPicked(data.selfCategoryIds)} disabled={saving}>
                Reset
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={!changed || Boolean(lockedUntil) || saving}>
              {saving ? 'Saving…' : 'Save categories'}
            </button>
          </div>
          <p className="small muted">
            Save karne ke baad 7 din tak badal nahi paoge. Saari categories chahiye? <Link href="/renew?plan=m3">Pro plan lo</Link>.
          </p>
        </div>
      )}
    </>
  );
}
