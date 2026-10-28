import type { Currency, ServiceType } from '../data/types';
import { type SearchIndex, normalizeText } from './index';
import type { SortKey } from './results';
import { type Filters, emptyFilters } from './search';

export interface Intent {
  /** Filters read from the sentence; `q` holds whatever was left over. Always built from empty. */
  filters: Filters;
  sort: SortKey | null;
  /** true when at least one structured filter or sort was recognised */
  structured: boolean;
}

const CURRENCY_WORDS: [RegExp, Currency][] = [
  [/(?:thb|baht|฿)/, 'THB'],
  [/(?:npr|nrs)/, 'NPR'],
  [/(?:inr|₹)/, 'INR'],
];
const CUR = '(thb|baht|฿|npr|nrs|inr|₹)';
const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k)?';

const amount = (n: string, k?: string) => Number(n.replace(/,/g, '')) * (k ? 1000 : 1);
const currencyOf = (word?: string): Currency | null => {
  if (!word) return null;
  for (const [re, c] of CURRENCY_WORDS) if (re.test(word)) return c;
  return null;
};

// Each rule removes what it understood, so the rest can be searched as plain keywords.
const TYPE_RULES: { re: RegExp; type: ServiceType; keep?: boolean }[] = [
  { re: /\b(?:lab tests?|blood tests?|labs?|tests?)\b/, type: 'lab_test' },
  { re: /\b(?:check ?-?ups?|health checks?|packages?|screenings?)\b/, type: 'package' },
  { re: /\b(?:wellness|spa)\b/, type: 'wellness' },
  { re: /\b(?:massages?|therapy)\b/, type: 'wellness', keep: true },
  { re: /\binsurance\b/, type: 'insurance' },
];

const FILLER = /\b(?:show me|find me|find|show|i need|i want|i am looking for|looking for|please|near me|nearby|in|at|near|for|the|a|an|with|and|of|me|some|any)\b/g;

function currencyOfPlace(index: SearchIndex, key: string): Currency | null {
  const bits = index.place.find((p) => p.key === key)?.bits;
  if (!bits) return null;
  for (let i = 0; i < index.size; i++) if (bits[i >>> 5]! & (1 << (i & 31))) return index.services[i]!.currency;
  return null;
}

/**
 * Reads a plain-language request ("full body check-up in Bangkok under 5000 THB")
 * into the same filters the panel edits. Deterministic and local: no model call,
 * so it is instant, testable, and what it understood can be shown back as chips.
 * Anything it does not recognise stays as a keyword search.
 */
export function parseIntent(text: string, index: SearchIndex): Intent {
  let s = ` ${normalizeText(text)} `;
  const f = emptyFilters();
  // One object, so values set inside the rule callbacks are seen by the checks below.
  const got: { sort: SortKey | null; currency: Currency | null; min?: number; max?: number } = { sort: null, currency: null };

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (!m) return false;
    fn(m);
    s = s.replace(re, ' ');
    return true;
  };

  take(new RegExp(`\\bbetween ${NUM}\\s*${CUR}?\\s*(?:and|to|-)\\s*${NUM}\\s*${CUR}?`), (m) => {
    got.min = amount(m[1]!, m[2]); got.max = amount(m[4]!, m[5]); got.currency = currencyOf(m[3] ?? m[6]);
  });
  if (got.min === undefined) {
    take(new RegExp(`\\b${NUM}\\s*${CUR}?\\s*(?:-|to)\\s*${NUM}\\s*${CUR}\\b`), (m) => {
      got.min = amount(m[1]!, m[2]); got.max = amount(m[4]!, m[5]); got.currency = currencyOf(m[3] ?? m[6]);
    });
  }
  if (got.min === undefined && got.max === undefined) {
    take(new RegExp(`(?:\\b(?:under|below|less than|up to|within|max|cheaper than)|<)\\s*${CUR}?\\s*${NUM}\\s*${CUR}?`), (m) => {
      got.max = amount(m[2]!, m[3]); got.currency = currencyOf(m[1] ?? m[4]);
    });
    take(new RegExp(`(?:\\b(?:over|above|more than|from|min|at least)|>)\\s*${CUR}?\\s*${NUM}\\s*${CUR}?`), (m) => {
      got.min = amount(m[2]!, m[3]); got.currency = got.currency ?? currencyOf(m[1] ?? m[4]);
    });
  }

  take(/\b(?:home (?:visits?|tests?|collection|service|sample)|at home|from home)\b/, () => { f.homeTest = true; });

  const sorts: [RegExp, SortKey][] = [
    [/\b(?:cheapest|lowest price|cheap|affordable|low cost)\b/, 'price-asc'],
    [/\b(?:best rated|top rated|highest rated|best reviewed)\b/, 'rating'],
    [/\b(?:most expensive|priciest)\b/, 'price-desc'],
  ];
  for (const [re, key] of sorts) if (take(re, () => { got.sort = key; })) break;

  for (const rule of TYPE_RULES) {
    if (!rule.re.test(s)) continue;
    if (index.type.some((o) => o.key === rule.type) && !f.types.includes(rule.type)) f.types.push(rule.type);
    if (!rule.keep) s = s.replace(rule.re, ' ');
  }

  // Longest names first, so "New Delhi" wins over "Delhi". A city already implies its country.
  const places = [...index.place].sort((a, b) => b.label.length - a.label.length);
  for (const o of places) {
    const name = normalizeText(o.label);
    if (!name) continue;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (!re.test(s)) continue;
    if (o.parent && f.places.includes(o.parent)) f.places.splice(f.places.indexOf(o.parent), 1);
    if (!o.parent && places.some((c) => c.parent === o.key && f.places.includes(c.key))) { s = s.replace(re, ' '); continue; }
    f.places.push(o.key);
    s = s.replace(re, ' ');
  }

  if (got.min !== undefined || got.max !== undefined) {
    const inferred = f.places.length ? currencyOfPlace(index, f.places[0]!) : null;
    f.price = {
      currency: got.currency ?? inferred ?? 'THB',
      ...(got.min !== undefined && { min: got.min }), ...(got.max !== undefined && { max: got.max }),
    };
  }

  f.q = s.replace(FILLER, ' ').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

  const structured = f.types.length > 0 || f.places.length > 0 || f.homeTest || f.price !== null || got.sort !== null;
  return { filters: f, sort: got.sort, structured };
}
