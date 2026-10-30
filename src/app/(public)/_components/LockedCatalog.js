'use client';

import { useRef } from 'react';

// Blurred product tiles; any click opens a dialog with the plan cards (`children`,
// rendered on the server). Tiles carry no product data beyond a signed thumbnail URL.
export default function LockedCatalog({ thumbs, total, children }) {
  const dialogRef = useRef(null);
  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();
  // A click on the dimmed backdrop (the dialog element itself) closes it.
  const onDialogClick = (e) => {
    if (e.target === dialogRef.current) close();
  };
  // 12 tiles fill whole rows at 6, 4 and 3 columns; the last one becomes "+N more" when needed.
  const shown = total > thumbs.length && thumbs.length >= 12 ? thumbs.slice(0, 11) : thumbs.slice(0, 12);
  const hidden = Math.max(0, total - shown.length);

  return (
    <>
      <ul className="locked-grid">
        {shown.map((src) => (
          <li key={src}>
            <button type="button" className="locked-tile" onClick={open} aria-label="Unlock this product: see plans">
              <img src={src} alt="" loading="lazy" width="240" height="240" />
              <span className="locked-badge" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                Unlock
              </span>
            </button>
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <button type="button" className="locked-tile locked-more" onClick={open}>
              <strong>+{hidden}</strong>
              <span>more products</span>
            </button>
          </li>
        )}
      </ul>
      <div className="locked-cta">
        <button type="button" className="btn btn-primary btn-lg" onClick={open}>Unlock all {total} products</button>
      </div>
      <dialog ref={dialogRef} className="plan-dialog" aria-labelledby="plan-dialog-title" onClick={onDialogClick}>
        <div className="plan-dialog-head">
          <div>
            <h2 id="plan-dialog-title">Unlock the full catalog</h2>
            <p className="muted">Choose a plan to see every product with titles, descriptions and full-quality images.</p>
          </div>
          <button type="button" className="btn btn-ghost plan-dialog-close" onClick={close} aria-label="Close">✕</button>
        </div>
        {children}
      </dialog>
    </>
  );
}
