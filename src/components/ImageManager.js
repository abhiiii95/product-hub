'use client';

import { useEffect, useRef, useState } from 'react';
import { useConfirm, useToast } from './Feedback';
import { api, uploadProductImage, uploadProductImages } from '@/lib/client';
import { DownloadAllButton, DownloadImageButton } from './DownloadButtons';
import { displayImage } from '@/lib/imageUrl';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/constants';

export function checkImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Unsupported type (use JPEG, PNG, WebP, GIF or AVIF)';
  if (file.size > MAX_IMAGE_BYTES) return `Larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`;
  return null;
}

function ImageTile({ sku, image, index, count, busy, onMove, onMain, onLabel, onReplace, onDelete }) {
  const [label, setLabel] = useState(image.label);
  const replaceRef = useRef(null);
  useEffect(() => setLabel(image.label), [image.label]);

  return (
    <div className="image-tile">
      <div className="thumb">
        <img src={displayImage(image.url, 'thumb')} alt={image.label || `Image ${index + 1}`} loading="lazy" />
        {index === 0 && <span className="badge badge-primary main-flag">Main image</span>}
      </div>
      <div className="tile-body">
        <label className="sr-only" htmlFor={`label-${image.id}`}>Label for image {index + 1}</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            id={`label-${image.id}`}
            type="text"
            maxLength={200}
            placeholder="Label / description"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onLabel(image, label);
              }
            }}
          />
          <button type="button" className="btn btn-sm" disabled={busy || label === image.label} onClick={() => onLabel(image, label)}>
            Save
          </button>
        </div>
        <div className="tile-actions">
          <button type="button" className="btn btn-sm" disabled={busy || index === 0} onClick={() => onMove(index, -1)} aria-label={`Move image ${index + 1} earlier`}>
            ←
          </button>
          <button type="button" className="btn btn-sm" disabled={busy || index === count - 1} onClick={() => onMove(index, 1)} aria-label={`Move image ${index + 1} later`}>
            →
          </button>
          {index !== 0 && (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onMain(image)}>
              Set main
            </button>
          )}
          <DownloadImageButton sku={sku} image={image} index={index} />
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => replaceRef.current?.click()}>
            Replace
          </button>
          <input
            ref={replaceRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onReplace(image, file);
            }}
          />
          <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => onDelete(image)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ImageManager({ productId, sku, initialImages }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [images, setImages] = useState(initialImages || []);
  const [queue, setQueue] = useState([]); // { key, file, preview, progress, status, error }
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  // Release preview object URLs when leaving the page.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(() => () => queueRef.current.forEach((q) => URL.revokeObjectURL(q.preview)), []);

  const patchQueue = (key, changes) => setQueue((list) => list.map((q) => (q.key === key ? { ...q, ...changes } : q)));

  const addFiles = (fileList) => {
    const items = Array.from(fileList).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      progress: 0,
      status: checkImageFile(file) ? 'invalid' : 'ready',
      error: checkImageFile(file),
    }));
    setQueue((list) => [...list, ...items]);
  };

  const removeQueued = (key) =>
    setQueue((list) => {
      const item = list.find((q) => q.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return list.filter((q) => q.key !== key);
    });

  const uploadAll = async () => {
    const ready = queue.filter((q) => q.status === 'ready' || q.status === 'failed');
    if (!ready.length) return;
    setBusy(true);
    ready.forEach((item) => patchQueue(item.key, { status: 'uploading', progress: 0, error: null }));
    const { uploaded } = await uploadProductImages(
      productId,
      ready.map((item) => item.file),
      {
        label: label.trim(),
        onItem: (i, state) => {
          const key = ready[i].key;
          if (state.progress !== undefined) patchQueue(key, { progress: state.progress });
          else if (state.done) {
            setImages((list) => [...list, state.image]);
            removeQueued(key);
          } else if (state.error) patchQueue(key, { status: 'failed', error: state.error });
        },
      }
    );
    const success = uploaded.length;
    setBusy(false);
    if (success) toast(`${success} image${success === 1 ? '' : 's'} uploaded`, 'success');
    if (success < ready.length) toast('Some images failed to upload. See details below.', 'error');
  };

  const saveOrder = async (next) => {
    const previous = images;
    setImages(next);
    setBusy(true);
    const res = await api(`/api/products/${productId}/images`, { method: 'PATCH', body: { order: next.map((i) => i.id) } });
    setBusy(false);
    if (!res.ok) {
      setImages(previous);
      toast(res.error, 'error');
    } else setImages(res.data.images);
  };

  const onMove = (index, delta) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    saveOrder(next);
  };

  const onMain = (image) => saveOrder([image, ...images.filter((i) => i.id !== image.id)]);

  const onLabel = async (image, text) => {
    setBusy(true);
    const res = await api(`/api/products/${productId}/images/${image.id}`, { method: 'PATCH', body: { label: text } });
    setBusy(false);
    if (res.ok) {
      setImages((list) => list.map((i) => (i.id === image.id ? { ...i, label: res.data.image.label } : i)));
      toast('Label saved', 'success');
    } else toast(res.error, 'error');
  };

  const onReplace = async (image, file) => {
    const problem = checkImageFile(file);
    if (problem) return toast(`${file.name}: ${problem}`, 'error');
    setBusy(true);
    const res = await uploadProductImage(productId, file, { imageId: image.id });
    setBusy(false);
    if (res.ok) {
      setImages((list) => list.map((i) => (i.id === image.id ? res.image : i)));
      toast('Image replaced', 'success');
    } else toast(res.error, 'error');
  };

  const onDelete = async (image) => {
    const ok = await confirm({ title: 'Delete this image?', message: 'It will be permanently removed from storage.', confirmLabel: 'Delete image' });
    if (!ok) return;
    setBusy(true);
    const res = await api(`/api/products/${productId}/images/${image.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setImages((list) => list.filter((i) => i.id !== image.id));
      toast('Image deleted', 'success');
    } else toast(res.error, 'error');
  };

  const pending = queue.filter((q) => q.status === 'ready' || q.status === 'failed').length;

  return (
    <div className="card" id="images">
      <div className="card-header">
        <h2>Images ({images.length})</h2>
        {images.length > 0 && (
          <DownloadAllButton sku={sku} images={images} />
        )}
      </div>

      <div
        className={`dropzone${drag ? ' active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <p>Drag images here, or</p>
        <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose images…
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="small" style={{ marginTop: '0.5rem' }}>JPEG, PNG, WebP, GIF or AVIF, up to {MAX_IMAGE_BYTES / 1024 / 1024} MB each.</p>
      </div>

      {queue.length > 0 && (
        <div className="mt-1">
          <h3>Ready to upload</h3>
          {queue.map((q) => (
            <div key={q.key} className="upload-row">
              <img className="mini-thumb" src={q.preview} alt="" />
              <div className="grow">
                <div className="truncate">{q.file.name}</div>
                {q.status === 'uploading' && (
                  <div className="progress" role="progressbar" aria-valuenow={q.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${q.file.name}`}>
                    <span style={{ width: `${q.progress}%` }} />
                  </div>
                )}
                {q.status === 'uploading' && q.progress === 100 && <div className="small muted">Saving to storage…</div>}
                {q.error && <div className="small" style={{ color: 'var(--danger)' }}>{q.error}</div>}
              </div>
              {q.status !== 'uploading' && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeQueued(q.key)} aria-label={`Remove ${q.file.name}`}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="row mt-1">
            <label htmlFor="upload-label" className="sr-only">Optional label for these images</label>
            <input id="upload-label" type="text" placeholder="Optional label for these images" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1, minWidth: 180 }} maxLength={200} />
            <button type="button" className="btn btn-primary" onClick={uploadAll} disabled={busy || pending === 0}>
              {busy ? 'Uploading…' : `Upload ${pending} image${pending === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      <div className="mt-1">
        {images.length === 0 ? (
          <p className="muted">No images yet. The first image becomes the main product image.</p>
        ) : (
          <>
            <p className="small muted">The first image is the main image shown in the catalog. Use the arrows to reorder.</p>
            <div className="image-list">
              {images.map((image, index) => (
                <ImageTile
                  key={image.id}
                  sku={sku}
                  image={image}
                  index={index}
                  count={images.length}
                  busy={busy}
                  onMove={onMove}
                  onMain={onMain}
                  onLabel={onLabel}
                  onReplace={onReplace}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
