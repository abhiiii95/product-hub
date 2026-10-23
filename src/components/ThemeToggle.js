'use client';

import { useEffect, useState } from 'react';
import { THEME_KEY } from '@/lib/theme';

const OPTIONS = [
  { value: 'auto', label: 'Auto', title: 'Follow device setting' },
  { value: 'light', label: '☀ Light', title: 'Light theme' },
  { value: 'dark', label: '☾ Dark', title: 'Dark theme' },
];

function applyTheme(value) {
  if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
  try {
    if (value === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, value);
  } catch {
    // Storage unavailable (private mode) – the choice still applies to this page.
  }
}

export default function ThemeToggle({ compact = false }) {
  const [theme, setTheme] = useState('auto');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || 'auto');
  }, []);

  const choose = (value) => {
    setTheme(value);
    applyTheme(value);
  };

  if (compact) {
    // Single button that cycles Auto → Light → Dark (for the mobile top bar).
    const index = OPTIONS.findIndex((o) => o.value === theme);
    const next = OPTIONS[(index + 1) % OPTIONS.length];
    const icon = theme === 'light' ? '☀' : theme === 'dark' ? '☾' : 'A';
    return (
      <button type="button" className="btn btn-sm" onClick={() => choose(next.value)} aria-label={`Theme: ${OPTIONS[index].label}. Switch to ${next.label}`} title={`Theme: ${OPTIONS[index].title}`}>
        {icon}
      </button>
    );
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={theme === o.value} title={o.title} onClick={() => choose(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
