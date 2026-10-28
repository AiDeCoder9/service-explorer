'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import type { Price, Service } from '@/lib/data/types';
import type { SearchIndex } from '@/lib/engine';
import { type ProviderGroup, type ResultPage, type SortKey, providerServices } from '@/lib/engine/results';
import type { Filters, SearchResult } from '@/lib/engine/search';
import { TYPE_SINGULAR, formatMoney, plural } from '@/lib/format';

export function PriceBlock({ service, align }: { service: Service; align?: 'start' }) {
  const { pricing: p, currency: c } = service;
  const cls = 'price';
  const style = align === 'start' ? { textAlign: 'left' as const } : undefined;
  if (p.kind === 'unverified') return <div className="price" style={style}><span className="muted">Price on request</span></div>;

  const show = (price: Price) => {
    if (price.isFree) return <strong>Free</strong>;
    return (
      <>
        <strong>{formatMoney(price.final, c)}</strong>
        {price.discountAmount > 0 && <s className="was"><span className="sr-only">was </span>{formatMoney(price.list, c)}</s>}
        {price.chargeAmount > 0 && <div className="muted small">incl. service charge</div>}
      </>
    );
  };

  if (p.kind === 'wellness') {
    return (
      <div className={cls} style={style}>
        <span className="muted small">from </span>{show(p.from.price)}
        <div className="muted small">{p.from.minutes} min{p.options.length > 1 ? ` · ${p.options.length} durations` : ''}</div>
      </div>
    );
  }
  return <div className={cls} style={style}>{show(p.price)}</div>;
}

export interface CompareState { ids: string[]; toggle: (id: string) => void; full: boolean }

function ServiceRow({ service, where, compare }: { service: Service; where: string; compare: CompareState }) {
  const on = compare.ids.includes(service.id);
  return (
    <li className="service">
      <div className="service-main">
        <span className="service-title">{service.title}</span>
        <span className="muted small">
          {[TYPE_SINGULAR[service.type], where].filter(Boolean).join(' · ')}{service.testAtHome ? ' · Home test available' : ''}
        </span>
        <label className="cmp">
          <input type="checkbox" checked={on} disabled={!on && compare.full} onChange={() => compare.toggle(service.id)} />
          Compare<span className="sr-only"> {service.title}</span>
        </label>
      </div>
      <PriceBlock service={service} />
    </li>
  );
}

export function Rating({ provider }: { provider: ProviderGroup['provider'] }) {
  if (provider.rating === null) return <span className="badge">New on MedEx</span>;
  return (
    <span aria-label={`Rated ${provider.rating} out of 5${provider.reviewCount ? ` from ${provider.reviewCount} reviews` : ''}`}>
      <span aria-hidden="true">★ {provider.rating.toFixed(1)}</span>
      {provider.reviewCount ? <span className="muted small" aria-hidden="true"> ({provider.reviewCount.toLocaleString('en')})</span> : null}
    </span>
  );
}

interface CardProps {
  group: ProviderGroup;
  index: SearchIndex;
  result: SearchResult;
  filters: Filters;
  sort: SortKey;
  compare: CompareState;
}

function ProviderCard({ group, index, result, filters, sort, compare }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const all = useMemo(
    () => (expanded ? providerServices(index, result, filters, sort, group.provider.id) : group.services),
    [expanded, index, result, filters, sort, group],
  );
  const { provider, total } = group;
  // Same-title listings at one provider differ by category, so show it to tell them apart.
  const where = (s: Service) => index.categories.get(s.subCategoryId ?? s.categoryId ?? '')?.title ?? '';
  return (
    <article className="card">
      <header>
        <div className="who">
          <span className="avatar" aria-hidden="true">{provider.name.trim().charAt(0).toUpperCase()}</span>
          <div>
            <h3>{provider.name}</h3>
            <p className="muted small">{[provider.city, provider.country].filter(Boolean).join(', ')} · {group.currency}</p>
          </div>
        </div>
        <Rating provider={provider} />
      </header>
      <ul className="services" id={listId}>
        {all.map((s) => <ServiceRow key={s.id} service={s} where={where(s)} compare={compare} />)}
      </ul>
      {total > group.services.length && (
        <button type="button" className="btn ghost" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show fewer' : `View all ${plural(total, 'service')}`}
        </button>
      )}
    </article>
  );
}

interface ListProps extends Omit<CardProps, 'group'> {
  page: ResultPage;
  hrefFor: (page: number) => string;
}

export function ResultsList({ page, index, result, filters, sort, compare, hrefFor }: ListProps) {
  let previous: string | null = null;
  return (
    <>
      <ol className="cards">
        {page.groups.map((g) => {
          const band = page.banded && g.currency !== previous ? g.currency : null;
          previous = g.currency;
          return (
            <li key={g.provider.id} className="card-wrap">
              {band && <h3 className="band">Prices in {band} <span className="muted small">· not compared with other currencies</span></h3>}
              <ProviderCard group={g} index={index} result={result} filters={filters} sort={sort} compare={compare} />
            </li>
          );
        })}
      </ol>
      {page.pageCount > 1 && (
        <nav className="pager" aria-label="Pagination">
          {page.page > 1 ? <Link className="btn" href={hrefFor(page.page - 1)} rel="prev">Previous</Link> : <span className="btn" aria-disabled="true">Previous</span>}
          <span aria-current="page">Page {page.page} of {page.pageCount}</span>
          {page.page < page.pageCount ? <Link className="btn" href={hrefFor(page.page + 1)} rel="next">Next</Link> : <span className="btn" aria-disabled="true">Next</span>}
        </nav>
      )}
    </>
  );
}

/** Same footprint as real cards, so nothing shifts when results arrive. */
export function ResultsSkeleton() {
  return (
    <div className="cards" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="card skeleton">
          <div className="sk sk-title" />
          <div className="sk sk-line" /><div className="sk sk-line" /><div className="sk sk-line short" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state" role="alert">
      <h2>We couldn’t load services</h2>
      <p className="muted">{message} Nothing is wrong with your filters.</p>
      <button type="button" className="btn primary" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function EmptyState({ suggestions, onRemove, onClearAll, onAskAgain }: {
  suggestions: { name: string; label: string; total: number }[];
  onRemove: (name: string) => void;
  onClearAll: () => void;
  onAskAgain: () => void;
}) {
  return (
    <div className="state">
      <h2>No services match these filters</h2>
      <p className="muted">{suggestions.length > 0 ? 'The quickest ways back to results, best first:' : 'Nothing is left to relax. Start again or ask differently.'}</p>
      <div className="suggest">
        {suggestions.slice(0, 3).map((s) => (
          <button key={s.name} type="button" className="btn" onClick={() => onRemove(s.name)}>
            Remove the {s.label} filter <span className="count">{s.total.toLocaleString('en')} results</span>
          </button>
        ))}
        <button type="button" className="btn ghost" onClick={onAskAgain}>Ask differently</button>
        <button type="button" className="btn ghost" onClick={onClearAll}>Clear all filters</button>
      </div>
    </div>
  );
}
