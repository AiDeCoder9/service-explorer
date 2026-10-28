'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useExplorerData } from '@/lib/client/useExplorerData';
import { activeChips, activeNames, clearFilter, suggestRemovals } from '@/lib/engine/filters';
import { SORT_KEYS, type SortKey, buildResultPage } from '@/lib/engine/results';
import type { SearchIndex } from '@/lib/engine';
import { type FilterName, type Filters, emptyFilters, search } from '@/lib/engine/search';
import { type ViewState, parseView, serializeView } from '@/lib/engine/url';
import { plural } from '@/lib/format';
import { parseIntent } from '@/lib/engine/intent';
import { AskBar } from './AskBar';
import { CompareTray, MAX_COMPARE } from './CompareTray';
import { FilterDrawer } from './FilterDrawer';
import type { PanelGroup } from './FilterPanel';
import { FilterPills } from './FilterPills';
import { EmptyState, ErrorState, ResultsList, ResultsSkeleton } from './Results';
import { Suggestions } from './Suggestions';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<SearchIndex | null>(null);

  // Plain words search as you type. A sentence with structure waits for Enter, so it is never half-applied.
  const onType = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    const idx = indexRef.current;
    if (idx && parseIntent(value, idx).structured) return;
    timer.current = setTimeout(() => {
      sent.current = value;
      const v = viewRef.current;
      go({ filters: { ...v.filters, q: value }, sort: v.sort, page: 1 }, true);
    }, 120);
  };

  const index = state.status === 'ready' ? state.index : null;
  indexRef.current = index;

  const ask = (value: string) => {
    clearTimeout(timer.current);
    const intent = index ? parseIntent(value, index) : null;
    setText(value);
    if (intent?.structured) {
      sent.current = intent.filters.q;
      go({ filters: intent.filters, sort: intent.sort ?? 'relevance', page: 1 });
    } else {
      sent.current = value;
      go({ filters: { ...viewRef.current.filters, q: value }, sort: viewRef.current.sort, page: 1 });
    }
  };

  const preview = useMemo(() => {
    if (!index || !text.trim()) return [];
    const intent = parseIntent(text, index);
    if (!intent.structured) return [];
    const labels = activeChips(index, { ...intent.filters, q: '' }).map((c) => c.label);
    if (intent.sort) labels.push(SORT_LABEL[intent.sort]);
    if (intent.filters.q) labels.push(`“${intent.filters.q}”`);
    return labels;
  }, [index, text]);

  const [sheet, setSheet] = useState<{ title: string; only?: PanelGroup[] }>({ title: 'All filters' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const openSheet = (title: string, only?: PanelGroup[]) => { setSheet({ title, only }); setSheetOpen(true); };

  const [picked, setPicked] = useState<string[]>([]);
  const compare = {
    ids: picked,
    full: picked.length >= MAX_COMPARE,
    toggle: (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id])),
  };

  const [copied, setCopied] = useState(false);
  const share = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const result = useMemo(() => (index ? search(index, view.filters) : null), [index, view.filters]);
  const page = useMemo(() => (index && result ? buildResultPage(index, result, view.filters, view.sort, view.page) : null), [index, result, view]);
  // Type, place, price and home test already show on their pills; chips cover the rest (search text, category, provider).
  const chips = useMemo(() => (index ? activeChips(index, view.filters).filter((c) => !/^(type:|place:|price$|home$)/.test(c.id)) : []), [index, view.filters]);
  const removals = useMemo(() => (index ? suggestRemovals(index, view.filters) : []), [index, view.filters]);
  const nActive = activeNames(view.filters).length;

  const hrefFor = (p: number) => {
    const qs = serializeView({ ...view, page: p });
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const announce = page ? `${plural(page.totalServices, 'service')} from ${plural(page.totalProviders, 'provider')}` : 'Loading services';
  const removeFilter = (name: string) => setFilters(clearFilter(view.filters, name as FilterName));

  return (
    <div className="shell">
      <div className="intro">
        <h1>What care are you looking for?</h1>
        <p className="muted">Ask in plain words. We turn it into filters you can see and change. Prices stay in each provider’s own currency.</p>
      </div>

      <div className="dock">
        <AskBar value={text} onChange={onType} onSubmit={() => ask(text)} preview={preview} inputRef={inputRef} />
        <FilterPills
          index={index} filters={view.filters} nActive={nActive}
          onOpen={openSheet} onToggleHome={() => setFilters({ ...view.filters, homeTest: !view.filters.homeTest })}
        />
      </div>

      <Suggestions
        removals={removals} sort={view.sort} hasFilters={nActive > 0}
        onAsk={ask} onRemove={removeFilter} onSort={(sort) => go({ ...view, sort, page: 1 })}
      />

      <main id="main" className="results" aria-busy={state.status === 'loading'}>
        <p role="status" className="sr-only">{announce}</p>

        <div className="toolbar">
          <h2 className="count-line">{page ? <>{plural(page.totalServices, 'service')} <span className="muted">from {plural(page.totalProviders, 'provider')}</span></> : 'Loading…'}</h2>
          <label className="sort">
            <span className="small muted">Sort by</span>
            <select value={view.sort} onChange={(e) => go({ ...view, sort: e.target.value as SortKey, page: 1 })} disabled={!index}>
              {SORT_KEYS.map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
            </select>
          </label>
          <button type="button" className="btn" onClick={share} disabled={!index}>{copied ? 'Link copied' : 'Share search'}</button>
          {nActive > 0 && <button type="button" className="btn ghost" onClick={() => setFilters(emptyFilters())}>Clear all</button>}
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
            suggestions={removals}
            onRemove={removeFilter}
            onClearAll={() => setFilters(emptyFilters())}
            onAskAgain={() => { inputRef.current?.focus(); inputRef.current?.select(); }}
          />
        )}
        {index && result && page && page.totalServices > 0 && (
          <ResultsList page={page} index={index} result={result} filters={view.filters} sort={view.sort} compare={compare} hrefFor={hrefFor} />
        )}
      </main>

      {index && (
        <>
          <FilterDrawer
            open={sheetOpen} index={index} applied={view.filters} title={sheet.title} only={sheet.only}
            onClose={() => setSheetOpen(false)} onApply={setFilters}
          />
          <CompareTray index={index} ids={picked} onRemove={compare.toggle} onClear={() => setPicked([])} />
        </>
      )}
    </div>
  );
}
