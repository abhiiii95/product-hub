'use client';

import { useState } from 'react';
import { api } from '@/lib/client';

// redirectTo: where to go after logging out (only same-site paths).
export default function LogoutButton({ redirectTo = '/login' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const logout = async () => {
    setBusy(true);
    setError('');
    const res = await api('/api/auth/logout', { method: 'POST' });
    if (!res.ok) {
      setBusy(false);
      setError(res.error || 'Logout nahi ho paaya. Dobara try karo.');
      return;
    }
    window.location.href = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/login';
  };

  return (
    <>
      <button type="button" className="btn" onClick={logout} disabled={busy}>
        {busy ? 'Logging out…' : 'Logout'}
      </button>
      {error && <span className="error-text small" role="alert">{error}</span>}
    </>
  );
}
