'use client';

import type { SearchIndex } from '@/lib/engine';
import type { PanelGroup } from './FilterPanel';
import type { Filters } from '@/lib/engine/search';
import { TYPE_LABEL } from '@/lib/format';

interface Props {
  index: SearchIndex | null;
  filters: Filters;
  nActive: number;
  onOpen: (title: string, only?: PanelGroup[]) => void;
  onToggleHome: () => void;
}

const summary = (names: string[], empty: string) =>
  names.length === 0 ? empty : names.length === 1 ? names[0]! : `${names[0]} +${names.length - 1}`;

/** Filters stay out of the way until asked for: one pill per question, each opening a focused sheet. */
export function FilterPills({ index, filters, nActive, onOpen, onToggleHome }: Props) {
  const label = (list: { key: string; label: string }[], keys: string[]) => keys.map((k) => list.find((o) => o.key === k)?.label ?? k);
  const place = index ? label(index.place, filters.places) : filters.places;
  const p = filters.price;
  const price = p ? [`${p.currency} ${p.min !== undefined && p.max !== undefined ? `${p.min}–${p.max}` : p.min !== undefined ? `${p.min}+` : `≤ ${p.max ?? ''}`}`] : [];
  const off = !index;
  return (
    <div className="pills" role="group" aria-label="Filters">
      <button type="button" className="pill" disabled={off} data-active={filters.types.length ? '' : undefined} onClick={() => onOpen('Service type', ['type'])}>
        <span>{summary(filters.types.map((t) => TYPE_LABEL[t]), 'Type')}</span>
      </button>
      <button type="button" className="pill" disabled={off} data-active={place.length ? '' : undefined} onClick={() => onOpen('Where', ['place'])}>
        <span>{summary(place, 'Where')}</span>
      </button>
      <button type="button" className="pill" disabled={off} data-active={p ? '' : undefined} onClick={() => onOpen('Price', ['price'])}>
        <span>{summary(price, 'Price')}</span>
      </button>
      <button type="button" className="pill" disabled={off} aria-pressed={filters.homeTest} onClick={onToggleHome}>
        <span>Home visit</span>
      </button>
      <button type="button" className="pill filters-btn" disabled={off} data-active={nActive ? '' : undefined} onClick={() => onOpen('All filters')}>
        <span>{nActive > 0 ? `All filters (${nActive})` : 'All filters'}</span>
      </button>
    </div>
  );
}
