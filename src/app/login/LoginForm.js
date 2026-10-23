'use client';

import { useState } from 'react';
import { api } from '@/lib/client';

export default function LoginForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: form.get('email'), password: form.get('password') },
    });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // Full navigation so the server layout picks up the new session cookie.
    window.location.href = '/dashboard';
  };

  return (
    <form onSubmit={onSubmit} noValidate={false}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
