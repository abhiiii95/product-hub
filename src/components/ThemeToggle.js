'use client';

import { useEffect, useState } from 'react';
import { THEME_KEY } from '@/lib/theme';

const OPTIONS = [
  { value: 'light', label: 'Light', title: 'Light theme' },
  { value: 'dark', label: 'Dark', title: 'Dark theme' },
];

// Dark is the default and is stored as "no choice".
function applyTheme(value) {
  document.documentElement.dataset.theme = value;
  try {
    if (value === 'light') localStorage.setItem(THEME_KEY, 'light');
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Storage unavailable (private mode) – the choice still applies to this page.
  }
}

export default function ThemeToggle({ compact = false }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  const choose = (value) => {
    setTheme(value);
    applyTheme(value);
  };

  if (compact) {
    // Single button that switches Light ↔ Dark (for the mobile top bar).
    const next = theme === 'dark' ? OPTIONS[0] : OPTIONS[1];
    return (
      <button type="button" className="btn btn-sm" onClick={() => choose(next.value)} aria-label={`Switch to ${next.label.toLowerCase()} theme`} title={`Switch to ${next.label.toLowerCase()} theme`}>
        {theme === 'dark' ? '☾' : '☀'}
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
