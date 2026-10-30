'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { SITE } from '@/lib/site';

const POLL_MS = 3000;
const POLL_LIMIT_MS = 2 * 60 * 1000;

function normalizeStatus(value) {
  if (value === 'fulfilled') return 'fulfilled';
  if (value === 'failed') return 'failed';
  return 'pending';
}

export default function StatusClient({ orderId }) {
  const [status, setStatus] = useState('pending');
  const [needsReview, setNeedsReview] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [phase, setPhase] = useState('checking'); // checking | waiting | timeout | notfound
  const [error, setError] = useState('');
  const [round, setRound] = useState(0); // bump to restart polling
  const [mockBusy, setMockBusy] = useState(false);
  const [mockError, setMockError] = useState('');
  const doneRef = useRef(false);

  const isMock = orderId.startsWith('mock_');

  const apply = useCallback((data) => {
    const next = normalizeStatus(data?.status);
    if (data?.maskedEmail) setMaskedEmail(data.maskedEmail);
    setStatus(next);
    // Paid, but the owner finishes it by hand: stop polling.
    if (next === 'pending' && data?.needsReview) {
      setNeedsReview(true);
      doneRef.current = true;
    }
    if (next !== 'pending') doneRef.current = true;
    return next;
  }, []);

  useEffect(() => {
    doneRef.current = false;
    let cancelled = false;
    let timer;
    const started = Date.now();

    const tick = async () => {
      const res = await api(`/api/checkout/status?order=${encodeURIComponent(orderId)}`);
      if (cancelled) return;
      if (res.ok) {
        setError('');
        const next = apply(res.data);
        if (next !== 'pending') return;
        setPhase('waiting');
      } else if (res.status === 404 || res.status === 400) {
        setPhase('notfound');
        return;
      } else {
        // Temporary problem (network, 429, 5xx): keep trying until the time limit.
        setError(res.status === 429 ? 'Bahut zyada requests. Thoda ruk kar dobara check karenge…' : 'Status check nahi ho paaya, dobara try kar rahe hain…');
      }
      if (doneRef.current) return;
      if (Date.now() - started >= POLL_LIMIT_MS) {
        setPhase('timeout');
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId, round, apply]);

  const simulate = async (outcome) => {
    setMockBusy(true);
    setMockError('');
    const res = await api('/api/checkout/mock-complete', { method: 'POST', body: { orderId, outcome } });
    setMockBusy(false);
    if (!res.ok) {
      setMockError(res.error || 'Simulation failed');
      return;
    }
    if (apply(res.data) === 'pending') setRound((r) => r + 1);
  };

  const checkAgain = () => {
    setPhase('checking');
    setRound((r) => r + 1);
  };

  return (
    <div className="stack">
      {isMock && status === 'pending' && !needsReview && (
        <section className="pub-testmode" aria-labelledby="testmode-title">
          <h2 id="testmode-title">TEST MODE</h2>
          <p className="small">
            Yeh test order hai (koi asli payment nahi). Neeche se payment ka result simulate karo.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={mockBusy} onClick={() => simulate('paid')}>
              Simulate payment success
            </button>
            <button type="button" className="btn btn-danger" disabled={mockBusy} onClick={() => simulate('failed')}>
              Simulate failure
            </button>
          </div>
          {mockError && <p className="error-text small" role="alert">{mockError}</p>}
        </section>
      )}

      <div className="card pub-status" aria-live="polite">
        {status === 'fulfilled' && (
          <>
            <div className="pub-status-icon ok" aria-hidden="true">✓</div>
            <h1>Payment ho gaya!</h1>
            <p>
              Login details aapki email{maskedEmail ? <> (<strong>{maskedEmail}</strong>)</> : null} par bheji gayi hain. 15 minute
              mein na mile to <a href={`mailto:${SITE.email}`}>{SITE.email}</a> par likho.
            </p>
            <p className="muted small">Spam / Promotions folder bhi check kar lena.</p>
            <Link className="btn btn-primary" href="/login">Login karo</Link>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="pub-status-icon bad" aria-hidden="true">!</div>
            <h1>Payment nahi hua</h1>
            <p>
              Payment fail ho gaya. Agar paise kat gaye hain to woh apne aap wapas aa jaayenge. Aap dobara try kar sakte ho.
            </p>
            <div className="row">
              <Link className="btn btn-primary" href="/buy">Dobara try karo</Link>
              <a className="btn" href={`mailto:${SITE.email}`}>Help</a>
            </div>
          </>
        )}

        {status === 'pending' && needsReview && (
          <>
            <div className="pub-status-icon ok" aria-hidden="true">✓</div>
            <h1>Payment mil gaya</h1>
            <p>
              Aapka payment aa gaya hai, bas ek manual check baaki hai. Login details jaldi aapki email
              {maskedEmail ? <> (<strong>{maskedEmail}</strong>)</> : null} par aa jaayengi. Koi sawal ho to{' '}
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a> par likho.
            </p>
          </>
        )}

        {status === 'pending' && !needsReview && phase === 'notfound' && (
          <>
            <h1>Order nahi mila</h1>
            <p className="muted">Yeh order ID sahi nahi lag raha. Plans page se dobara shuru karo.</p>
            <Link className="btn btn-primary" href="/#plans">Plans dekho</Link>
          </>
        )}

        {status === 'pending' && !needsReview && phase === 'timeout' && (
          <>
            <h1>Abhi confirm nahi hua</h1>
            <p>
              Payment confirm hone mein time lag raha hai. Agar paise kat gaye hain to chinta mat karo: confirm hote hi login
              details email par aa jaayengi. 15 minute mein na aaye to <a href={`mailto:${SITE.email}`}>{SITE.email}</a> par
              likho.
            </p>
            <button type="button" className="btn btn-primary" onClick={checkAgain}>Dobara check karo</button>
          </>
        )}

        {status === 'pending' && !needsReview && (phase === 'checking' || phase === 'waiting') && (
          <div role="status">
            <div className="spinner" aria-hidden="true" />
            <h1>Payment confirm ho raha hai…</h1>
            <p className="muted">Is page ko band mat karo. Isme 1-2 minute lag sakte hain.</p>
          </div>
        )}

        {error && status === 'pending' && phase !== 'timeout' && phase !== 'notfound' && <p className="muted small">{error}</p>}
        <p className="muted small pub-order-ref">Order: <span className="mono">{orderId}</span></p>
      </div>
    </div>
  );
}
