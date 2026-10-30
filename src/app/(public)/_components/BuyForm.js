'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { formatRupees, SITE } from '@/lib/site';
// Pure module (no db), the same phone rules the checkout routes use.
import { normalizePhone } from '@/lib/users';

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUOTE_DEBOUNCE_MS = 800;

// While typing, keep only what a phone number can contain ("+91 98765-43210").
const cleanPhoneInput = (value) => String(value || '').replace(/[^\d+\s\-().]/g, '').slice(0, 20);

const quoteKey = (input) => [input.planCode, input.email.toLowerCase(), input.phone, input.couponCode || ''].join('|');

function waitText(seconds) {
  if (seconds < 60) {
    const s = Math.ceil(seconds);
    return `${s} ${s === 1 ? 'second' : 'seconds'}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function friendlyError(res, { lockEmail = false } = {}) {
  if (res.status === 429) {
    const wait = Number(res.data?.details?.retryAfter);
    return Number.isFinite(wait) && wait > 0
      ? `Too many attempts. Try again in ${waitText(wait)}.`
      : 'Too many attempts. Please try again in a few minutes.';
  }
  if (res.status === 0) return 'Check your internet connection and try again.';
  // Signed-in buyers can only buy for their own account; the server rejects any other email.
  if (lockEmail && res.status === 400 && /email/i.test(res.error || '')) {
    return 'This plan can only be added to the email of the account you are signed in with. To buy for someone else, sign out first.';
  }
  return res.error || 'Something went wrong. Please try again.';
}

function statusHref(data) {
  const url = typeof data?.statusUrl === 'string' && data.statusUrl.startsWith('/') && !data.statusUrl.startsWith('//') ? data.statusUrl : null;
  return url || `/buy/status?order=${encodeURIComponent(data?.orderId || '')}`;
}

/**
 * Checkout form shared by /buy and /renew.
 * plans: [{ code, name, days, paise }], offer: { planCode, paise, active } | null
 * prefill: { name, email, phone }, lockEmail: keep the signed-in email fixed (renewals and
 * signed-in resellers on /buy; the server returns 400 for any other email).
 */
export default function BuyForm({ plans, offer, initialPlan, prefill = {}, lockEmail = false }) {
  const router = useRouter();
  const startPlan = plans.some((p) => p.code === initialPlan) ? initialPlan : plans[0]?.code;

  const [planCode, setPlanCode] = useState(startPlan);
  const [name, setName] = useState(prefill.name || '');
  const [email, setEmail] = useState(prefill.email || '');
  const [phone, setPhone] = useState(normalizePhone(prefill.phone) || '');
  const [website, setWebsite] = useState(''); // honeypot
  const [fieldErrors, setFieldErrors] = useState({});

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponMsg, setCouponMsg] = useState(null); // { type, text }

  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const quoteSeq = useRef(0);
  const quoteTimer = useRef(null);
  const quotedKey = useRef(''); // inputs of the last quote sent, to skip repeats on blur

  const [categories, setCategories] = useState(null);
  const [catState, setCatState] = useState('idle'); // idle | loading | error
  const [picked, setPicked] = useState([]);

  const [rzpReady, setRzpReady] = useState(false);
  const [rzpFailed, setRzpFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const plan = plans.find((p) => p.code === planCode) || plans[0];
  const emailOk = EMAIL_RE.test(email.trim());
  const normalizedPhone = normalizePhone(phone) || '';
  const phoneOk = Boolean(normalizedPhone);
  // The quote API needs both a valid email and a valid phone.
  const canQuote = emailOk && phoneOk;

  // Sends one quote for exactly these inputs and returns it (or null).
  // Older responses are ignored if a newer request started.
  const runQuote = useCallback(async (input) => {
    const seq = ++quoteSeq.current;
    const key = quoteKey(input);
    quotedKey.current = key;
    setQuoteLoading(true);
    setQuoteError('');
    const res = await api('/api/checkout/quote', {
      method: 'POST',
      body: { planCode: input.planCode, email: input.email, phone: input.phone, couponCode: input.couponCode || undefined },
    });
    if (seq !== quoteSeq.current) return null;
    setQuoteLoading(false);
    if (!res.ok) {
      if (quotedKey.current === key) quotedKey.current = ''; // let the next blur retry
      setQuote(null);
      setQuoteError(friendlyError(res));
      return null;
    }
    setQuote(res.data);
    return res.data;
  }, []);

  const cancelScheduledQuote = useCallback(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = null;
  }, []);

  // Re-quote after a blur, a plan change or a coupon removal (not on every keystroke).
  // Overrides carry values that React state has not applied yet.
  const scheduleQuote = (overrides = {}) => {
    const input = { planCode, email: email.trim(), phone: normalizedPhone, couponCode: appliedCoupon, ...overrides };
    cancelScheduledQuote();
    if (!EMAIL_RE.test(input.email) || !input.phone) {
      quoteSeq.current++;
      quotedKey.current = '';
      setQuote(null);
      setQuoteLoading(false);
      return;
    }
    if (quoteKey(input) === quotedKey.current) return;
    quoteTimer.current = setTimeout(async () => {
      quoteTimer.current = null;
      const q = await runQuote(input);
      if (q && input.couponCode && !q.couponApplied) {
        setAppliedCoupon(null);
        setCouponMsg({ type: 'error', text: q.couponError || 'Coupon not valid for this purchase' });
      }
    }, QUOTE_DEBOUNCE_MS);
  };

  // One quote on open when the details are already filled in (signed-in buyers).
  useEffect(() => {
    scheduleQuote();
    return cancelScheduledQuote;
    // Mount only: later quotes come from blur, plan change and coupon actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Category checklist, only when the quote says this purchase picks categories.
  const pickEnabled = Boolean(quote?.pickCategories?.enabled);
  const pickMax = Number(quote?.pickCategories?.max) || 0;
  const loadCategories = useCallback(async () => {
    setCatState('loading');
    const res = await api('/api/checkout/categories');
    if (!res.ok) {
      setCatState('error');
      return;
    }
    const list = Array.isArray(res.data) ? res.data : res.data?.categories || [];
    setCategories(list);
    setCatState('idle');
  }, []);
  useEffect(() => {
    if (pickEnabled && categories === null && catState === 'idle') loadCategories();
  }, [pickEnabled, categories, catState, loadCategories]);
  useEffect(() => {
    if (pickMax > 0) setPicked((list) => list.slice(0, pickMax));
  }, [pickMax]);

  const togglePick = (id) => {
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= pickMax ? list : [...list, id]));
  };

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    setCouponMsg(null);
    if (!code) {
      setCouponMsg({ type: 'error', text: 'Enter a coupon code.' });
      return null;
    }
    if (!canQuote) {
      setCouponMsg({ type: 'error', text: 'Enter a valid email and mobile number before applying a coupon.' });
      return null;
    }
    // A button press: quote right away (a pending blur quote would be superseded anyway).
    cancelScheduledQuote();
    const q = await runQuote({ planCode, email: email.trim(), phone: normalizedPhone, couponCode: code });
    if (!q) return null;
    if (q.couponApplied) {
      setAppliedCoupon(code);
      setCouponInput(code);
      setCouponMsg({ type: 'success', text: `Coupon ${code} applied.` });
      return code;
    }
    setAppliedCoupon(null);
    setCouponMsg({ type: 'error', text: q.couponError || 'Coupon not valid for this purchase' });
    return null;
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponMsg(null);
    scheduleQuote({ couponCode: null });
  };

  const validate = () => {
    const errors = {};
    if (name.trim().length < 2) errors.name = 'Enter your name.';
    if (!emailOk) errors.email = 'Enter a valid email. Your login details will be sent here.';
    if (!phoneOk) errors.phone = 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openRazorpay = (data) =>
    new Promise((resolve) => {
      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amountPaise,
        currency: 'INR',
        name: 'Product Hub',
        description: plan?.name || 'Subscription',
        prefill: {
          name: data.prefill?.name || name.trim(),
          email: data.prefill?.email || email.trim(),
          contact: data.prefill?.contact || data.prefill?.phone || normalizedPhone,
        },
        handler: async (response) => {
          setNotice('Confirming your payment…');
          // Even if verify fails here, the webhook can still finish the order; the status page polls.
          await api('/api/checkout/verify', {
            method: 'POST',
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          });
          resolve('paid');
          router.push(statusHref(data));
        },
        modal: {
          ondismiss: () => resolve('dismissed'),
        },
      });
      rzp.on('payment.failed', (resp) => {
        const reason = resp?.error?.description;
        setFormError(`Payment failed${reason ? `: ${reason}` : ''}. If money was deducted, it will be refunded. You can try again.`);
      });
      rzp.open();
    });

  const onSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    cancelScheduledQuote(); // the order computes the real price itself
    setFormError('');
    setNotice('');
    if (!validate()) return;

    let coupon = appliedCoupon;
    const typed = couponInput.trim().toUpperCase();
    if (typed && typed !== appliedCoupon) {
      coupon = await applyCoupon();
      if (!coupon) return;
    }

    setSubmitting(true);
    const res = await api('/api/checkout/order', {
      method: 'POST',
      body: {
        name: name.trim(),
        email: email.trim(),
        phone: normalizedPhone,
        planCode,
        couponCode: coupon || undefined,
        categoryIds: pickEnabled && picked.length ? picked : undefined,
        website,
      },
    });
    if (!res.ok) {
      setSubmitting(false);
      setFormError(friendlyError(res, { lockEmail }));
      return;
    }
    const data = res.data || {};
    if (data.provider === 'mock') {
      router.push(statusHref(data));
      return;
    }
    if (data.provider !== 'razorpay') {
      setSubmitting(false);
      setFormError('Could not start the payment. Please try again.');
      return;
    }
    if (!rzpReady || typeof window === 'undefined' || !window.Razorpay) {
      setSubmitting(false);
      setFormError('The payment window did not load. Refresh the page and try again.');
      return;
    }
    const outcome = await openRazorpay(data);
    if (outcome === 'dismissed') {
      setSubmitting(false);
      setNotice('The payment window was closed. Press "Pay" when you are ready.');
    }
  };

  const listPaise = quote?.listPaise ?? plan?.paise;
  const finalPaise = quote?.finalPaise ?? plan?.paise;
  const discounted = quote && finalPaise < listPaise;
  const offerHint = !quote && offer?.active && offer.planCode === planCode;

  if (!plans.length) {
    return <div className="alert alert-error" role="alert">Plans could not be loaded. Please try again in a few minutes.</div>;
  }

  return (
    <form className="pub-buy" onSubmit={onSubmit} noValidate>
      <Script src={RAZORPAY_SRC} strategy="afterInteractive" onReady={() => setRzpReady(true)} onError={() => setRzpFailed(true)} />

      <fieldset className="pub-plan-pick">
        <legend>Choose a plan</legend>
        {plans.map((p) => (
          <label key={p.code} className={`pub-plan-option${p.code === planCode ? ' selected' : ''}`}>
            <input
              type="radio"
              name="plan"
              value={p.code}
              checked={p.code === planCode}
              onChange={() => {
                setPlanCode(p.code);
                // Drop the old plan's price at once; the new quote follows after the debounce.
                quoteSeq.current++;
                quotedKey.current = '';
                setQuote(null);
                setQuoteLoading(false);
                scheduleQuote({ planCode: p.code });
              }}
            />
            <span className="pub-plan-option-text">
              <strong>{p.name}</strong>
              <span className="muted small">
                {formatRupees(p.paise)} · {p.days} days
              </span>
            </span>
            {p.code === 'm3' && <span className="badge badge-primary">Best value</span>}
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor="buy-name">Name<span className="req" aria-hidden="true">*</span></label>
        <input id="buy-name" type="text" autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={fieldErrors.name ? 'true' : undefined} aria-describedby={fieldErrors.name ? 'buy-name-err' : undefined} required />
        {fieldErrors.name && <div id="buy-name-err" className="error-text">{fieldErrors.name}</div>}
      </div>

      <div className="field">
        <label htmlFor="buy-email">Email<span className="req" aria-hidden="true">*</span></label>
        <input
          id="buy-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          maxLength={120}
          readOnly={lockEmail}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => scheduleQuote()}
          aria-invalid={fieldErrors.email ? 'true' : undefined}
          aria-describedby="buy-email-hint"
          required
        />
        <div id="buy-email-hint" className={fieldErrors.email ? 'error-text' : 'hint'}>
          {fieldErrors.email || (lockEmail ? 'The plan will be added to this account.' : 'Your login details will be sent to this email.')}
        </div>
      </div>

      <div className="field">
        <label htmlFor="buy-phone">Mobile number<span className="req" aria-hidden="true">*</span></label>
        <div className="pub-phone">
          <span aria-hidden="true">+91</span>
          <input
            id="buy-phone"
            type="tel"
            autoComplete="tel-national"
            inputMode="numeric"
            placeholder="10 digit number"
            value={phone}
            maxLength={20}
            onChange={(e) => setPhone(cleanPhoneInput(e.target.value))}
            onBlur={() => {
              // Show the bare 10 digits once the number is valid ("+91 98765-43210" -> "9876543210").
              if (normalizedPhone && normalizedPhone !== phone) setPhone(normalizedPhone);
              scheduleQuote();
            }}
            aria-invalid={fieldErrors.phone ? 'true' : undefined}
            aria-describedby={fieldErrors.phone ? 'buy-phone-err' : undefined}
            required
          />
        </div>
        {fieldErrors.phone && <div id="buy-phone-err" className="error-text">{fieldErrors.phone}</div>}
      </div>

      {/* Honeypot: hidden from people and screen readers, bots tend to fill it. */}
      <div className="pub-hp" aria-hidden="true">
        <label htmlFor="buy-website">Website</label>
        <input id="buy-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="buy-coupon">Coupon code (optional)</label>
        <div className="pub-coupon">
          <input
            id="buy-coupon"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={couponInput}
            maxLength={40}
            onChange={(e) => {
              setCouponInput(e.target.value);
              if (couponMsg?.type === 'error') setCouponMsg(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!quoteLoading) applyCoupon();
              }
            }}
            aria-describedby={couponMsg ? 'buy-coupon-msg' : undefined}
          />
          {appliedCoupon && appliedCoupon === couponInput.trim().toUpperCase() ? (
            <button type="button" className="btn" onClick={removeCoupon}>Remove</button>
          ) : (
            <button type="button" className="btn" onClick={applyCoupon} disabled={quoteLoading}>Apply</button>
          )}
        </div>
        {couponMsg && (
          <div id="buy-coupon-msg" className={couponMsg.type === 'error' ? 'error-text' : 'pub-ok-text'} role="status">
            {couponMsg.text}
          </div>
        )}
      </div>

      {pickEnabled && (
        <fieldset className="pub-pick">
          <legend>Choose your {pickMax} categories</legend>
          <p className="muted small">
            {picked.length} of {pickMax} selected. You can also choose them from your dashboard after you sign in.
          </p>
          {catState === 'loading' && <p className="muted small" role="status">Loading categories…</p>}
          {catState === 'error' && (
            <div className="alert alert-error" role="alert">
              Could not load categories.{' '}
              <button type="button" className="btn btn-sm" onClick={loadCategories}>Retry</button>
            </div>
          )}
          {catState === 'idle' && categories?.length === 0 && <p className="muted small">No categories are available yet.</p>}
          {catState === 'idle' && categories?.length > 0 && (
            <ul className="pub-pick-list">
              {categories.map((c) => {
                const checked = picked.includes(c.id);
                const disabled = !checked && picked.length >= pickMax;
                return (
                  <li key={c.id}>
                    <label className={`checkbox${disabled ? ' is-disabled' : ''}`}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => togglePick(c.id)} />
                      <span>{c.name}</span>
                      <span className="muted small">{c.productCount} products</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      )}

      <div className="pub-total" aria-live="polite">
        <div className="row-between">
          <span>Total</span>
          <span className="pub-total-price">
            {discounted && <s className="muted">{formatRupees(listPaise)}</s>}{' '}
            <strong>{formatRupees(finalPaise)}</strong>
          </span>
        </div>
        {quoteLoading && <p className="muted small">Checking the price…</p>}
        {!quoteLoading && quote?.offerApplied && <p className="pub-ok-text small">Launch offer applied: first month {formatRupees(finalPaise)}.</p>}
        {!quoteLoading && quote?.couponApplied && appliedCoupon && <p className="pub-ok-text small">Coupon {appliedCoupon} applied.</p>}
        {offerHint && (
          <p className="muted small">
            Launch offer: {formatRupees(offer.paise)} on your first purchase. Enter your email and phone to see the final price.
          </p>
        )}
        {quoteError && <p className="error-text small">{quoteError}</p>}
      </div>

      {formError && <div className="alert alert-error" role="alert">{formError}</div>}
      {notice && <div className="alert alert-info" role="status">{notice}</div>}
      {rzpFailed && (
        <div className="alert alert-warning" role="alert">
          The payment system did not load. Check your internet connection and refresh the page.
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-block pub-btn-lg" disabled={submitting}>
        {submitting ? 'Please wait…' : `Pay ${formatRupees(finalPaise)}`}
      </button>
      <p className="muted small pub-fineprint">
        By paying, you agree to our <Link href="/terms">Terms</Link> and <Link href="/refund-policy">Refund policy</Link>.
        Plans do not renew automatically. Need help? <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
      </p>
    </form>
  );
}
