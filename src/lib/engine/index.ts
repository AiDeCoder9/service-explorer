import type { Category, Currency, NormalizedDataset, Provider, Service, ServiceType } from '../data/types';
import { type Bitset, createBitset, setBit } from './bitset';

export const UNCATEGORISED = '__none__';

export interface FacetOption {
  key: string;
  label: string;
  bits: Bitset;
  /** subcategory -> its category id; city -> its country key */
  parent?: string;
  /** categories only: package / lab_test / ..., because slugs repeat across types */
  type?: ServiceType;
}

export interface SearchIndex {
  size: number;
  services: Service[];
  providers: Map<number, Provider>;
  categories: Map<string, Category>;
  type: FacetOption[];
  category: FacetOption[];
  subcategory: FacetOption[];
  provider: FacetOption[];
  place: FacetOption[];
  homeTest: Bitset;
  currency: Record<Currency, Bitset>;
  /** lowercase, accent-free text each service can be found by */
  haystack: string[];
  titleNorm: string[];
  /** price a customer compares on: final price, or the cheapest wellness option; null if unverified */
  comparePrice: (number | null)[];
}

export const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function optionMap(size: number) {
  const map = new Map<string, FacetOption>();
  return {
    get(key: string, label: string, extra: Partial<FacetOption> = {}) {
      let o = map.get(key);
      if (!o) map.set(key, (o = { key, label, bits: createBitset(size), ...extra }));
      return o;
    },
    list: () => [...map.values()],
  };
}

export function buildIndex(data: NormalizedDataset): SearchIndex {
  const size = data.services.length;
  const providers = new Map(data.providers.map((p) => [p.id, p]));
  const categories = new Map(data.categories.map((c) => [c.id, c]));

  const type = optionMap(size);
  const category = optionMap(size);
  const subcategory = optionMap(size);
  const provider = optionMap(size);
  const place = optionMap(size);
  const homeTest = createBitset(size);
  const currency = { THB: createBitset(size), NPR: createBitset(size), INR: createBitset(size) };
  const haystack: string[] = [];
  const titleNorm: string[] = [];
  const comparePrice: (number | null)[] = [];

  data.services.forEach((s, i) => {
    const p = providers.get(s.providerId)!;
    const cat = s.categoryId ? categories.get(s.categoryId) : undefined;
    const sub = s.subCategoryId ? categories.get(s.subCategoryId) : undefined;

    setBit(type.get(s.type, s.type).bits, i);
    if (cat) setBit(category.get(cat.id, cat.title, { type: cat.type }).bits, i);
    else setBit(category.get(UNCATEGORISED, 'Uncategorised').bits, i);
    if (sub) setBit(subcategory.get(sub.id, sub.title, { parent: sub.parentId ?? undefined, type: sub.type }).bits, i);
    setBit(provider.get(String(p.id), p.name).bits, i);
    if (p.country) {
      const countryKey = `country:${p.country}`;
      setBit(place.get(countryKey, p.country).bits, i);
      if (p.city) setBit(place.get(`city:${p.city}`, p.city, { parent: countryKey }).bits, i);
    }
    if (s.testAtHome) setBit(homeTest, i);
    setBit(currency[s.currency], i);

    titleNorm.push(normalizeText(s.title));
    haystack.push(normalizeText([s.title, p.name, cat?.title, sub?.title].filter(Boolean).join(' ')));
    comparePrice.push(
      s.pricing.kind === 'fixed' ? s.pricing.price.final : s.pricing.kind === 'wellness' ? s.pricing.from.price.final : null,
    );
  });

  const sortByLabel = (a: FacetOption, b: FacetOption) => a.label.localeCompare(b.label);

  return {
    size, services: data.services, providers, categories,
    type: type.list().sort(sortByLabel),
    category: category.list().sort(sortByLabel),
    subcategory: subcategory.list().sort(sortByLabel),
    provider: provider.list().sort(sortByLabel),
    place: place.list().sort(sortByLabel),
    homeTest, currency, haystack, titleNorm, comparePrice,
  };
}
