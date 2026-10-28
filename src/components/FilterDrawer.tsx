'use client';

import { useEffect, useRef, useState } from 'react';
import type { SearchIndex } from '@/lib/engine';
import { type Filters, search } from '@/lib/engine/search';
import { FilterPanel, type PanelGroup } from './FilterPanel';

interface Props {
  open: boolean;
  index: SearchIndex;
  applied: Filters;
  onClose: () => void;
  onApply: (next: Filters) => void;
  title?: string;
  only?: PanelGroup[];
}

/**
 * Filter sheet (side panel on desktop, bottom sheet on phones). Choices are pending until the customer applies them, and the
 * button says how many results the pending choices will give, before applying.
 */
export function FilterDrawer({ open, index, applied, onClose, onApply, title = 'Filters', only }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(applied);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setPending(applied); d.showModal(); }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed only when opening
  }, [open]);

  const result = search(index, pending);

  return (
    <dialog ref={ref} className="drawer" aria-labelledby="drawer-title" onClose={onClose}>
      <div className="drawer-head">
        <h2 id="drawer-title">{title}</h2>
        <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">Close</button>
      </div>
      <div className="drawer-body">
        <FilterPanel index={index} filters={pending} result={result} onChange={setPending} only={only} />
      </div>
      <div className="drawer-foot">
        <button type="button" className="btn primary wide" aria-live="polite" onClick={() => { onApply(pending); onClose(); }}>
          {result.total === 0 ? 'No results' : `Show ${result.total.toLocaleString('en')} ${result.total === 1 ? 'result' : 'results'}`}
        </button>
      </div>
    </dialog>
  );
}
