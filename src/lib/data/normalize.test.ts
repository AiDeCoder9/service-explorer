import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanTitle, normalizeDataset } from './normalize';
import type { RawCategory, RawDataset, RawProvider, RawService } from './types';

const cat = (id: string, type: RawCategory['type'], parentId: string | null = null, status = true, children: RawCategory[] = []): RawCategory =>
  ({ id, title: id, slug: 'ultrasound', type, position: 1, status, parentId, children });

const provider = (id: number, status = 'active', rating: number | null = 4.5): RawProvider => ({
  id, name: `P${id}`, status,
  providerInformation: {
    companyName: `P${id}`, slug: `p${id}`, types: ['package'], currency: id === 2 ? 'NPR' : 'THB',
    city: { id: 'c', name: 'Bangkok', slug: 'bangkok' }, country: { id: 1, name: 'Thailand', alphaCode: 'TH' },
    rating, reviewCount: rating === null ? null : 10,
  },
});

let n = 0;
const svc = (over: Partial<RawService> = {}): RawService => ({
  id: `s${++n}`, title: 'Check', slug: 's', type: 'package', userId: 1, categoryId: 'A', subCategoryId: null,
  price: '1000.00', discount: '0.00', discountType: 'amount', serviceCharge: '0.00', serviceChargeType: 'amount',
  status: true, testAtHome: false, homeTestCharge: null, wellnessPricing: [], createdAt: '2025-01-01T00:00:00.000Z', ...over,
});

const dataset = (services: RawService[], providers = [provider(1), provider(2)], categories = [cat('A', 'package', null, true, [cat('A1', 'package', 'A')]), cat('OFF', 'package', null, false)]): RawDataset =>
  ({ categories, providers, services });

const issue = (d: ReturnType<typeof normalizeDataset>, code: string) => d.issues.find((i) => i.code === code);

describe('visibility', () => {
  it('shows a service only when service, provider and category are all active', () => {
    const d = normalizeDataset(dataset([
      svc({ id: 'ok' }),
      svc({ id: 'svc-off', status: false }),
      svc({ id: 'prov-off', userId: 3 }),
      svc({ id: 'cat-off', categoryId: 'OFF' }),
      svc({ id: 'no-cat', categoryId: null }),
    ], [provider(1), provider(3, 'inactive')]));
    expect(d.services.map((s) => s.id).sort()).toEqual(['no-cat', 'ok']);
    expect(issue(d, 'hidden-service-off')?.count).toBe(1);
    expect(issue(d, 'hidden-provider-inactive')?.count).toBe(1);
    expect(issue(d, 'hidden-category-off')?.count).toBe(1);
  });

  it('drops inactive providers from the provider list', () => {
    const d = normalizeDataset(dataset([], [provider(1), provider(3, 'inactive')]));
    expect(d.providers.map((p) => p.id)).toEqual([1]);
  });
});

describe('categories', () => {
  it('keeps same-slug categories of different types apart by id', () => {
    const d = normalizeDataset(dataset([], [provider(1)], [cat('P', 'package'), cat('L', 'lab_test')]));
    expect(d.categories.filter((c) => c.slug === 'ultrasound').map((c) => c.id)).toEqual(['P', 'L']);
  });

  it('files a missing category and subcategory without dropping the service', () => {
    const d = normalizeDataset(dataset([svc({ categoryId: null }), svc({ categoryId: 'A', subCategoryId: null })]));
    expect(d.services).toHaveLength(2);
    expect(d.services[0]).toMatchObject({ categoryId: null, subCategoryId: null });
    expect(issue(d, 'no-category')?.count).toBe(1);
    expect(issue(d, 'no-subcategory')?.count).toBe(1);
  });

  it('drops a subcategory that is not a child of the service category', () => {
    const d = normalizeDataset(dataset([svc({ categoryId: 'OFF', subCategoryId: 'A1' }), svc({ categoryId: 'A', subCategoryId: 'A1' })]));
    expect(d.services).toHaveLength(1);
    const wrong = normalizeDataset(dataset([svc({ categoryId: 'A', subCategoryId: 'nope' })]));
    expect(wrong.services[0]?.subCategoryId).toBeNull();
    expect(issue(wrong, 'subcategory-mismatch')?.count).toBe(1);
  });
});

