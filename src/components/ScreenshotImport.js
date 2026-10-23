'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { prepareScreenshots } from '@/lib/screenshots';

// "Fill from screenshot": reads a marketplace form screenshot with AI and hands
// the result to the form. Nothing is saved here.
export default function ScreenshotImport({ onResult, disabled }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const busy = Boolean(status);

  const read = async (files) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setError('');
    try {
      setStatus('Preparing screenshot…');
      const parts = await prepareScreenshots(images);
      setStatus('Reading fields… this can take up to a minute');
      const res = await api('/api/products/extract', { method: 'POST', body: { images: parts } });
      if (!res.ok) throw new Error(res.error);
      onResult(res.data.result);
    } catch (err) {
      setError(err.message || 'Could not read the screenshot');
    }
    setStatus('');
  };

  // Ctrl+V / Cmd+V anywhere on the page pastes a screenshot.
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    const onPaste = (e) => {
      if (busy || disabled) return;
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        readRef.current(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [busy, disabled]);

  return (
    <div className="screenshot-import">
      <div className="row-between">
        <div>
          <h2 style={{ marginBottom: '0.2rem' }}>Fill from screenshot</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Upload or paste (Ctrl+V) a screenshot of the Meesho form. The fields below get filled for you to check. Nothing is saved until you click
            Create product.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={busy || disabled}>
          {busy ? 'Reading…' : 'Choose screenshot…'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            read(files);
          }}
        />
      </div>
      {status && (
        <div className="row mt-1 small" role="status">
          <span className="spinner" style={{ margin: 0, width: 16, height: 16, borderWidth: 2 }} aria-hidden="true" />
          {status}
        </div>
      )}
      {error && <div className="alert alert-error mt-1" role="alert" style={{ marginBottom: 0 }}>{error}</div>}
    </div>
  );
}
