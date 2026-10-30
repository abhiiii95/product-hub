'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

// Blurred teaser of the reseller's catalog. Images come from our own server
// already blurred; the CSS blur is an extra layer.
export default function PreviewGrid() {
  const [state, setState] = useState({ loading: true, error: '', total: 0, cards: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    const res = await api('/api/preview');
    if (!res.ok) {
      setState({ loading: false, error: res.error || 'Preview load nahi hua.', total: 0, cards: [] });
      return;
    }
    const cards = Array.isArray(res.data?.cards) ? res.data.cards.filter((c) => typeof c?.token === 'string') : [];
    setState({ loading: false, error: '', total: Number(res.data?.total) || 0, cards });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) {
    return (
      <div className="pub-preview" aria-busy="true">
        <div className="state" role="status">
          <div className="spinner" aria-hidden="true" />
          Products load ho rahe hain…
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="alert alert-error" role="alert">
        <div className="row-between">
          <span>{state.error}</span>
          <button type="button" className="btn btn-sm" onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  if (state.total === 0 || state.cards.length === 0) {
    return <p className="muted">Naye products jaldi aa rahe hain. Plan renew karke sabse pehle dekho.</p>;
  }

  return (
    <div className="pub-preview">
      <ul className="pub-preview-grid" aria-hidden="true">
        {state.cards.map((card) => (
          <li key={card.token}>
            <img src={`/api/preview/image/${encodeURIComponent(card.token)}`} alt="" loading="lazy" width="160" height="160" />
          </li>
        ))}
      </ul>
      <div className="pub-preview-overlay">
        <strong>{state.total}+ products waiting</strong>
        <span>Renew karo aur sab dobara dekho</span>
      </div>
    </div>
  );
}
