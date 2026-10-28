import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeDataset } from '../data/normalize';
import type { RawDataset } from '../data/types';
import { parseIntent } from './intent';
import { buildIndex } from './index';

const raw = JSON.parse(readFileSync(new URL('../../../data/task1-service-explorer.json', import.meta.url), 'utf8')) as RawDataset;
const index = buildIndex(normalizeDataset(raw));

describe('parseIntent', () => {
  it('reads type, city and a price ceiling', () => {
    const { filters, structured } = parseIntent('thyroid tests in Bangkok under 2000 THB', index);
    expect(structured).toBe(true);
    expect(filters.types).toEqual(['lab_test']);
    expect(filters.places).toEqual(['city:Bangkok']);
    expect(filters.price).toEqual({ currency: 'THB', max: 2000 });
    expect(filters.q).toBe('thyroid');
  });

  it('reads ranges, k suffixes and currency symbols', () => {
    expect(parseIntent('check-up between 1,000 and 5k thb', index).filters.price).toEqual({ currency: 'THB', min: 1000, max: 5000 });
    expect(parseIntent('packages over ₹3000', index).filters.price).toEqual({ currency: 'INR', min: 3000 });
  });

  it('infers currency from the place when none is given', () => {
    const { filters } = parseIntent('packages in Bangkok below 4000', index);
    expect(filters.price).toEqual({ currency: 'THB', max: 4000 });
  });

  it('reads home visit and sort words', () => {
    const a = parseIntent('cheapest home visit blood test', index);
    expect(a.filters.homeTest).toBe(true);
    expect(a.sort).toBe('price-asc');
    expect(parseIntent('best rated wellness', index).sort).toBe('rating');
  });

  it('keeps unrecognised words as a keyword search', () => {
    const r = parseIntent('asdfgh', index);
    expect(r.structured).toBe(false);
    expect(r.filters.q).toBe('asdfgh');
  });

  it('does not treat a bare number as a price', () => {
    expect(parseIntent('vitamin 12', index).filters.price).toBeNull();
  });

  it('keeps massage as a keyword while setting the wellness type', () => {
    const { filters } = parseIntent('massage', index);
    expect(filters.types).toEqual(['wellness']);
    expect(filters.q).toBe('massage');
  });
});
