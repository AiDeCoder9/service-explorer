import { TYPE_LABEL } from '../format';
import type { SearchIndex } from './index';
import { type FilterName, type Filters, search } from './search';

export const FILTER_LABEL: Record<FilterName, string> = {
  type: 'service type', category: 'category', subcategory: 'subcategory', provider: 'provider',
  place: 'location', homeTest: 'home test', price: 'price', q: 'search',
};

const ORDER: FilterName[] = ['q', 'type', 'category', 'subcategory', 'provider', 'place', 'price', 'homeTest'];

export function clearFilter(f: Filters, name: FilterName): Filters {
  switch (name) {
    case 'type': return { ...f, types: [] };
    case 'category': return { ...f, categories: [], subcategories: [] };
    case 'subcategory': return { ...f, subcategories: [] };
    case 'provider': return { ...f, providers: [] };
    case 'place': return { ...f, places: [] };
    case 'homeTest': return { ...f, homeTest: false };
    case 'price': return { ...f, price: null };
    case 'q': return { ...f, q: '' };
  }
}

export function activeNames(f: Filters): FilterName[] {
  const on: Record<FilterName, boolean> = {
    type: f.types.length > 0, category: f.categories.length > 0, subcategory: f.subcategories.length > 0,
    provider: f.providers.length > 0, place: f.places.length > 0, homeTest: f.homeTest, price: f.price !== null,
    q: f.q.trim() !== '',
  };
  return ORDER.filter((n) => on[n]);
}

export interface Chip {
  id: string;
  label: string;
  /** the filters you get by removing just this chip */
  without: Filters;
}

const without = <T,>(list: T[], v: T) => list.filter((x) => x !== v);

/** One chip per selected value, so each can be removed on its own. */
export function activeChips(index: SearchIndex, f: Filters): Chip[] {
  const chips: Chip[] = [];
  const titleCount = new Map<string, number>();
  for (const o of index.category) titleCount.set(o.label, (titleCount.get(o.label) ?? 0) + 1);

  if (f.q.trim()) chips.push({ id: 'q', label: `“${f.q.trim()}”`, without: { ...f, q: '' } });
  for (const t of f.types) chips.push({ id: `type:${t}`, label: TYPE_LABEL[t], without: { ...f, types: without(f.types, t) } });
  for (const key of f.categories) {
    const o = index.category.find((c) => c.key === key);
    const dup = o && (titleCount.get(o.label) ?? 0) > 1 && o.type ? ` (${TYPE_LABEL[o.type].toLowerCase()})` : '';
    const subs = f.subcategories.filter((s) => index.subcategory.find((x) => x.key === s)?.parent !== key);
    chips.push({ id: `cat:${key}`, label: `${o?.label ?? key}${dup}`, without: { ...f, categories: without(f.categories, key), subcategories: subs } });
  }
  for (const key of f.subcategories) {
    const o = index.subcategory.find((c) => c.key === key);
    chips.push({ id: `sub:${key}`, label: o?.label ?? key, without: { ...f, subcategories: without(f.subcategories, key) } });
  }
  for (const id of f.providers) {
    const o = index.provider.find((p) => p.key === String(id));
    chips.push({ id: `provider:${id}`, label: o?.label ?? `Provider ${id}`, without: { ...f, providers: without(f.providers, id) } });
  }
  for (const key of f.places) {
    const o = index.place.find((p) => p.key === key);
    chips.push({ id: `place:${key}`, label: o?.label ?? key, without: { ...f, places: without(f.places, key) } });
  }
  if (f.price) {
    const { currency, min, max } = f.price;
    const range = min !== undefined && max !== undefined ? `${min}–${max}` : min !== undefined ? `from ${min}` : max !== undefined ? `up to ${max}` : 'any price';
    chips.push({ id: 'price', label: `${currency} ${range}`, without: { ...f, price: null } });
  }
  if (f.homeTest) chips.push({ id: 'home', label: 'Home test', without: { ...f, homeTest: false } });
  return chips;
}

/** For an empty result: which single filter, removed, brings the most results back. */
export function suggestRemovals(index: SearchIndex, f: Filters): { name: FilterName; label: string; total: number }[] {
  return activeNames(f)
    .map((name) => ({ name, label: FILTER_LABEL[name], total: search(index, clearFilter(f, name)).total }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);
}
