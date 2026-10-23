'use client';

import { useState } from 'react';
import { useToast } from './Feedback';

async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy method (e.g. permission denied, document not focused).
    }
  }
  // Fallback for non-secure contexts (e.g. LAN IP over http).
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('copy failed');
}

export default function CopyButton({ text, label = 'Copy', what }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const value = text === null || text === undefined ? '' : String(text);

  const onCopy = async () => {
    try {
      await writeClipboard(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Could not copy to clipboard. Select the text and copy manually.', 'error');
    }
  };

  return (
    <button
      type="button"
      className={`btn btn-sm copy-btn${copied ? ' copied' : ''}`}
      onClick={onCopy}
      disabled={!value}
      aria-label={what ? `Copy ${what}` : label}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}

// A labelled value with its own copy button.
export function CopyField({ label, value, multiline = false }) {
  const text = Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : String(value);
  return (
    <div className="copy-field">
      <div className="cf-head">
        <span className="cf-label">{label}</span>
        <CopyButton text={text} what={label} />
      </div>
      {text ? <div className={multiline ? 'cf-value pre-wrap' : 'cf-value'}>{text}</div> : <div className="cf-empty">Not provided</div>}
    </div>
  );
}
