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
        setError(res.status === 429 ? 'Too many requests. Checking again shortly…' : 'Could not check the status. Trying again…');
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
          <h2 id="testmode-title">Test mode</h2>
          <p className="small">
            This is a test order and no real payment is taken. Use the buttons below to simulate the payment result.
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
            <h1>Payment successful</h1>
            <p>
              Your login details have been sent to your email{maskedEmail ? <> (<strong>{maskedEmail}</strong>)</> : null}. If they
              do not arrive within 15 minutes, write to <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
            </p>
            <p className="muted small">Please also check your Spam and Promotions folders.</p>
            <Link className="btn btn-primary" href="/login">Sign in</Link>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="pub-status-icon bad" aria-hidden="true">!</div>
            <h1>Payment not completed</h1>
            <p>
              The payment failed. If money was deducted, it will be refunded automatically. You can try again.
            </p>
            <div className="row">
              <Link className="btn btn-primary" href="/buy">Try again</Link>
              <a className="btn" href={`mailto:${SITE.email}`}>Help</a>
            </div>
          </>
        )}

        {status === 'pending' && needsReview && (
          <>
            <div className="pub-status-icon ok" aria-hidden="true">✓</div>
            <h1>Payment received</h1>
            <p>
              We have received your payment and it needs a quick manual check. Your login details will be sent to your email
              {maskedEmail ? <> (<strong>{maskedEmail}</strong>)</> : null} shortly. If you have any questions, write to{' '}
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
            </p>
          </>
        )}

        {status === 'pending' && !needsReview && phase === 'notfound' && (
          <>
            <h1>Order not found</h1>
            <p className="muted">This order ID does not look right. Please start again from the plans page.</p>
            <Link className="btn btn-primary" href="/#plans">View plans</Link>
          </>
        )}

        {status === 'pending' && !needsReview && phase === 'timeout' && (
          <>
            <h1>Not confirmed yet</h1>
            <p>
              Confirming your payment is taking longer than usual. If money was deducted, there is no need to worry: your login
              details will be emailed as soon as the payment is confirmed. If they do not arrive within 15 minutes, write
              to <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
            </p>
            <button type="button" className="btn btn-primary" onClick={checkAgain}>Check again</button>
          </>
        )}

        {status === 'pending' && !needsReview && (phase === 'checking' || phase === 'waiting') && (
          <div role="status">
            <div className="spinner" aria-hidden="true" />
            <h1>Confirming your payment…</h1>
            <p className="muted">Please keep this page open. This can take 1 to 2 minutes.</p>
          </div>
        )}

        {error && status === 'pending' && phase !== 'timeout' && phase !== 'notfound' && <p className="muted small">{error}</p>}
        <p className="muted small pub-order-ref">Order: <span className="mono">{orderId}</span></p>
      </div>
    </div>
  );
}
