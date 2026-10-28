import type { Currency, ServiceType } from './data/types';

const formatters = new Map<Currency, Intl.NumberFormat>();

/** Rounds only here, at display time, to 2 decimals. Never converts currency. */
export function formatMoney(amount: number, currency: Currency): string {
  let f = formatters.get(currency);
  if (!f) formatters.set(currency, (f = new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  return f.format(amount);
}

export const TYPE_LABEL: Record<ServiceType, string> = {
  package: 'Packages',
  lab_test: 'Lab tests',
  wellness: 'Wellness',
  service: 'Services',
  insurance: 'Insurance',
};

export const TYPE_SINGULAR: Record<ServiceType, string> = {
  package: 'Package',
  lab_test: 'Lab test',
  wellness: 'Wellness',
  service: 'Service',
  insurance: 'Insurance',
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
