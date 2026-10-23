'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(() => {});
const ConfirmContext = createContext(async () => false);

// Provides toast notifications and a native <dialog>-based confirmation prompt.
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const dialogRef = useRef(null);

  const toast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, type }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setConfirmState({ title: 'Are you sure?', confirmLabel: 'Confirm', danger: true, ...options, resolve });
      }),
    []
  );

  useEffect(() => {
    if (confirmState && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [confirmState]);

  const close = (result) => {
    confirmState?.resolve(result);
    dialogRef.current?.close();
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type}`}>
              <span>{t.message}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))}>
                ×
              </button>
            </div>
          ))}
        </div>
        <dialog ref={dialogRef} onCancel={(e) => { e.preventDefault(); close(false); }} aria-labelledby="confirm-title">
          {confirmState && (
            <>
              <h2 id="confirm-title">{confirmState.title}</h2>
              {confirmState.message && <p className="muted">{confirmState.message}</p>}
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => close(false)} autoFocus>
                  Cancel
                </button>
                <button type="button" className={confirmState.danger ? 'btn btn-danger-solid' : 'btn btn-primary'} onClick={() => close(true)}>
                  {confirmState.confirmLabel}
                </button>
              </div>
            </>
          )}
        </dialog>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
export const useConfirm = () => useContext(ConfirmContext);

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status">
      <div className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="alert alert-error" role="alert">
      <div className="row-between">
        <span>{message}</span>
        {onRetry && (
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
