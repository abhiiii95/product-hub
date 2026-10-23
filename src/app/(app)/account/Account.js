'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCurrentUser } from '@/components/AppShell';
import { useToast } from '@/components/Feedback';
import { api } from '@/lib/client';
import { ROLE_LABELS } from '@/lib/constants';

export default function Account() {
  const user = useCurrentUser();
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get('newPassword') !== form.get('confirmPassword')) {
      setError('New passwords do not match');
      return;
    }
    setSaving(true);
    setError('');
    const res = await api('/api/auth/password', {
      method: 'POST',
      body: { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') },
    });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    e.target.reset();
    toast('Password changed. Other sessions were signed out.', 'success');
    router.refresh();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Account Settings</h1>
          <p>Your profile details are managed by the Admin.</p>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <h2>Profile</h2>
          <dl className="kv">
            <dt>Name</dt>
            <dd>{user.name}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Role</dt>
            <dd>{ROLE_LABELS[user.role]}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Change password</h2>
          {user.mustChangePassword && <div className="alert alert-warning">Please replace the temporary password you were given.</div>}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="currentPassword">Current password</label>
              <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
            </div>
            <div className="field">
              <label htmlFor="newPassword">New password</label>
              <input id="newPassword" name="newPassword" type="password" required minLength={8} maxLength={200} autoComplete="new-password" />
              <div className="hint">At least 8 characters.</div>
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirm new password</label>
              <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} maxLength={200} autoComplete="new-password" />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
