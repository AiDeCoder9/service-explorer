'use client';

import { useEffect, useRef, useState } from 'react';
import type { SearchIndex } from '@/lib/engine';
import { TYPE_SINGULAR } from '@/lib/format';
import { PriceBlock, Rating } from './Results';

export const MAX_COMPARE = 3;

interface Props {
  index: SearchIndex;
  ids: string[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** A sticky tray that collects up to three services and opens them side by side. */
export function CompareTray({ index, ids, onRemove, onClear }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const picked = ids.map((id) => index.services.find((s) => s.id === id)).filter((s) => !!s);
  const currencies = new Set(picked.map((s) => s.currency));

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => { if (picked.length < 2) setOpen(false); }, [picked.length]);

  if (picked.length === 0) return null;
  return (
    <>
      <div className="tray" role="region" aria-label="Compare">
        <span className="tray-items">{picked.map((s) => s.title).join(' · ')}</span>
        <button type="button" className="btn ghost" onClick={onClear}>Clear</button>
        <button type="button" className="btn primary" disabled={picked.length < 2} onClick={() => setOpen(true)}>
          {picked.length < 2 ? 'Pick one more' : `Compare ${picked.length}`}
        </button>
      </div>
      <dialog ref={ref} className="compare" aria-labelledby="compare-title" onClose={() => setOpen(false)}>
        <div className="drawer-head">
          <h2 id="compare-title">Compare services</h2>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="drawer-body">
          {currencies.size > 1 && <p className="small muted" style={{ marginBottom: 12 }}>These are priced in different currencies and are never converted, so prices can’t be ranked against each other.</p>}
          <div className="compare-table">
            <table>
              <thead>
                <tr><td />{picked.map((s) => <th key={s.id} scope="col">{s.title}</th>)}</tr>
              </thead>
              <tbody>
                <tr><th scope="row">Provider</th>{picked.map((s) => <td key={s.id}>{index.providers.get(s.providerId)?.name}</td>)}</tr>
                <tr><th scope="row">Where</th>{picked.map((s) => { const p = index.providers.get(s.providerId); return <td key={s.id}>{[p?.city, p?.country].filter(Boolean).join(', ')}</td>; })}</tr>
                <tr><th scope="row">Type</th>{picked.map((s) => <td key={s.id}>{TYPE_SINGULAR[s.type]}</td>)}</tr>
                <tr><th scope="row">Price</th>{picked.map((s) => <td key={s.id}><PriceBlock service={s} align="start" /></td>)}</tr>
                <tr><th scope="row">Rating</th>{picked.map((s) => { const p = index.providers.get(s.providerId); return <td key={s.id}>{p && <Rating provider={p} />}</td>; })}</tr>
                <tr><th scope="row">Home test</th>{picked.map((s) => <td key={s.id}>{s.testAtHome ? 'Available' : 'No'}</td>)}</tr>
                <tr><th scope="row" />{picked.map((s) => <td key={s.id}><button type="button" className="btn ghost" onClick={() => onRemove(s.id)}>Remove</button></td>)}</tr>
              </tbody>
            </table>
          </div>
        </div>
      </dialog>
    </>
  );
}
