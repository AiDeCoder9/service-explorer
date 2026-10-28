import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeDataset } from '../data/normalize';
import type { RawDataset } from '../data/types';
import { buildIndex } from './index';
import { PAGE_SIZE, SERVICES_PER_CARD, buildResultPage } from './results';
import { emptyFilters, search } from './search';
import { parseView, serializeView } from './url';

const raw = JSON.parse(readFileSync(new URL('../../../data/task1-service-explorer.json', import.meta.url), 'utf8')) as RawDataset;
const index = buildIndex(normalizeDataset(raw));
const page = (f = emptyFilters(), sort: Parameters<typeof buildResultPage>[3] = 'relevance', n = 1) =>
  buildResultPage(index, search(index, f), f, sort, n);

describe('provider groups', () => {
  it('shows at most 3 services per provider and the total reflects the filters', () => {
    const f = { ...emptyFilters(), types: ['lab_test' as const] };
    const r = page(f);
    for (const g of r.groups) {
      expect(g.services.length).toBeLessThanOrEqual(SERVICES_PER_CARD);
      expect(g.services.every((s) => s.type === 'lab_test' && s.providerId === g.provider.id)).toBe(true);
      const expected = index.services.filter((s) => s.providerId === g.provider.id && s.type === 'lab_test').length;
      expect(g.total).toBe(expected);
    }
  });

  it('paginates providers and clamps a page that is out of range', () => {
    const first = page();
    expect(first.groups).toHaveLength(PAGE_SIZE);
    expect(first.pageCount).toBe(Math.ceil(first.totalProviders / PAGE_SIZE));
    expect(page(emptyFilters(), 'relevance', 999).page).toBe(first.pageCount);
    expect(page(emptyFilters(), 'relevance', -3).page).toBe(1);
  });

  it('returns a single empty page when nothing matches', () => {
    const r = page({ ...emptyFilters(), q: 'zzzzzz' });
    expect(r).toMatchObject({ groups: [], totalProviders: 0, totalServices: 0, page: 1, pageCount: 1 });
  });
});

describe('sorting', () => {
  it('sorts providers by rating with unrated last', () => {
    const f = emptyFilters();
    const all = buildResultPage(index, search(index, f), f, 'rating', 1, 1000).groups.map((g) => g.provider.rating);
    const rated = all.filter((r): r is number => r !== null);
    expect(rated).toEqual([...rated].sort((a, b) => b - a));
    expect(all.slice(rated.length).every((r) => r === null)).toBe(true);
  });

  it('price sort orders services low to high inside a card, and in one currency never mixes bands', () => {
    const f = { ...emptyFilters(), price: { currency: 'THB' as const, max: 100000 } };
    const r = buildResultPage(index, search(index, f), f, 'price-asc', 1, 1000);
    expect(r.banded).toBe(false);
    expect(r.groups.every((g) => g.currency === 'THB')).toBe(true);
    for (const g of r.groups) {
      const prices = g.services.map((s) => (s.pricing.kind === 'fixed' ? s.pricing.price.final : s.pricing.kind === 'wellness' ? s.pricing.from.price.final : Infinity));
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    }
    const lows = r.groups.map((g) => Math.min(...g.services.map((s) => (s.pricing.kind === 'fixed' ? s.pricing.price.final : s.pricing.kind === 'wellness' ? s.pricing.from.price.final : Infinity))));
    expect(lows).toEqual([...lows].sort((a, b) => a - b));
  });

  it('keeps currencies in contiguous bands when a price sort spans several', () => {
    const r = buildResultPage(index, search(index, emptyFilters()), emptyFilters(), 'price-asc', 1, 1000);
    expect(r.banded).toBe(true);
    const seq = r.groups.map((g) => g.currency);
    const changes = seq.filter((c, i) => i > 0 && c !== seq[i - 1]).length;
    expect(changes).toBe(new Set(seq).size - 1);
  });

  it('relevance puts title matches first', () => {
    const f = { ...emptyFilters(), q: 'thyroid' };
    const top = page(f).groups[0]!;
    expect(top.services[0]!.title.toLowerCase()).toContain('thyroid');
  });
});

describe('URL as the source of truth', () => {
  it('round-trips a full view', () => {
    const view = {
      filters: { ...emptyFilters(), types: ['package' as const, 'lab_test' as const], categories: ['abc'], providers: [48, 5], places: ['city:Bangkok'], homeTest: true, price: { currency: 'THB' as const, min: 100, max: 5000 }, q: 'full body' },
      sort: 'price-asc' as const, page: 3,
    };
    const qs = serializeView(view);
    const back = parseView(new URLSearchParams(qs));
    expect(serializeView(back)).toBe(qs);
    expect(back.filters).toMatchObject({ providers: [5, 48], homeTest: true, price: { currency: 'THB', min: 100, max: 5000 }, q: 'full body' });
    expect(back.sort).toBe('price-asc');
    expect(back.page).toBe(3);
  });

  it('serialises the default view as an empty string', () => {
    expect(serializeView({ filters: emptyFilters(), sort: 'relevance', page: 1 })).toBe('');
  });

  it('ignores garbage instead of throwing', () => {
    const v = parseView(new URLSearchParams('type=nope,package&provider=x,7&cur=USD&min=-4&sort=magic&page=abc&place=bad,city:Pattaya'));
    expect(v.filters.types).toEqual(['package']);
    expect(v.filters.providers).toEqual([7]);
    expect(v.filters.price).toBeNull();
    expect(v.filters.places).toEqual(['city:Pattaya']);
    expect(v.sort).toBe('relevance');
    expect(v.page).toBe(1);
  });

  it('reads Next.js style search params objects', () => {
    expect(parseView({ type: 'service', page: '2', cat: ['a', 'b'] })).toMatchObject({ page: 2, filters: { types: ['service'], categories: ['a'] } });
  });

  it('a view restored from the URL gives the same results as the original', () => {
    const f = { ...emptyFilters(), places: ['city:Bangkok'], types: ['package' as const], price: { currency: 'THB' as const, max: 5000 } };
    const restored = parseView(new URLSearchParams(serializeView({ filters: f, sort: 'rating', page: 1 })));
    expect(search(index, restored.filters).total).toBe(search(index, f).total);
  });
});
