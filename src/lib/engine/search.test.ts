import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeDataset } from '../data/normalize';
import type { RawDataset, Service } from '../data/types';
import { buildIndex, normalizeText, UNCATEGORISED } from './index';
import { type Filters, type FacetName, emptyFilters, explainZero, search } from './search';

const raw = JSON.parse(readFileSync(new URL('../../../data/task1-service-explorer.json', import.meta.url), 'utf8')) as RawDataset;
const data = normalizeDataset(raw);
const index = buildIndex(data);
const providerOf = (s: Service) => index.providers.get(s.providerId)!;

// ---- Brute-force oracle: no bitsets, just loops over the services ----
type Skip = keyof Filters | 'none';
function oracleMatches(s: Service, f: Filters, skip: Skip): boolean {
  const p = providerOf(s);
  const cat = index.categories.get(s.categoryId ?? '');
  const compare = s.pricing.kind === 'fixed' ? s.pricing.price.final : s.pricing.kind === 'wellness' ? s.pricing.from.price.final : null;
  if (skip !== 'types' && f.types.length && !f.types.includes(s.type)) return false;
  if (skip !== 'categories' && f.categories.length && !f.categories.includes(s.categoryId ?? UNCATEGORISED)) return false;
  if (skip !== 'subcategories' && f.subcategories.length && !(s.subCategoryId && f.subcategories.includes(s.subCategoryId))) return false;
  if (skip !== 'providers' && f.providers.length && !f.providers.includes(s.providerId)) return false;
  if (skip !== 'places' && f.places.length && !f.places.some((k) => k === `country:${p.country}` || k === `city:${p.city}`)) return false;
  if (skip !== 'homeTest' && f.homeTest && !s.testAtHome) return false;
  if (skip !== 'price' && f.price) {
    if (s.currency !== f.price.currency || compare === null) return false;
    if (f.price.min !== undefined && compare < f.price.min) return false;
    if (f.price.max !== undefined && compare > f.price.max) return false;
  }
  if (skip !== 'q') {
    const hay = normalizeText([s.title, p.name, cat?.title, index.categories.get(s.subCategoryId ?? '')?.title].filter(Boolean).join(' '));
    if (!normalizeText(f.q).split(' ').filter(Boolean).every((t) => hay.includes(t))) return false;
  }
  return true;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFilters(rand: () => number): Filters {
  const pick = <T,>(xs: T[], max: number) => (rand() < 0.4 ? [] : Array.from({ length: 1 + Math.floor(rand() * max) }, () => xs[Math.floor(rand() * xs.length)]!));
  const f = emptyFilters();
  f.types = pick(index.type.map((o) => o.key as Filters['types'][number]), 2);
  f.categories = pick(index.category.map((o) => o.key), 2);
  f.subcategories = pick(index.subcategory.map((o) => o.key), 2);
  f.providers = pick(index.provider.map((o) => Number(o.key)), 3);
  f.places = pick(index.place.map((o) => o.key), 2);
  f.homeTest = rand() < 0.2;
  if (rand() < 0.4) {
    const currency = (['THB', 'NPR', 'INR'] as const)[Math.floor(rand() * 3)]!;
    f.price = { currency, min: rand() < 0.5 ? Math.floor(rand() * 5000) : undefined, max: rand() < 0.7 ? 2000 + Math.floor(rand() * 20000) : undefined };
  }
  if (rand() < 0.3) f.q = ['check', 'blood test', 'Thyroid', 'ultra', 'vaccin', 'dental'][Math.floor(rand() * 6)]!;
  return f;
}

describe('facet counts stay correct with many filters active', () => {
  it('matches a brute-force oracle on 200 random filter combinations', () => {
    const rand = mulberry32(42);
    let multiFilter = 0;
    for (let n = 0; n < 200; n++) {
      const f = randomFilters(rand);
      const r = search(index, f);
      const active = [f.types, f.categories, f.subcategories, f.providers, f.places].filter((x) => x.length).length + (f.homeTest ? 1 : 0) + (f.price ? 1 : 0) + (f.q ? 1 : 0);
      if (active >= 3) multiFilter++;

      expect(r.total).toBe(index.services.filter((s) => oracleMatches(s, f, 'none')).length);

      const facetChecks: [FacetName, keyof Filters, (s: Service, key: string) => boolean][] = [
        ['type', 'types', (s, k) => s.type === k],
        ['category', 'categories', (s, k) => (s.categoryId ?? UNCATEGORISED) === k],
        ['subcategory', 'subcategories', (s, k) => s.subCategoryId === k],
        ['provider', 'providers', (s, k) => String(s.providerId) === k],
        ['place', 'places', (s, k) => k === `country:${providerOf(s).country}` || k === `city:${providerOf(s).city}`],
      ];
      for (const [facet, skip, has] of facetChecks) {
        const others = index.services.filter((s) => oracleMatches(s, f, skip));
        for (const o of index[facet]) {
          expect(r.facets[facet][o.key], `${facet}:${o.key} (case ${n})`).toBe(others.filter((s) => has(s, o.key)).length);
        }
      }
      expect(r.facets.homeTest).toBe(index.services.filter((s) => oracleMatches(s, f, 'homeTest') && s.testAtHome).length);
      const noPrice = index.services.filter((s) => oracleMatches(s, f, 'price'));
      for (const c of ['THB', 'NPR', 'INR'] as const) expect(r.facets.currency[c]).toBe(noPrice.filter((s) => s.currency === c).length);
    }
    expect(multiFilter).toBeGreaterThan(40); // the sample really exercised several filters at once
  });
});

describe('awkward cases', () => {
  it('keeps the two top-level "ultrasound" categories apart', () => {
    const twins = index.category.filter((o) => index.categories.get(o.key)?.slug === 'ultrasound');
    expect(twins.map((o) => o.type).sort()).toEqual(['lab_test', 'package']);
    const r = search(index, { ...emptyFilters(), categories: [twins[0]!.key] });
    expect(r.total).toBe(r.facets.category[twins[0]!.key]);
    expect(r.facets.category[twins[0]!.key]).not.toBe(r.facets.category[twins[1]!.key]);
  });

  it('counts uncategorised services as their own option', () => {
    const r = search(index, emptyFilters());
    expect(r.facets.category[UNCATEGORISED]).toBeGreaterThan(0);
    const sum = Object.values(r.facets.category).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.total);
  });

  it('never lets a price filter match across currencies or unverified prices', () => {
    const r = search(index, { ...emptyFilters(), price: { currency: 'THB', max: 1_000_000 } });
    for (const i of Array.from({ length: index.size }, (_, k) => k)) {
      const inMask = (r.mask[i >>> 5]! & (1 << (i & 31))) !== 0;
      if (inMask) expect(index.services[i]!.currency).toBe('THB');
      if (inMask) expect(index.comparePrice[i]).not.toBeNull();
    }
    expect(r.total).toBeGreaterThan(0);
  });

  it('finds text across title, provider and category, ignoring case and accents', () => {
    const f = { ...emptyFilters(), q: 'THYROID' };
    expect(search(index, f).total).toBe(search(index, { ...f, q: 'thyroïd' }).total);
    expect(search(index, f).total).toBeGreaterThan(0);
  });

  it('explains a zero: which removed filter would bring results back', () => {
    const bangkok = 'city:Bangkok';
    const r = search(index, { ...emptyFilters(), places: [bangkok] });
    const zero = index.provider.find((p) => r.facets.provider[p.key] === 0)!;
    expect(zero).toBeDefined();
    const filters = { ...emptyFilters(), places: [bangkok], providers: [] };
    const hints = explainZero(index, filters, 'provider', zero.key);
    expect(hints[0]?.remove).toBe('place');
    expect(hints[0]?.count).toBe(zero.bits.reduce((n, w) => n + w.toString(2).replace(/0/g, '').length, 0));
  });
});

describe('speed', () => {
  it('answers a heavy query well inside the 100 ms budget', () => {
    const f: Filters = { ...emptyFilters(), types: ['package', 'lab_test'], places: ['city:Bangkok'], price: { currency: 'THB', max: 5000 }, q: 'check' };
    search(index, f); // warm up
    const runs = Array.from({ length: 20 }, () => {
      const t = performance.now();
      search(index, f);
      return performance.now() - t;
    }).sort((a, b) => a - b);
    const median = runs[10]!;
    console.log(`search median ${median.toFixed(2)} ms, worst ${runs[19]!.toFixed(2)} ms over ${index.size} services`);
    expect(median).toBeLessThan(25);
  });
});
