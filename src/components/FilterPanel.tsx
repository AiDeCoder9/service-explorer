'use client';

import { useId, useState } from 'react';
import type { Currency } from '@/lib/data/types';
import { FILTER_LABEL, activeNames, clearFilter } from '@/lib/engine/filters';
import type { FacetOption, SearchIndex } from '@/lib/engine';
import { type FacetName, type Filters, type SearchResult, explainZero } from '@/lib/engine/search';
import { TYPE_LABEL, formatMoney } from '@/lib/format';

export type PanelGroup = 'type' | 'category' | 'provider' | 'place' | 'price' | 'home';

interface PanelProps {
  index: SearchIndex;
  filters: Filters;
  result: SearchResult;
  onChange: (next: Filters) => void;
  /** show only these groups (default: all) */
  only?: PanelGroup[];
}

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const n = (count: number) => count.toLocaleString('en');

interface RowProps {
  id: string;
  label: string;
  tag?: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
  hint?: { text: string; apply: () => void } | null;
}

/**
 * An option with zero results is disabled, not hidden: the list never jumps
 * around under the pointer, and the row can say why and offer a way out.
 * It stays focusable (aria-disabled) so keyboard and screen reader users meet the reason too.
 */
function OptionRow({ id, label, tag, count, checked, onToggle, hint }: RowProps) {
  const disabled = count === 0 && !checked;
  return (
    <li className="opt" data-disabled={disabled || undefined}>
      <label>
        <input
          type="checkbox"
          checked={checked}
          aria-disabled={disabled || undefined}
          aria-describedby={disabled && hint ? `${id}-hint` : undefined}
          onChange={() => { if (!disabled) onToggle(); }}
        />
        <span className="opt-label">
          {label}
          {tag && <span className="tag">{tag}</span>}
        </span>
        <span className="count" aria-label={`${count} results`}>{n(count)}</span>
      </label>
      {disabled && hint && (
        <button type="button" id={`${id}-hint`} className="hint" onClick={hint.apply}>{hint.text}</button>
      )}
    </li>
  );
}

