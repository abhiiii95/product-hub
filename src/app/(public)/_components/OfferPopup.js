'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

const SEEN_KEY = 'ph-offer-seen';

// Phone-only launch offer pop-up, shown once per browser a moment after the page opens.
export default function OfferPopup({ price, listPrice, percentOff }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 640px)').matches) return undefined;
    try {
      if (localStorage.getItem(SEEN_KEY)) return undefined;
    } catch {
      // Storage blocked: show it anyway, once per page view.
    }
    const timer = setTimeout(() => {
      dialogRef.current?.showModal();
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {}
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const close = () => dialogRef.current?.close();
  const onDialogClick = (e) => {
    if (e.target === dialogRef.current) close();
  };

  return (
    <dialog ref={dialogRef} className="offer-dialog" aria-labelledby="offer-title" onClick={onDialogClick}>
      <button type="button" className="btn btn-ghost offer-close" onClick={close} aria-label="Close">✕</button>
      <p className="offer-tag">Launch offer · {percentOff}% off</p>
      <h2 id="offer-title">Your first month for just</h2>
      <p className="offer-price">
        <strong>{price}</strong>
        <s>{listPrice}</s>
      </p>
      <p className="muted">Full catalog access, one-click copy and image downloads. We ship your orders. No auto-debit.</p>
      <Link className="btn btn-primary btn-lg btn-block" href="/buy?plan=m1" onClick={close}>
        Start for {price}
      </Link>
      <button type="button" className="btn btn-ghost btn-block offer-later" onClick={close}>Maybe later</button>
    </dialog>
  );
}
