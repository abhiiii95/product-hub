'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/components/AppShell';
import { Loading, ErrorState, useConfirm, useToast } from '@/components/Feedback';
import { api, formatDate } from '@/lib/client';
import { ROLE_LABELS } from '@/lib/constants';

function UserForm({ user, onSaved, onCancel }) {
  const toast = useToast();
  const isEdit = Boolean(user);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = { name: form.get('name'), email: form.get('email'), role: form.get('role') };
    if (!isEdit) body.password = form.get('password');
    setSaving(true);
    setError('');
    const res = await api(isEdit ? `/api/users/${user.id}` : '/api/users', { method: isEdit ? 'PATCH' : 'POST', body });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast(isEdit ? 'User updated' : `Account created for ${res.data.user.name}. Share the temporary password with them securely.`, 'success');
    if (!isEdit) e.target.reset();
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
        </div>
        <div className="field">
          <label htmlFor={`${p}-email`}>Email<span className="req" aria-hidden="true">*</span></label>
          <input id={`${p}-email`} name="email" type="email" required maxLength={254} defaultValue={user?.email} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${p}-role`}>Role</label>
          <select id={`${p}-role`} name="role" defaultValue={user?.role || 'listing_user'}>
            <option value="listing_user">Listing User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {!isEdit && (
          <div className="field">
            <label htmlFor="new-password">Temporary password<span className="req" aria-hidden="true">*</span></label>
            <input id="new-password" name="password" type="text" required minLength={8} maxLength={200} autoComplete="new-password" />
            <div className="hint">At least 8 characters. They will be asked to change it.</div>
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
          <p>Only the Admin can create accounts. There is no public sign-up.</p>
        </div>
      </div>
      <div className="card">
        <h2>Create account</h2>
        <UserForm onSaved={replace} />
      </div>
      <div className="card">
        <h2>Accounts</h2>
        {error && <ErrorState message={error} onRetry={load} />}
        {!users && !error && <Loading />}
        {users && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
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
                      <td>
                        <strong>{u.name}</strong>
                        {self && <span className="badge" style={{ marginLeft: 6 }}>You</span>}
                        <div className="small muted">{u.email}</div>
                      </td>
                      <td>{ROLE_LABELS[u.role]}</td>
                      <td>
                        {u.isActive ? <span className="badge badge-success">Active</span> : <span className="badge badge-danger">Deactivated</span>}
                        {u.mustChangePassword && <div className="small muted">Temporary password</div>}
                      </td>
                      <td className="small nowrap">{formatDate(u.createdAt)}</td>
                      <td className="small nowrap">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</td>
                      <td className="right nowrap">
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
                        <td colSpan={6} style={{ background: 'var(--surface-2)' }}>
                          {panel.mode === 'edit' ? (
                            <UserForm user={u} onSaved={replace} onCancel={() => setPanel({ id: null })} />
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
