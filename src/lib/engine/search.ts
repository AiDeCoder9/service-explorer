import type { Currency, ServiceType } from '../data/types';
import { type Bitset, andInto, createBitset, forEachBit, fullBitset, popcount, popcountAnd } from './bitset';
import { type FacetOption, type SearchIndex, normalizeText } from './index';

export interface PriceFilter {
  currency: Currency;
  min?: number;
  max?: number;
}

export interface Filters {
  types: ServiceType[];
  categories: string[];
  subcategories: string[];
  providers: number[];
  /** `country:Thailand` or `city:Bangkok` */
  places: string[];
  homeTest: boolean;
  price: PriceFilter | null;
  q: string;
}

export const emptyFilters = (): Filters => ({
  types: [], categories: [], subcategories: [], providers: [], places: [], homeTest: false, price: null, q: '',
});

export type FilterName = 'type' | 'category' | 'subcategory' | 'provider' | 'place' | 'homeTest' | 'price' | 'q';
const NAMES: FilterName[] = ['type', 'category', 'subcategory', 'provider', 'place', 'homeTest', 'price', 'q'];

export type Counts = Record<string, number>;

export interface SearchResult {
  /** services that match every active filter */
  mask: Bitset;
  total: number;
  /** option key -> how many results choosing it would lead to, given all OTHER filters */
  facets: {
    type: Counts; category: Counts; subcategory: Counts; provider: Counts; place: Counts;
    homeTest: number; currency: Record<Currency, number>;
  };
  /** compare-price bounds per currency, given every filter except price */
  priceBounds: Partial<Record<Currency, { min: number; max: number }>>;
}

function unionOf(size: number, options: FacetOption[], keys: string[]): Bitset | null {
  if (keys.length === 0) return null;
  const out = createBitset(size);
  const wanted = new Set(keys);
  for (const o of options) if (wanted.has(o.key)) for (let i = 0; i < out.length; i++) out[i]! |= o.bits[i]!;
  return out;
}

function priceMask(index: SearchIndex, f: PriceFilter): Bitset {
  const out = createBitset(index.size);
  const inCurrency = index.currency[f.currency];
  for (let i = 0; i < index.size; i++) {
    if (!(inCurrency[i >>> 5]! & (1 << (i & 31)))) continue;
    const p = index.comparePrice[i];
    if (p === null || p === undefined) continue; // unverified prices never match a price filter
    if (f.min !== undefined && p < f.min) continue;
    if (f.max !== undefined && p > f.max) continue;
    out[i >>> 5]! |= 1 << (i & 31);
  }
  return out;
}

function textMask(index: SearchIndex, q: string): Bitset {
  const tokens = normalizeText(q).split(' ').filter(Boolean);
  const out = createBitset(index.size);
  for (let i = 0; i < index.size; i++) {
    const h = index.haystack[i]!;
    if (tokens.every((t) => h.includes(t))) out[i >>> 5]! |= 1 << (i & 31);
  }
  return out;
}

/** One mask per filter; null means that filter is inactive. */
function filterMasks(index: SearchIndex, f: Filters): Record<FilterName, Bitset | null> {
  return {
    type: unionOf(index.size, index.type, f.types),
    category: unionOf(index.size, index.category, f.categories),
    subcategory: unionOf(index.size, index.subcategory, f.subcategories),
    provider: unionOf(index.size, index.provider, f.providers.map(String)),
    place: unionOf(index.size, index.place, f.places),
    homeTest: f.homeTest ? index.homeTest : null,
    price: f.price ? priceMask(index, f.price) : null,
    q: normalizeText(f.q) ? textMask(index, f.q) : null,
  };
}

function combine(index: SearchIndex, masks: Record<FilterName, Bitset | null>, skip: FilterName[] = []): Bitset {
  const out = fullBitset(index.size);
  for (const name of NAMES) {
    const m = masks[name];
    if (m && !skip.includes(name)) andInto(out, m);
  }
  return out;
}

const countOptions = (options: FacetOption[], base: Bitset): Counts =>
  Object.fromEntries(options.map((o) => [o.key, popcountAnd(base, o.bits)]));

export function search(index: SearchIndex, filters: Filters): SearchResult {
  const masks = filterMasks(index, filters);
  const mask = combine(index, masks);

  const without = (name: FilterName) => combine(index, masks, [name]);
  const baseNoPrice = without('price');

  const priceBounds: SearchResult['priceBounds'] = {};
  forEachBit(baseNoPrice, (i) => {
    const p = index.comparePrice[i];
    if (p === null || p === undefined) return;
    const c = index.services[i]!.currency;
    const b = priceBounds[c];
    if (!b) priceBounds[c] = { min: p, max: p };
    else {
      if (p < b.min) b.min = p;
      if (p > b.max) b.max = p;
    }
  });

  return {
    mask,
    total: popcount(mask),
    facets: {
      type: countOptions(index.type, without('type')),
      category: countOptions(index.category, without('category')),
      subcategory: countOptions(index.subcategory, without('subcategory')),
      provider: countOptions(index.provider, without('provider')),
      place: countOptions(index.place, without('place')),
      homeTest: popcountAnd(without('homeTest'), index.homeTest),
      currency: {
        THB: popcountAnd(baseNoPrice, index.currency.THB),
        NPR: popcountAnd(baseNoPrice, index.currency.NPR),
        INR: popcountAnd(baseNoPrice, index.currency.INR),
      },
    },
    priceBounds,
  };
}

export type FacetName = 'type' | 'category' | 'subcategory' | 'provider' | 'place';

/**
 * For an option with zero results: which single other filter, if removed, would
 * make it non-empty, and how many results that would give. Powers messages like
 * "0 here. Remove Bangkok to get 41."
 */
export function explainZero(
  index: SearchIndex, filters: Filters, facet: FacetName, optionKey: string,
): { remove: FilterName; count: number }[] {
  const option = index[facet].find((o) => o.key === optionKey);
  if (!option) return [];
  const masks = filterMasks(index, filters);
  const out: { remove: FilterName; count: number }[] = [];
  for (const name of NAMES) {
    if (name === facet || !masks[name]) continue;
    const count = popcountAnd(combine(index, masks, [facet, name]), option.bits);
    if (count > 0) out.push({ remove: name, count });
  }
  return out.sort((a, b) => b.count - a.count);
}
