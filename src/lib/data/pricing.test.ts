import { describe, expect, it } from 'vitest';
import { computePrice, parseMoney } from './pricing';

const base = { price: '6200.00', discount: '10.00', discountType: 'percent', serviceCharge: '7.00', serviceChargeType: 'percent' } as const;

describe('parseMoney', () => {
  it('parses decimal strings and rejects junk', () => {
    expect(parseMoney('6200.00')).toBe(6200);
    expect(parseMoney(' 12.5 ')).toBe(12.5);
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('12,50')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('computePrice', () => {
  it('applies percent discount then percent charge on the discounted amount', () => {
    const r = computePrice(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.price.discountAmount).toBeCloseTo(620);
    expect(r.price.afterDiscount).toBeCloseTo(5580);
    expect(r.price.chargeAmount).toBeCloseTo(390.6);
    expect(r.price.final).toBeCloseTo(5970.6);
  });

  it('supports flat discount and flat charge', () => {
    const r = computePrice({ ...base, discount: '200.00', discountType: 'amount', serviceCharge: '50.00', serviceChargeType: 'amount' });
    expect(r.ok && r.price.final).toBe(6050);
  });

  it('does not round mid-calculation', () => {
    const r = computePrice({ ...base, price: '0.10', discount: '0.00', serviceCharge: '33.33' });
    expect(r.ok && r.price.final).toBeCloseTo(0.13333, 8); // rounding to 0.13 here would be wrong
  });

  it('treats null discount and charge as zero', () => {
    const r = computePrice({ ...base, discount: null, discountType: null, serviceCharge: null, serviceChargeType: null });
    expect(r.ok && r.price.final).toBe(6200);
  });

  it('marks a zero final price as free', () => {
    const r = computePrice({ price: '0.00', discount: '0.00', discountType: 'amount', serviceCharge: '0.00', serviceChargeType: 'amount' });
    expect(r.ok && r.price.isFree).toBe(true);
  });

  it('refuses a discount larger than the price instead of going negative', () => {
    const r = computePrice({ ...base, price: '450.00', discount: '600.00', discountType: 'amount', serviceCharge: '0.00', serviceChargeType: 'amount' });
    expect(r).toEqual({ ok: false, reason: 'discount is larger than the price' });
  });

  it('refuses percent discounts over 100, negative values and bad numbers', () => {
    expect(computePrice({ ...base, discount: '120.00' }).ok).toBe(false);
    expect(computePrice({ ...base, price: '-5.00' }).ok).toBe(false);
    expect(computePrice({ ...base, serviceCharge: '-1.00' }).ok).toBe(false);
    expect(computePrice({ ...base, price: 'abc' }).ok).toBe(false);
    expect(computePrice({ ...base, price: null }).ok).toBe(false);
  });
});
