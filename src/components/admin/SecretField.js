'use client';

import { useState } from 'react';
import CopyButton from '@/components/CopyButton';

// A secret (temporary password) shown masked, with Show/Hide and Copy buttons.
export default function SecretField({ value, what = 'temporary password' }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="muted">—</span>;
  return (
    <span className="secret-field">
      <code className="mono secret-value" aria-label={shown ? what : `${what} hidden`}>
        {shown ? value : '••••••••'}
      </code>
      <button type="button" className="btn btn-sm" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
        {shown ? 'Hide' : 'Show'}
      </button>
      <CopyButton text={value} what={what} />
    </span>
  );
}
