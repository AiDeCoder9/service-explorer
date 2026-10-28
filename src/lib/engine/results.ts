import type { Currency, Provider, Service } from '../data/types';
import { forEachBit } from './bitset';
import { type SearchIndex, normalizeText } from './index';
import type { Filters, SearchResult } from './search';

export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'rating';
export const SORT_KEYS: SortKey[] = ['relevance', 'price-asc', 'price-desc', 'rating'];
export const PAGE_SIZE = 10;
export const SERVICES_PER_CARD = 3;

export interface ProviderGroup {
  provider: Provider;
  currency: Currency;
  /** at most SERVICES_PER_CARD, in sort order */
  services: Service[];
  /** every matching service of this provider; reflects the active filters */
  total: number;
}

export interface ResultPage {
  groups: ProviderGroup[];
  totalProviders: number;
  totalServices: number;
  page: number;
  pageCount: number;
  /**
   * True when a price sort spans several currencies. Groups then come in
   * contiguous currency bands (the UI labels each band) and nothing is compared
   * across bands.
   */
  banded: boolean;
}

/**
 * Relevance, defined: how well the service matches the search words (title hits
 * count most, then provider name, then category), plus a small nudge for a
 * discount, plus the provider's rating as a tie-breaker. With no search text it
 * reduces to "discounted and well-rated first".
 */
function relevance(index: SearchIndex, i: number, tokens: string[]): number {
  const s = index.services[i]!;
  const title = index.titleNorm[i]!;
  const hay = index.haystack[i]!;
  let score = 0;
  for (const t of tokens) {
    if (title.includes(t)) score += 3;
    else if (hay.includes(t)) score += 1;
  }
  const discounted = s.pricing.kind === 'fixed' && s.pricing.price.discountAmount > 0;
  const rating = index.providers.get(s.providerId)?.rating ?? 0;
  return score + (discounted ? 0.5 : 0) + rating / 10;
}

const byTitle = (a: Service, b: Service) => a.title.localeCompare(b.title);

export function buildResultPage(
  index: SearchIndex, result: SearchResult, filters: Filters, sort: SortKey, page: number, pageSize = PAGE_SIZE, perCard = SERVICES_PER_CARD,
): ResultPage {
  const tokens = normalizeText(filters.q).split(' ').filter(Boolean);
  const compare = (i: number) => index.comparePrice[i] ?? null;
  const scoreOf = new Map<string, number>();
  const byProvider = new Map<number, number[]>();
  forEachBit(result.mask, (i) => {
    const s = index.services[i]!;
    scoreOf.set(s.id, relevance(index, i, tokens));
    (byProvider.get(s.providerId) ?? byProvider.set(s.providerId, []).get(s.providerId)!).push(i);
  });

  // Order services inside a provider.
  const serviceOrder = (a: number, b: number): number => {
    const sa = index.services[a]!, sb = index.services[b]!;
    if (sort === 'price-asc' || sort === 'price-desc') {
      const pa = compare(a), pb = compare(b);
      if (pa === null || pb === null) return pa === pb ? byTitle(sa, sb) : pa === null ? 1 : -1;
      return pa !== pb ? (sort === 'price-asc' ? pa - pb : pb - pa) : byTitle(sa, sb);
    }
    return scoreOf.get(sb.id)! - scoreOf.get(sa.id)! || byTitle(sa, sb);
  };

  type Entry = { provider: Provider; ids: number[]; key: number | null };
  const entries: Entry[] = [];
  for (const [providerId, ids] of byProvider) {
    const provider = index.providers.get(providerId)!;
    ids.sort(serviceOrder);
    let key: number | null;
    if (sort === 'price-asc') key = Math.min(...ids.map((i) => compare(i) ?? Infinity));
    else if (sort === 'price-desc') key = Math.max(...ids.map((i) => compare(i) ?? -Infinity));
    else if (sort === 'rating') key = provider.rating;
    else key = scoreOf.get(index.services[ids[0]!]!.id)!;
    if (key === Infinity || key === -Infinity) key = null; // only unverified prices: sorts last
    entries.push({ provider, ids, key });
  }

  const byName = (a: Entry, b: Entry) => a.provider.name.localeCompare(b.provider.name);
  const desc = sort === 'relevance' || sort === 'rating' || sort === 'price-desc';
  const byKey = (a: Entry, b: Entry) => {
    if (a.key === null || b.key === null) return a.key === b.key ? byName(a, b) : a.key === null ? 1 : -1;
    return (desc ? b.key - a.key : a.key - b.key) || byName(a, b);
  };

  const priceSort = sort === 'price-asc' || sort === 'price-desc';
  const currencies = [...new Set(entries.map((e) => e.provider.currency))];
  const banded = priceSort && currencies.length > 1;
  if (banded) {
    // Bigger band first; amounts are only ever compared inside one band.
    const size = (c: Currency) => entries.filter((e) => e.provider.currency === c).length;
    const rank = new Map(currencies.sort((a, b) => size(b) - size(a) || a.localeCompare(b)).map((c, n) => [c, n]));
    entries.sort((a, b) => rank.get(a.provider.currency)! - rank.get(b.provider.currency)! || byKey(a, b));
  } else {
    entries.sort(byKey);
  }

  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const slice = entries.slice((current - 1) * pageSize, current * pageSize);

  return {
    groups: slice.map((e) => ({
      provider: e.provider,
      currency: e.provider.currency,
      services: e.ids.slice(0, perCard).map((i) => index.services[i]!),
      total: e.ids.length,
    })),
    totalProviders: entries.length,
    totalServices: result.total,
    page: current,
    pageCount,
    banded,
  };
}

/** Every matching service of one provider, in the active sort order (for "View all N services"). */
export function providerServices(
  index: SearchIndex, result: SearchResult, filters: Filters, sort: SortKey, providerId: number,
): Service[] {
  const bits = index.provider.find((o) => o.key === String(providerId))?.bits;
  if (!bits) return [];
  const mask = result.mask.map((w, k) => w & bits[k]!);
  const page = buildResultPage(index, { ...result, mask }, filters, sort, 1, 1, Infinity);
  return page.groups[0]?.services ?? [];
}
