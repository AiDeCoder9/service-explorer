import { computePrice, parseMoney } from './pricing';
import type {
  Category,
  DataIssue,
  NormalizedDataset,
  Pricing,
  Provider,
  RawCategory,
  RawDataset,
  RawService,
  Service,
  WellnessOption,
} from './types';

const EXAMPLE_LIMIT = 5;

export function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

class IssueLog {
  private map = new Map<string, DataIssue>();

  add(code: string, decision: string, example: string) {
    const issue = this.map.get(code) ?? { code, count: 0, examples: [], decision };
    issue.count += 1;
    if (issue.examples.length < EXAMPLE_LIMIT) issue.examples.push(example);
    this.map.set(code, issue);
  }

  list(): DataIssue[] {
    return [...this.map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }
}

function flattenCategories(raw: RawCategory[]): RawCategory[] {
  return raw.flatMap((c) => [c, ...(c.children ?? [])]);
}

function normalizeProvider(p: RawDataset['providers'][number]): Provider {
  const info = p.providerInformation;
  const rating = typeof info.rating === 'number' && info.rating > 0 ? info.rating : null;
  return {
    id: p.id,
    name: cleanTitle(p.name),
    currency: info.currency,
    city: info.city?.name ?? null,
    country: info.country?.name ?? null,
    rating,
    reviewCount: rating === null ? null : (info.reviewCount ?? null),
  };
}

function normalizePricing(s: RawService, log: IssueLog): Pricing {
  if (s.type === 'wellness') {
    if (s.price !== null) {
      log.add('wellness-has-flat-price', 'Ignored the flat price; wellness is priced by duration option only.', s.id);
    }
    const options: WellnessOption[] = [];
    for (const o of s.wellnessPricing) {
      const result = computePrice(o);
      if (result.ok) options.push({ id: o.id, minutes: o.durationInMinutes, price: result.price });
      else log.add('wellness-option-invalid', `Dropped the option (${result.reason}).`, `${s.id}/${o.durationInMinutes}min`);
    }
    options.sort((a, b) => a.price.final - b.price.final);
    const from = options[0];
    if (!from) {
      log.add('wellness-no-options', 'No usable duration option, so no price is shown.', s.id);
      return { kind: 'unverified', reason: 'no usable duration option' };
    }
    return { kind: 'wellness', options, from };
  }

  const result = computePrice(s);
  if (!result.ok) {
    log.add('price-unverified', `Show no amount and keep out of price filter and sort (${result.reason}).`, s.id);
    return { kind: 'unverified', reason: result.reason };
  }
  if (result.price.isFree) log.add('price-free', 'Shown as "Free", not "0.00".', s.id);
  return { kind: 'fixed', price: result.price };
}

/**
 * Turns the raw API payloads into what the UI can trust. Every judgement call is
 * recorded in `issues`, which feeds the data-issues page and the README.
 * Services a customer must not see are dropped here, so nothing downstream can
 * show them by accident.
 */
export function normalizeDataset(raw: RawDataset): NormalizedDataset {
  const log = new IssueLog();

  const rawCategories = flattenCategories(raw.categories);
  const categoryById = new Map(rawCategories.map((c) => [c.id, c]));
  const categories: Category[] = rawCategories.map((c) => ({
    id: c.id,
    title: cleanTitle(c.title),
    slug: c.slug,
    type: c.type,
    parentId: c.parentId,
  }));

  // Inactive providers never appear in the provider facet either.
  const providers = raw.providers.filter((p) => p.status === 'active').map(normalizeProvider);
  const providerById = new Map(raw.providers.map((p) => [p.id, p]));
  for (const p of providers) {
    if (p.rating === null) log.add('provider-unrated', 'Shown as "New on MedEx", never 0.0.', String(p.id));
  }

  const services: Service[] = [];
  const titleGroups = new Map<string, number>();

  for (const s of raw.services) {
    const provider = providerById.get(s.userId);
    const category = s.categoryId ? categoryById.get(s.categoryId) : undefined;

    // Visibility: all three conditions must hold. Record why, once per reason.
    let hidden = false;
    if (!s.status) { log.add('hidden-service-off', 'Not shown: service status is false.', s.id); hidden = true; }
    if (!provider) { log.add('hidden-orphan-provider', 'Not shown: provider does not exist.', s.id); hidden = true; }
    else if (provider.status !== 'active') { log.add('hidden-provider-inactive', 'Not shown: provider is not active.', s.id); hidden = true; }
    if (s.categoryId && !category) { log.add('hidden-orphan-category', 'Not shown: category does not exist.', s.id); hidden = true; }
    else if (category && !category.status) { log.add('hidden-category-off', 'Not shown: category status is false.', s.id); hidden = true; }
    if (hidden || !provider) continue;

    let categoryId = s.categoryId;
    let subCategoryId = s.subCategoryId;
    if (!categoryId) log.add('no-category', 'Kept; filed under "Uncategorised" so facet counts add up.', s.id);
    else if (!subCategoryId) log.add('no-subcategory', 'Kept; counted under the parent category only.', s.id);
    if (subCategoryId) {
      const sub = categoryById.get(subCategoryId);
      if (!sub || sub.parentId !== categoryId) {
        log.add('subcategory-mismatch', 'Dropped the subcategory; kept the parent category.', s.id);
        subCategoryId = null;
      }
    }
    if (!categoryId) { categoryId = null; subCategoryId = null; }

    const title = cleanTitle(s.title);
    if (title !== s.title) log.add('title-whitespace', 'Trimmed and collapsed whitespace for display and search.', s.id);

    const groupKey = `${s.userId}|${s.type}|${title.toLowerCase()}`;
    const seen = titleGroups.get(groupKey) ?? 0;
    titleGroups.set(groupKey, seen + 1);
    if (seen === 1) {
      log.add('same-title-listings', 'Kept all: copies differ in price, category or options, so they are different listings.', s.id);
    }

    services.push({
      id: s.id,
      title,
      type: s.type,
      providerId: s.userId,
      currency: provider.providerInformation.currency,
      categoryId,
      subCategoryId,
      pricing: normalizePricing(s, log),
      testAtHome: s.testAtHome,
      homeTestCharge: parseMoney(s.homeTestCharge),
    });
  }

  return { providers, categories, services, issues: log.list() };
}