export function FilterPanel({ index, filters, result, onChange, only }: PanelProps) {
  const show = (g: PanelGroup) => !only || only.includes(g);
  const uid = useId();
  const [providerQuery, setProviderQuery] = useState('');

  const hintFor = (facet: FacetName, key: string) => {
    const top = explainZero(index, filters, facet, key)[0];
    if (!top) return null;
    return { text: `Clear ${FILTER_LABEL[top.remove]} to see ${n(top.count)}`, apply: () => onChange(clearFilter(filters, top.remove)) };
  };

  const row = (facet: FacetName, o: FacetOption, checked: boolean, onToggle: () => void, tag?: string) => (
    <OptionRow
      key={o.key} id={`${uid}-${facet}-${o.key}`} label={o.label} tag={tag}
      count={result.facets[facet][o.key] ?? 0} checked={checked} onToggle={onToggle}
      hint={(result.facets[facet][o.key] ?? 0) === 0 && !checked ? hintFor(facet, o.key) : null}
    />
  );

  const titleCount = new Map<string, number>();
  for (const o of index.category) titleCount.set(o.label, (titleCount.get(o.label) ?? 0) + 1);

  const providers = index.provider.filter((o) => o.label.toLowerCase().includes(providerQuery.trim().toLowerCase()));
  const countries = index.place.filter((o) => !o.parent);

  return (
    <div className="panel">
      {show('type') && <fieldset>
        <legend>Service type</legend>
        <ul>
          {index.type.map((o) =>
            row('type', { ...o, label: TYPE_LABEL[o.key as keyof typeof TYPE_LABEL] }, filters.types.includes(o.key as Filters['types'][number]),
              () => onChange({ ...filters, types: toggle(filters.types, o.key as Filters['types'][number]) })),
          )}
        </ul>
      </fieldset>}

      {show('category') && <fieldset>
        <legend>Category</legend>
        <ul>
          {index.category.map((o) => {
            const checked = filters.categories.includes(o.key);
            const subs = index.subcategory.filter((s) => s.parent === o.key);
            const dup = (titleCount.get(o.label) ?? 0) > 1 && o.type ? TYPE_LABEL[o.type].toLowerCase() : undefined;
            return (
              <li key={o.key} className="group">
                <ul>
                  {row('category', o, checked, () => {
                    const next = toggle(filters.categories, o.key);
                    const keepSubs = filters.subcategories.filter((s) => index.subcategory.find((x) => x.key === s)?.parent !== o.key || next.includes(o.key));
                    onChange({ ...filters, categories: next, subcategories: keepSubs });
                  }, dup)}
                </ul>
                {checked && subs.length > 0 && (
                  <ul className="nested" aria-label={`${o.label} subcategories`}>
                    {subs.map((s) => row('subcategory', s, filters.subcategories.includes(s.key), () => onChange({ ...filters, subcategories: toggle(filters.subcategories, s.key) })))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>}

      {show('provider') && <fieldset>
        <legend>Provider</legend>
        <input
          type="search" className="field" placeholder="Search providers" aria-label="Search providers"
          value={providerQuery} onChange={(e) => setProviderQuery(e.target.value)}
        />
        <ul className="scroll">
          {providers.map((o) => row('provider', o, filters.providers.includes(Number(o.key)), () => onChange({ ...filters, providers: toggle(filters.providers, Number(o.key)) })))}
          {providers.length === 0 && <li className="muted small">No provider named “{providerQuery}”.</li>}
        </ul>
      </fieldset>}

      {show('place') && <fieldset>
        <legend>Location</legend>
        <ul>
          {countries.map((c) => (
            <li key={c.key} className="group">
              <ul>{row('place', c, filters.places.includes(c.key), () => onChange({ ...filters, places: toggle(filters.places, c.key) }))}</ul>
              <ul className="nested" aria-label={`Cities in ${c.label}`}>
                {index.place.filter((p) => p.parent === c.key).map((p) => row('place', p, filters.places.includes(p.key), () => onChange({ ...filters, places: toggle(filters.places, p.key) })))}
              </ul>
            </li>
          ))}
        </ul>
      </fieldset>}

      {show('price') && <PriceFilter filters={filters} result={result} onChange={onChange} />}

      {show('home') && <fieldset>
        <legend>Home visit</legend>
        <ul>
          <OptionRow
            id={`${uid}-home`} label="Available as a home test" count={result.facets.homeTest}
            checked={filters.homeTest} onToggle={() => onChange({ ...filters, homeTest: !filters.homeTest })}
          />
        </ul>
      </fieldset>}

      {!only && activeNames(filters).length > 0 && (
        <button type="button" className="btn ghost clear-all" onClick={() => onChange({ ...filters, types: [], categories: [], subcategories: [], providers: [], places: [], homeTest: false, price: null, q: '' })}>
          Clear all filters
        </button>
      )}
    </div>
  );
}

const CURRENCIES: Currency[] = ['THB', 'NPR', 'INR'];

const parseAmount = (text: string): number | undefined | 'invalid' => {
  const t = text.replace(/,/g, '').trim();
  if (t === '') return undefined;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : 'invalid';
};

/**
 * Prices are in the provider's currency and MedEx has no exchange rates, so a
 * single slider across currencies would lie. The range belongs to one currency:
 * it follows the results (Bangkok means THB), and when results span several the
 * customer picks one on purpose.
 */
function PriceFilter({ filters, result, onChange }: Omit<PanelProps, 'index'>) {
  const counts = result.facets.currency;
  const available = CURRENCIES.filter((c) => counts[c] > 0 || filters.price?.currency === c);
  const active = filters.price?.currency ?? (available.length === 1 ? available[0]! : null);

  if (available.length === 0) {
    return <fieldset><legend>Price</legend><p className="muted small">No priced results to filter.</p></fieldset>;
  }

  const pick = (c: Currency) => onChange({ ...filters, price: { currency: c } });

  if (!active) {
    return (
      <fieldset>
        <legend>Price</legend>
        <p className="small">Your results are priced in {available.length} currencies, and prices are never converted. Choose one to filter by price.</p>
        <div className="seg">
          {available.map((c) => (
            <button key={c} type="button" className="btn" onClick={() => pick(c)}>
              {c} <span className="count">{n(counts[c])}</span>
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  const bounds = result.priceBounds[active];
  const price = filters.price?.currency === active ? filters.price : null;
  const commit = (field: 'min' | 'max', text: string) => {
    const v = parseAmount(text);
    if (v === 'invalid') return;
    const next = { currency: active, min: price?.min, max: price?.max, [field]: v };
    if (next.min !== undefined && next.max !== undefined && next.min > next.max) return;
    const clean = { currency: active, ...(next.min !== undefined && { min: next.min }), ...(next.max !== undefined && { max: next.max }) };
    onChange({ ...filters, price: price || v !== undefined ? clean : null });
  };

  return (
    <fieldset>
      <legend>Price</legend>
      {available.length > 1 && (
        <div className="seg" role="group" aria-label="Currency">
          {available.map((c) => (
            <button key={c} type="button" className="btn" aria-pressed={c === active} onClick={() => pick(c)}>{c}</button>
          ))}
        </div>
      )}
      <p className="small muted">Pricing in {active}. {available.length > 1 ? 'Other currencies are left out, not converted.' : ''}</p>
      <div className="range">
        <AmountInput label={`Min (${active})`} value={price?.min} placeholder={bounds ? formatMoney(bounds.min, active).replace(/\.00$/, '') : ''} onCommit={(t) => commit('min', t)} />
        <AmountInput label={`Max (${active})`} value={price?.max} placeholder={bounds ? formatMoney(bounds.max, active).replace(/\.00$/, '') : ''} onCommit={(t) => commit('max', t)} />
      </div>
      {filters.price && <button type="button" className="btn ghost" onClick={() => onChange({ ...filters, price: null })}>Clear price</button>}
    </fieldset>
  );
}

function AmountInput({ label, value, placeholder, onCommit }: { label: string; value: number | undefined; placeholder: string; onCommit: (text: string) => void }) {
  // Commit on blur or Enter, so every keystroke does not rewrite the URL.
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setText(value === undefined ? '' : String(value)); }
  const invalid = parseAmount(text) === 'invalid';
  return (
    <label className="amount">
      <span className="small">{label}</span>
      <input
        className="field" inputMode="decimal" value={text} placeholder={placeholder} aria-invalid={invalid || undefined}
        onChange={(e) => setText(e.target.value)} onBlur={() => onCommit(text)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(text); }}
      />
    </label>
  );
}