describe('providers', () => {
  it('turns a missing or zero rating into null, not 0', () => {
    const d = normalizeDataset(dataset([], [provider(1, 'active', null), provider(2, 'active', 0)]));
    expect(d.providers.every((p) => p.rating === null && p.reviewCount === null)).toBe(true);
    expect(issue(d, 'provider-unrated')?.count).toBe(2);
  });
});

describe('titles', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanTitle('  hba1c   TEST (Diabetes) ')).toBe('hba1c TEST (Diabetes)');
    const d = normalizeDataset(dataset([svc({ title: '  a   b ' })]));
    expect(d.services[0]?.title).toBe('a b');
    expect(issue(d, 'title-whitespace')?.count).toBe(1);
  });

  it('keeps same-title listings at one provider instead of collapsing them', () => {
    const d = normalizeDataset(dataset([svc({ title: 'Facial', price: '100.00' }), svc({ title: 'facial ', price: '200.00' })]));
    expect(d.services).toHaveLength(2);
    expect(issue(d, 'same-title-listings')?.count).toBe(1);
  });
});

describe('pricing', () => {
  it('uses the provider currency, never a conversion', () => {
    const d = normalizeDataset(dataset([svc({ userId: 2 })]));
    expect(d.services[0]?.currency).toBe('NPR');
  });

  it('flags a discount larger than the price as unverified', () => {
    const d = normalizeDataset(dataset([svc({ price: '450.00', discount: '600.00' })]));
    expect(d.services[0]?.pricing).toMatchObject({ kind: 'unverified' });
    expect(issue(d, 'price-unverified')?.count).toBe(1);
  });

  it('records free services', () => {
    const d = normalizeDataset(dataset([svc({ price: '0.00' })]));
    expect(d.services[0]?.pricing).toMatchObject({ kind: 'fixed', price: { isFree: true } });
    expect(issue(d, 'price-free')?.count).toBe(1);
  });

  const option = (id: string, minutes: number, price: string, discount = '0.00') =>
    ({ id, durationInMinutes: minutes, price, discount, discountType: 'amount', serviceCharge: '0.00', serviceChargeType: 'amount' }) as const;

  it('prices wellness by its cheapest valid duration option', () => {
    const d = normalizeDataset(dataset([svc({
      type: 'wellness', price: null, discount: null, discountType: null, serviceCharge: null, serviceChargeType: null,
      wellnessPricing: [option('a', 90, '2400.00', '360.00'), option('b', 60, '1800.00'), option('bad', 30, '100.00', '900.00')],
    })]));
    const pricing = d.services[0]?.pricing;
    expect(pricing?.kind).toBe('wellness');
    if (pricing?.kind !== 'wellness') return;
    // 60 min costs 1800, 90 min costs 2400 - 360 = 2040; the 30 min option is invalid and dropped
    expect(pricing.options.map((o) => o.minutes)).toEqual([60, 90]);
    expect(pricing.from.minutes).toBe(60);
    expect(issue(d, 'wellness-option-invalid')?.count).toBe(1);
  });

  it('marks a wellness service with no usable option as unverified', () => {
    const d = normalizeDataset(dataset([svc({ type: 'wellness', price: null, wellnessPricing: [] })]));
    expect(d.services[0]?.pricing).toMatchObject({ kind: 'unverified' });
  });
});

describe('the real dataset', () => {
  const raw = JSON.parse(readFileSync(new URL('../../../data/task1-service-explorer.json', import.meta.url), 'utf8')) as RawDataset;
  const d = normalizeDataset(raw);

  it('keeps exactly the services a customer may see', () => {
    expect(raw.services).toHaveLength(3200);
    expect(d.services).toHaveLength(2853);
  });

  it('finds the known mistakes', () => {
    expect(issue(d, 'price-unverified')?.examples.length).toBeGreaterThan(0);
    expect(issue(d, 'price-free')).toBeDefined();
    expect(issue(d, 'no-category')).toBeDefined();
    expect(issue(d, 'provider-unrated')).toBeDefined();
    expect(issue(d, 'title-whitespace')).toBeDefined();
  });

  it('never leaves a negative or non-finite final price', () => {
    for (const s of d.services) {
      const finals = s.pricing.kind === 'fixed' ? [s.pricing.price.final] : s.pricing.kind === 'wellness' ? s.pricing.options.map((o) => o.price.final) : [];
      for (const f of finals) expect(Number.isFinite(f) && f >= 0).toBe(true);
    }
  });
});
