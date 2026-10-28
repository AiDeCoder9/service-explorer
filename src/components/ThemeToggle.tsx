'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/** Starts from the system setting; a manual choice is remembered and applied before first paint (see layout). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const set = document.documentElement.dataset.theme as Theme | undefined;
    setTheme(set ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);

  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
  };

  return (
    <button type="button" className="btn theme-toggle" onClick={flip} aria-pressed={theme === 'dark'} disabled={theme === null}>
      {theme === 'dark' ? 'Dark' : 'Light'} theme
    </button>
  );
}
