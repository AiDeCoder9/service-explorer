'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useExplorerData } from '@/lib/client/useExplorerData';
import { activeChips, activeNames, clearFilter, suggestRemovals } from '@/lib/engine/filters';
import { SORT_KEYS, type SortKey, buildResultPage } from '@/lib/engine/results';
import { type FilterName, type Filters, emptyFilters, search } from '@/lib/engine/search';
import { type ViewState, parseView, serializeView } from '@/lib/engine/url';
import { plural } from '@/lib/format';
import { FilterDrawer } from './FilterDrawer';
import { FilterPanel } from './FilterPanel';
import { EmptyState, ErrorState, ResultsList, ResultsSkeleton } from './Results';

const SORT_LABEL: Record<SortKey, string> = {
  relevance: 'Relevance', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low', rating: 'Rating',
};

export function Explorer() {
  const { state, retry } = useExplorerData();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = useMemo(() => parseView(params), [params]);
  const viewRef = useRef(view);
  viewRef.current = view;

  const go = useCallback((next: ViewState, replace = false) => {
    const qs = serializeView(next);
    const url = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => (replace ? router.replace(url, { scroll: false }) : router.push(url, { scroll: false })));
  }, [pathname, router]);

  const setFilters = useCallback((filters: Filters) => go({ filters, sort: viewRef.current.sort, page: 1 }), [go]);

  // Search box: the input owns its text; the URL follows shortly after, so typing is never blocked.
  const [text, setText] = useState(view.filters.q);
  const sent = useRef(view.filters.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (view.filters.q !== sent.current) { sent.current = view.filters.q; setText(view.filters.q); }
  }, [view.filters.q]);
  const onType = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      sent.current = value;
      const v = viewRef.current;
      go({ filters: { ...v.filters, q: value }, sort: v.sort, page: 1 }, true);
    }, 120);
  };

  const [drawer, setDrawer] = useState(false);
  const index = state.status === 'ready' ? state.index : null;
  const result = useMemo(() => (index ? search(index, view.filters) : null), [index, view.filters]);
  const page = useMemo(() => (index && result ? buildResultPage(index, result, view.filters, view.sort, view.page) : null), [index, result, view]);
  const chips = useMemo(() => (index ? activeChips(index, view.filters) : []), [index, view.filters]);
  const nActive = activeNames(view.filters).length;

  const hrefFor = (p: number) => {
    const qs = serializeView({ ...view, page: p });
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const announce = page ? `${plural(page.totalServices, 'service')} from ${plural(page.totalProviders, 'provider')}` : 'Loading services';

  return (
    <div className="shell">
      <header className="top">
        <div>
          <h1>Find a health service</h1>
          <p className="muted">Compare clinics, hospitals and labs. Prices stay in each provider’s own currency.</p>
        </div>
        <div className="searchbar">
          <label className="sr-only" htmlFor="q">Search services, providers or categories</label>
          <input
            id="q" type="search" className="field big" placeholder="Search services, providers or categories"
            value={text} onChange={(e) => onType(e.target.value)} autoComplete="off"
          />
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar" aria-label="Filters">
          <h2 className="sr-only">Filters</h2>
          {index && result ? (
            <FilterPanel index={index} filters={view.filters} result={result} onChange={setFilters} />
          ) : (
            <div className="panel" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="sk sk-filter" />)}
            </div>
          )}
        </aside>

        <main id="main" className="results" aria-busy={state.status === 'loading'}>
          <p role="status" className="sr-only">{announce}</p>

          <div className="toolbar">
            <h2 className="count-line">{page ? <>{plural(page.totalServices, 'service')} <span className="muted">from {plural(page.totalProviders, 'provider')}</span></> : 'Loading…'}</h2>
            <button type="button" className="btn filters-btn" onClick={() => setDrawer(true)} disabled={!index}>
              Filters{nActive > 0 ? ` (${nActive})` : ''}
            </button>
            <label className="sort">
              <span className="small muted">Sort by</span>
              <select value={view.sort} onChange={(e) => go({ ...view, sort: e.target.value as SortKey, page: 1 })} disabled={!index}>
                {SORT_KEYS.map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
              </select>
            </label>
          </div>

          {chips.length > 0 && (
            <ul className="chips" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.id}>
                  <button type="button" className="chip" onClick={() => setFilters(c.without)} aria-label={`Remove filter: ${c.label}`}>
                    {c.label} <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {state.status === 'loading' && <ResultsSkeleton />}
          {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
          {index && result && page && page.totalServices === 0 && (
            <EmptyState
              suggestions={suggestRemovals(index, view.filters)}
              onRemove={(name) => setFilters(clearFilter(view.filters, name as FilterName))}
              onClearAll={() => setFilters(emptyFilters())}
            />
          )}
          {index && result && page && page.totalServices > 0 && (
            <ResultsList page={page} index={index} result={result} filters={view.filters} sort={view.sort} hrefFor={hrefFor} />
          )}
        </main>
      </div>

      {index && (
        <FilterDrawer open={drawer} index={index} applied={view.filters} onClose={() => setDrawer(false)} onApply={setFilters} />
      )}
    </div>
  );
}
