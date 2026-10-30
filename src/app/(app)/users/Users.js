'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/components/AppShell';
import { Loading, ErrorState, useConfirm, useToast } from '@/components/Feedback';
import { api, formatDate } from '@/lib/client';
import { ROLES } from '@/lib/constants';
import { roleLabel } from '@/components/AppShell';
import CategoryAccessPicker, { toAdminAccess } from '@/components/admin/CategoryAccessPicker';
import useCategories from '@/components/admin/useCategories';
import { fieldErrors, planStatus, shortDate } from '@/components/admin/format';

function sameIds(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function UserForm({ user, cats, onSaved, onCancel }) {
  const toast = useToast();
  const isEdit = Boolean(user);
  const [role, setRole] = useState(user?.role || ROLES.LISTING_USER);
  const initialAccess = {
    mode: user?.categoryAccess?.adminMode === 'all' ? 'all' : 'selected',
    ids: user?.categoryAccess?.adminCategoryIds || [],
  };
  const [access, setAccess] = useState(initialAccess);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const reseller = role === ROLES.LISTING_USER;

  const submit = async (e) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const body = { name: form.get('name'), email: form.get('email'), role, phone: String(form.get('phone') || '').trim() };
    if (!isEdit) body.password = form.get('password');
    if (!isEdit && !body.phone) delete body.phone;
    if (reseller) {
      const compDays = String(form.get('compDays') || '').trim();
      if (compDays) body.compDays = Number(compDays);
      const next = toAdminAccess(access, cats.categories);
      // On edit, only send access when it changed (each save is logged).
      const before = toAdminAccess(initialAccess, cats.categories);
      if (!isEdit || next.adminMode !== before.adminMode || !sameIds(next.adminCategoryIds, before.adminCategoryIds)) Object.assign(body, next);
    }
    setSaving(true);
    setError('');
    setErrors({});
    const res = await api(isEdit ? `/api/users/${user.id}` : '/api/users', { method: isEdit ? 'PATCH' : 'POST', body });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return setErrors(fieldErrors(res));
    }
    toast(isEdit ? 'User updated' : `Account created for ${res.data.user.name}. Share the temporary password with them securely.`, 'success');
    if (!isEdit) {
      formEl.reset();
      setRole(ROLES.LISTING_USER);
      setAccess({ mode: 'selected', ids: [] });
    }
    onSaved(res.data.user);
  };

  const p = isEdit ? `edit-${user.id}` : 'new';
  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${p}-name`}>Name<span className="req" aria-hidden="true">*</span></label>
          <input id={`${p}-name`} name="name" type="text" required maxLength={100} defaultValue={user?.name} />
          {errors.name && <div className="error-text">{errors.name}</div>}
        </div>
        <div className="field">
          <label htmlFor={`${p}-email`}>Email<span className="req" aria-hidden="true">*</span></label>
          <input id={`${p}-email`} name="email" type="email" required maxLength={254} defaultValue={user?.email} autoComplete="off" />
          {errors.email && <div className="error-text">{errors.email}</div>}
        </div>
        <div className="field">
          <label htmlFor={`${p}-phone`}>Phone</label>
          <input id={`${p}-phone`} name="phone" type="text" inputMode="tel" maxLength={20} defaultValue={user?.phone || ''} autoComplete="off" aria-invalid={errors.phone ? 'true' : undefined} />
          <div className="hint">10-digit mobile number</div>
          {errors.phone && <div className="error-text">{errors.phone}</div>}
        </div>
        <div className="field">
          <label htmlFor={`${p}-role`}>Role</label>
          <select id={`${p}-role`} name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value={ROLES.LISTING_USER}>Reseller</option>
            <option value={ROLES.ADMIN}>Admin</option>
          </select>
        </div>
        {!isEdit && (
          <div className="field">
            <label htmlFor="new-password">Temporary password<span className="req" aria-hidden="true">*</span></label>
            <input id="new-password" name="password" type="text" required minLength={8} maxLength={200} autoComplete="new-password" />
            <div className="hint">At least 8 characters. They will be asked to change it.</div>
            {errors.password && <div className="error-text">{errors.password}</div>}
          </div>
        )}
        {reseller && (
          <div className="field">
            <label htmlFor={`${p}-comp`}>Free days (comp)</label>
            <input id={`${p}-comp`} name="compDays" type="number" min={1} max={3650} step={1} aria-invalid={errors.compDays ? 'true' : undefined} />
            <div className="hint">
              {isEdit ? `These free days are added on top of the current plan${user.plan?.endsAt ? ` (now ends ${shortDate(user.plan.endsAt)})` : ''}.` : 'Leave empty for no plan; the reseller signs in and renews.'}
            </div>
            {errors.compDays && <div className="error-text">{errors.compDays}</div>}
          </div>
        )}
        {reseller && (
          <div className="span-all">
            <CategoryAccessPicker
              idPrefix={`${p}-access`}
              legend="Category access (admin grant)"
              categories={cats.categories}
              loadError={cats.error}
              onRetry={cats.reload}
              value={access}
              onChange={setAccess}
              error={errors.adminCategoryIds || errors.adminMode}
              hint="Categories the reseller chooses themselves are added on top of these."
            />
          </div>
        )}
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save user' : 'Create account'}
        </button>
      </div>
    </form>
  );
}

function PlanCell({ user }) {
  if (user.role !== ROLES.LISTING_USER) return <span className="muted">—</span>;
  const status = planStatus(user);
  return (
    <>
      <span className={status.className}>{status.label}</span>
      {(user.plan?.endsAt || user.planEndsAt) && <div className="small muted nowrap">till {shortDate(user.plan?.endsAt || user.planEndsAt)}</div>}
    </>
  );
}

function ResetPassword({ user, onDone }) {
  const toast = useToast();
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get('password');
    const res = await api(`/api/users/${user.id}`, { method: 'PATCH', body: { password } });
    if (!res.ok) return setError(res.error);
    toast(`Password reset for ${user.name}. They have been signed out.`, 'success');
    onDone(res.data.user);
  };
  return (
    <form onSubmit={submit} className="row" style={{ alignItems: 'flex-end' }}>
      {error && <div className="alert alert-error" style={{ width: '100%' }}>{error}</div>}
      <div style={{ flex: 1, minWidth: 200 }}>
        <label htmlFor={`reset-${user.id}`}>New temporary password</label>
        <input id={`reset-${user.id}`} name="password" type="text" required minLength={8} maxLength={200} autoComplete="new-password" />
      </div>
      <button type="submit" className="btn btn-primary">Reset password</button>
      <button type="button" className="btn" onClick={() => onDone()}>Cancel</button>
    </form>
  );
}

export default function Users() {
  const me = useCurrentUser();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState({ id: null, mode: null });
  const cats = useCategories();

  const load = useCallback(async () => {
    setError('');
    const res = await api('/api/users');
    if (res.ok) setUsers(res.data.users);
    else setError(res.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (u) => {
    if (u) setUsers((list) => (list.some((x) => x.id === u.id) ? list.map((x) => (x.id === u.id ? u : x)) : [...list, u]));
    setPanel({ id: null, mode: null });
  };

  const toggleActive = async (u) => {
    if (u.isActive) {
      const ok = await confirm({ title: `Deactivate ${u.name}?`, message: 'They will be signed out immediately and cannot log in until reactivated.', confirmLabel: 'Deactivate' });
      if (!ok) return;
    }
    const res = await api(`/api/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } });
    if (!res.ok) return toast(res.error, 'error');
    toast(`${u.name} ${res.data.user.isActive ? 'reactivated' : 'deactivated'}`, 'success');
    replace(res.data.user);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p>Admin accounts and resellers you add by hand. Buyers from the website appear here automatically.</p>
        </div>
      </div>
      <div className="card">
        <h2>Create account</h2>
        <UserForm cats={cats} onSaved={replace} />
      </div>
      <div className="card">
        <h2>Accounts</h2>
        {error && <ErrorState message={error} onRetry={load} />}
        {!users && !error && <Loading />}
        {users && (
          <div className="table-wrap stack-mobile">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Created</th>
                  <th>Last login</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === me.id;
                  const open = panel.id === u.id;
                  return [
                    <tr key={u.id}>
                      <td className="cell-main">
                        <strong>{u.name}</strong>
                        {self && <span className="badge" style={{ marginLeft: 6 }}>You</span>}
                        <div className="small muted break">{u.email}</div>
                        {u.phone && <div className="small muted">{u.phone}</div>}
                      </td>
                      <td data-label="Role">{roleLabel(u.role)}</td>
                      <td data-label="Status">
                        {u.isActive ? <span className="badge badge-success">Active</span> : <span className="badge badge-danger">Deactivated</span>}
                        {u.mustChangePassword && <div className="small muted">Temporary password</div>}
                      </td>
                      <td data-label="Plan">
                        <PlanCell user={u} />
                      </td>
                      <td data-label="Created" className="small nowrap">{formatDate(u.createdAt)}</td>
                      <td data-label="Last login" className="small nowrap">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</td>
                      <td className="right nowrap cell-actions">
                        <button type="button" className="btn btn-sm" onClick={() => setPanel(open && panel.mode === 'edit' ? { id: null } : { id: u.id, mode: 'edit' })}>
                          Edit
                        </button>{' '}
                        {!self && (
                          <>
                            <button type="button" className="btn btn-sm" onClick={() => setPanel(open && panel.mode === 'reset' ? { id: null } : { id: u.id, mode: 'reset' })}>
                              Reset password
                            </button>{' '}
                            <button type="button" className={u.isActive ? 'btn btn-sm btn-danger' : 'btn btn-sm'} onClick={() => toggleActive(u)}>
                              {u.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>,
                    open && (
                      <tr key={`${u.id}-panel`}>
                        <td className="cell-wide" colSpan={7} style={{ background: 'var(--surface-2)' }}>
                          {panel.mode === 'edit' ? (
                            <UserForm user={u} cats={cats} onSaved={replace} onCancel={() => setPanel({ id: null })} />
                          ) : (
                            <ResetPassword user={u} onDone={replace} />
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
