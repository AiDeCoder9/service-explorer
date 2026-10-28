import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeDataset } from '../data/normalize';
import type { RawDataset } from '../data/types';
import { activeChips, activeNames, clearFilter, suggestRemovals } from './filters';
import { buildIndex } from './index';
import { emptyFilters, search } from './search';

const raw = JSON.parse(readFileSync(new URL('../../../data/task1-service-explorer.json', import.meta.url), 'utf8')) as RawDataset;
const index = buildIndex(normalizeDataset(raw));

describe('filter helpers', () => {
  const f = { ...emptyFilters(), types: ['package' as const], places: ['city:Bangkok'], price: { currency: 'THB' as const, max: 5000 }, q: 'check' };

  it('lists active filters and clears one at a time', () => {
    expect(activeNames(f)).toEqual(['q', 'type', 'place', 'price']);
    expect(activeNames(clearFilter(f, 'price'))).toEqual(['q', 'type', 'place']);
    expect(clearFilter(f, 'price').types).toEqual(f.types);
  });

  it('makes one removable chip per selected value', () => {
    const chips = activeChips(index, { ...f, types: ['package', 'lab_test'] });
    expect(chips.map((c) => c.id)).toEqual(['q', 'type:package', 'type:lab_test', 'place:city:Bangkok', 'price']);
    const price = chips.find((c) => c.id === 'price')!;
    expect(price.without.price).toBeNull();
    expect(price.label).toBe('THB up to 5000');
  });

  it('removing a category chip also drops its subcategories', () => {
    const sub = index.subcategory[0]!;
    const g = { ...emptyFilters(), categories: [sub.parent!], subcategories: [sub.key] };
    const chip = activeChips(index, g).find((c) => c.id === `cat:${sub.parent}`)!;
    expect(chip.without.subcategories).toEqual([]);
  });

  it('tells the two ultrasound categories apart in chips', () => {
    const twins = index.category.filter((o) => o.label === 'Ultrasound');
    const chips = activeChips(index, { ...emptyFilters(), categories: twins.map((t) => t.key) });
    expect(new Set(chips.map((c) => c.label)).size).toBe(2);
  });

  it('suggests the removal that brings back the most results, never a useless one', () => {
    const empty = { ...f, q: 'zzzz' };
    expect(search(index, empty).total).toBe(0);
    const s = suggestRemovals(index, empty);
    expect(s[0]!.name).toBe('q');
    expect(s.every((x) => x.total > 0)).toBe(true);
    expect(s.map((x) => x.total)).toEqual([...s.map((x) => x.total)].sort((a, b) => b - a));
  });
});
