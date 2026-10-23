'use client';

import { useState } from 'react';
import CopyButton from './CopyButton';
import { DownloadAllButton, DownloadImageButton } from './DownloadButtons';
import { displayImage } from '@/lib/imageUrl';

// Read-only gallery with per-image and ZIP downloads (available to both roles).
export default function ImageGallery({ sku, images, productName }) {
  const [active, setActive] = useState(0);
  const current = images[active] || images[0];

  if (!images.length) {
    return (
      <div className="card">
        <h2>Images</h2>
        <p className="muted">No images have been uploaded for this product yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Images ({images.length})</h2>
        <DownloadAllButton sku={sku} images={images} className="btn btn-sm btn-primary" />
      </div>
      <div className="gallery-main">
        <img src={displayImage(current.url, 'large')} alt={current.label || productName} />
      </div>
      <div className="row-between mt-1">
        <div className="small">
          <strong>Image {active + 1}{active === 0 ? ' (main)' : ''}</strong>
          {current.label ? ` · ${current.label}` : ''}
        </div>
        <div className="row">
          {current.label && <CopyButton text={current.label} what="image label" label="Copy label" />}
          <DownloadImageButton sku={sku} image={current} index={active} label="Download image" />
        </div>
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbs" role="group" aria-label="Choose image">
          {images.map((img, i) => (
            <button key={img.id} type="button" aria-pressed={i === active} onClick={() => setActive(i)} aria-label={`Show image ${i + 1}${img.label ? `: ${img.label}` : ''}`}>
              <img src={displayImage(img.url, 'mini')} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
