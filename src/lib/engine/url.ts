import type { Currency, ServiceType } from '../data/types';
import { SORT_KEYS, type SortKey } from './results';
import { type Filters, emptyFilters } from './search';

export interface ViewState {
  filters: Filters;
  sort: SortKey;
  page: number;
}

const TYPES: ServiceType[] = ['package', 'lab_test', 'wellness', 'service', 'insurance'];
const CURRENCIES: Currency[] = ['THB', 'NPR', 'INR'];

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

const list = (v: string | undefined) => (v ? v.split(',').filter(Boolean) : []);
const number = (v: string | undefined) => {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Reads a view from the URL. Anything unrecognised is ignored, never an error. */
export function parseView(params: Params): ViewState {
  const f = emptyFilters();
  f.types = list(read(params, 'type')).filter((t): t is ServiceType => TYPES.includes(t as ServiceType));
  f.categories = list(read(params, 'cat'));
  f.subcategories = list(read(params, 'sub'));
  f.providers = list(read(params, 'provider')).map(Number).filter(Number.isInteger);
  f.places = list(read(params, 'place')).filter((p) => /^(country|city):.+/.test(p));
  f.homeTest = read(params, 'home') === '1';
  f.q = read(params, 'q') ?? '';

  const cur = read(params, 'cur') as Currency | undefined;
  if (cur && CURRENCIES.includes(cur)) {
    const min = number(read(params, 'min'));
    const max = number(read(params, 'max'));
    f.price = { currency: cur, ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
  }

  const sort = read(params, 'sort') as SortKey | undefined;
  const page = Math.floor(Number(read(params, 'page')));
  return { filters: f, sort: sort && SORT_KEYS.includes(sort) ? sort : 'relevance', page: page >= 1 ? page : 1 };
}

/** Canonical query string: same view, same string, so links are shareable and stable. */
export function serializeView({ filters: f, sort, page }: ViewState): string {
  const p = new URLSearchParams();
  const put = (k: string, v: string | undefined) => v && p.set(k, v);
  put('q', f.q.trim());
  put('type', [...f.types].sort().join(','));
  put('cat', [...f.categories].sort().join(','));
  put('sub', [...f.subcategories].sort().join(','));
  put('provider', [...f.providers].sort((a, b) => a - b).join(','));
  put('place', [...f.places].sort().join(','));
  put('home', f.homeTest ? '1' : undefined);
  if (f.price) {
    p.set('cur', f.price.currency);
    if (f.price.min !== undefined) p.set('min', String(f.price.min));
    if (f.price.max !== undefined) p.set('max', String(f.price.max));
  }
  if (sort !== 'relevance') p.set('sort', sort);
  if (page > 1) p.set('page', String(page));
  return p.toString();
}
