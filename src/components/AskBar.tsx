'use client';

import { type RefObject, useEffect, useState } from 'react';

export const EXAMPLES = [
  'Full body check-up in Bangkok under 5000 THB',
  'Thyroid blood test at home',
  'Cheapest massage in Kathmandu',
  'Best rated wellness packages',
];

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Enter or the Ask button */
  onSubmit: () => void;
  /** what the sentence was understood as, shown before it is applied */
  preview: string[];
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * One box for everything. Plain words search as you type; a sentence with structure
 * ("under 5000 THB in Bangkok") is shown back as chips and applied on Enter.
 */
export function AskBar({ value, onChange, onSubmit, preview, inputRef }: Props) {
  const [hint, setHint] = useState(0);
  useEffect(() => {
    if (value) return;
    const t = setInterval(() => setHint((h) => (h + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(t);
  }, [value]);

  return (
    <div className="ask-wrap">
      <form className="ask" role="search" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <span className="ask-icon" aria-hidden="true">✦</span>
        <label className="sr-only" htmlFor="q">Ask for a service, or search by name</label>
        <input
          id="q" ref={inputRef} type="search" value={value} autoComplete="off" enterKeyHint="search"
          placeholder={`Try “${EXAMPLES[hint]}”`} onChange={(e) => onChange(e.target.value)}
        />
        <button type="submit" className="btn primary ask-go">Ask</button>
      </form>
      {preview.length > 0 && (
        <p className="ask-preview" role="status">
          <span className="muted">Understood as</span>
          {preview.map((p) => <span key={p} className="tagline">{p}</span>)}
          <span className="muted">· press Enter to apply</span>
        </p>
      )}
    </div>
  );
}
