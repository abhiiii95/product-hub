'use client';

import { useState } from 'react';
import { useToast } from './Feedback';
import { downloadAllImages, downloadImage } from '@/lib/downloads';

export function DownloadImageButton({ sku, image, index, label = 'Download', className = 'btn btn-sm' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    setBusy(true);
    try {
      await downloadImage(sku, image, index);
    } catch (err) {
      toast(err.message || 'Download failed', 'error');
    }
    setBusy(false);
  };
  return (
    <button type="button" className={className} onClick={onClick} disabled={busy}>
      {busy ? 'Downloading…' : label}
    </button>
  );
}

export function DownloadAllButton({ sku, images, className = 'btn btn-sm' }) {
  const toast = useToast();
  const [progress, setProgress] = useState('');
  const onClick = async () => {
    setProgress('Preparing…');
    try {
      await downloadAllImages(sku, images, (done, total) => setProgress(`Zipping ${done}/${total}…`));
    } catch (err) {
      toast(err.message || 'ZIP download failed', 'error');
    }
    setProgress('');
  };
  return (
    <button type="button" className={className} onClick={onClick} disabled={Boolean(progress) || images.length === 0}>
      {progress || 'Download all (ZIP)'}
    </button>
  );
}
