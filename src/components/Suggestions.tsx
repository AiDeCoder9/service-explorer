'use client';

import type { SortKey } from '@/lib/engine/results';
import { EXAMPLES } from './AskBar';

interface Props {
  /** removals that bring more results back, best first (empty when no filter is on) */
  removals: { name: string; label: string; total: number }[];
  sort: SortKey;
  hasFilters: boolean;
  onAsk: (text: string) => void;
  onRemove: (name: string) => void;
  onSort: (key: SortKey) => void;
}

/**
 * The next sensible move, as one tap. With nothing applied it offers example questions;
 * with filters applied it offers the changes most likely to help.
 */
export function Suggestions({ removals, sort, hasFilters, onAsk, onRemove, onSort }: Props) {
  if (!hasFilters) {
    return (
      <div className="assist">
        <span className="assist-label">Try</span>
        {EXAMPLES.map((e) => <button key={e} type="button" className="suggestion" onClick={() => onAsk(e)}>{e}</button>)}
      </div>
    );
  }
  return (
    <div className="assist">
      <span className="assist-label">Next</span>
      {removals.slice(0, 2).map((r) => (
        <button key={r.name} type="button" className="suggestion" onClick={() => onRemove(r.name)}>
          Drop {r.label} <span className="muted">→ {r.total.toLocaleString('en')}</span>
        </button>
      ))}
      {sort !== 'price-asc' && <button type="button" className="suggestion" onClick={() => onSort('price-asc')}>Cheapest first</button>}
      {sort !== 'rating' && <button type="button" className="suggestion" onClick={() => onSort('rating')}>Top rated first</button>}
    </div>
  );
}
