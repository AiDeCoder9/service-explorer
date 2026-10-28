import type { Price } from './types';

type Adjustment = 'percent' | 'amount' | null;

export interface PriceInput {
  price: string | null;
  discount: string | null;
  discountType: Adjustment;
  serviceCharge: string | null;
  serviceChargeType: Adjustment;
}

/** Parses a decimal string. Returns null for missing or non-numeric input. */
export function parseMoney(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

export type PriceResult = { ok: true; price: Price } | { ok: false; reason: string };

/**
 * The brief's formula. Nothing is rounded here; round only when displaying.
 * A missing discount or charge counts as zero. A price we cannot trust returns
 * ok:false instead of a made-up number.
 */
export function computePrice(input: PriceInput): PriceResult {
  const list = parseMoney(input.price);
  if (list === null) return { ok: false, reason: 'price is missing or not a number' };
  if (list < 0) return { ok: false, reason: 'price is negative' };

  const discount = input.discount === null ? 0 : parseMoney(input.discount);
  const charge = input.serviceCharge === null ? 0 : parseMoney(input.serviceCharge);
  if (discount === null || charge === null) return { ok: false, reason: 'discount or service charge is not a number' };
  if (discount < 0 || charge < 0) return { ok: false, reason: 'discount or service charge is negative' };

  const discountAmount = input.discountType === 'percent' ? (list * discount) / 100 : discount;
  if (discountAmount > list) return { ok: false, reason: 'discount is larger than the price' };

  const afterDiscount = list - discountAmount;
  const chargeAmount = input.serviceChargeType === 'percent' ? (afterDiscount * charge) / 100 : charge;
  const final = afterDiscount + chargeAmount;

  return {
    ok: true,
    price: { list, discountAmount, afterDiscount, chargeAmount, final, isFree: final === 0 },
  };
}
