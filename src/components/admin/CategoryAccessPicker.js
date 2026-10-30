'use client';

import { ErrorState, Loading } from '@/components/Feedback';

// "All categories" or a checklist of chosen categories.
// value: { mode: 'all' | 'selected' | 'plan', ids: string[] }.
// `allowPlan` adds a third choice, "As per plan" (no extra access), used by coupons.
export default function CategoryAccessPicker({
  idPrefix,
  legend = 'Category access',
  categories,
  loadError,
  onRetry,
  value,
  onChange,
  allowPlan = false,
  hint,
  error,
  disabled = false,
}) {
  const ids = value.ids || [];
  const setMode = (mode) => onChange({ mode, ids });
  const toggle = (id) => onChange({ mode: value.mode, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  const known = new Set((categories || []).map((c) => c.id));
  // Show active categories, plus any inactive one that is already ticked.
  const shown = (categories || []).filter((c) => c.isActive || ids.includes(c.id));
  const missing = ids.filter((id) => categories && !known.has(id));

  return (
    <fieldset className="access-picker" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="row access-modes" role="radiogroup" aria-label={legend}>
        {allowPlan && (
          <label className="checkbox">
            <input type="radio" name={`${idPrefix}-mode`} checked={value.mode === 'plan'} onChange={() => setMode('plan')} />
            As per plan
          </label>
        )}
        <label className="checkbox">
          <input type="radio" name={`${idPrefix}-mode`} checked={value.mode === 'all'} onChange={() => setMode('all')} />
          All categories
        </label>
        <label className="checkbox">
          <input type="radio" name={`${idPrefix}-mode`} checked={value.mode === 'selected'} onChange={() => setMode('selected')} />
          Chosen categories
        </label>
      </div>
      {hint && <p className="small muted access-hint">{hint}</p>}
      {value.mode === 'selected' && (
        <>
          {loadError && <ErrorState message={`Could not load categories: ${loadError}`} onRetry={onRetry} />}
          {!categories && !loadError && <Loading label="Loading categories…" />}
          {categories && shown.length === 0 && <p className="small muted">No categories yet. Create one under Categories &amp; Fields.</p>}
          {categories && shown.length > 0 && (
            <div className="check-list">
              {shown.map((c) => (
                <label key={c.id} className="checkbox" htmlFor={`${idPrefix}-cat-${c.id}`}>
                  <input id={`${idPrefix}-cat-${c.id}`} type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span className="truncate">
                    {c.name}
                    {!c.isActive && <span className="muted"> (inactive)</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {missing.length > 0 && <p className="small muted">{missing.length} deleted category(s) will be removed on save.</p>}
          <p className="small muted access-count">{ids.filter((id) => known.has(id)).length} selected</p>
        </>
      )}
      {error && <div className="error-text">{error}</div>}
    </fieldset>
  );
}

// Only ids of categories that still exist (the API rejects unknown ones).
export function knownIds(ids, categories) {
  if (!categories) return ids || [];
  const known = new Set(categories.map((c) => c.id));
  return (ids || []).filter((id) => known.has(id));
}

// Converts the picker value into the users API fields. The ticked ids are kept in
// "all" mode too, so switching back to "chosen" later restores them.
export function toAdminAccess(value, categories) {
  return { adminMode: value.mode === 'all' ? 'all' : 'selected', adminCategoryIds: knownIds(value.ids, categories) };
}
