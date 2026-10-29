/**
 * Plain-language wording for each data issue, for the /data-issues page.
 * Keyed by the issue code that normalize.ts records. No technical terms here:
 * the codes and example ids stay on the page, behind a collapsed toggle.
 */
export type IssueGroup = 'hidden' | 'prices' | 'details' | 'similar';

export interface IssueCopy {
  group: IssueGroup;
  /** short headline */
  title: string;
  /** what we found in the data */
  found: string;
  /** what the customer sees as a result */
  seen: string;
  /** a tiny sample of what shows on screen, when there is one */
  sample?: string;
  /** what the count counts, plural; defaults to "services" */
  unit?: string;
}

export const GROUP_COPY: Record<IssueGroup, { title: string; blurb: string; icon: string }> = {
  hidden: { title: 'Services we do not show', blurb: 'A service only appears when the service, its provider and its category are all switched on.', icon: '🙈' },
  prices: { title: 'Prices', blurb: 'We never show a made-up price. When the numbers do not add up, we say so.', icon: '💳' },
  details: { title: 'Missing or untidy details', blurb: 'These stay in the results. We fill the gap in a sensible way.', icon: '🧩' },
  similar: { title: 'Looks like a mistake, but is not', blurb: 'We checked these carefully and decided to leave them as they are.', icon: '🔍' },
};

export const GROUP_ORDER: IssueGroup[] = ['hidden', 'prices', 'details', 'similar'];

export const ISSUE_COPY: Record<string, IssueCopy> = {
  'hidden-service-off': {
    group: 'hidden', title: 'Switched off by the provider',
    found: 'The provider turned these services off.', seen: 'They do not appear anywhere.',
  },
  'hidden-orphan-provider': {
    group: 'hidden', title: 'Provider not found',
    found: 'These services belong to a provider we have no record of.', seen: 'They do not appear anywhere.',
  },
  'hidden-provider-inactive': {
    group: 'hidden', title: 'Provider is not active',
    found: 'The provider’s account is not active right now.', seen: 'Their services do not appear anywhere.',
  },
  'hidden-orphan-category': {
    group: 'hidden', title: 'Category not found',
    found: 'These services point to a category that does not exist.', seen: 'They do not appear anywhere.',
  },
  'hidden-category-off': {
    group: 'hidden', title: 'Category is switched off',
    found: 'The whole category has been turned off.', seen: 'Its services do not appear anywhere.',
  },
  'wellness-has-flat-price': {
    group: 'prices', title: 'Wellness service with an extra price',
    found: 'Wellness services are priced by session length, but these also carried a single price.', seen: 'Only the session-length prices are used.',
  },
  'wellness-option-invalid': {
    group: 'prices', title: 'Session option with a bad price', unit: 'options',
    found: 'Some session lengths had a price that did not make sense.', seen: 'Those options are left out. The other options still show.',
  },
  'wellness-no-options': {
    group: 'prices', title: 'No usable session prices',
    found: 'Wellness services where no session length has a price we can trust.', seen: 'The price is shown as “Price on request”.', sample: 'Price on request',
  },
  'price-unverified': {
    group: 'prices', title: 'Price that does not add up',
    found: 'The numbers could not give a sensible price. For example, a discount bigger than the price itself.',
    seen: 'Shown as “Price on request”, and left out of price filtering and sorting.', sample: 'Price on request',
  },
  'price-free': {
    group: 'prices', title: 'Free services',
    found: 'These services have a final price of zero.', seen: 'Shown as “Free” instead of “0.00”.', sample: 'Free',
  },
  'provider-unrated': {
    group: 'details', title: 'Providers with no rating yet',
    unit: 'providers', found: 'Some providers have no rating or reviews.', seen: 'Shown as “New on MedEx”, never as a 0.0 rating.', sample: 'New on MedEx',
  },
  'no-category': {
    group: 'details', title: 'No category set',
    found: 'These services were never given a category.', seen: 'Kept and listed under “Uncategorised”, so the counts still add up.', sample: 'Uncategorised',
  },
  'no-subcategory': {
    group: 'details', title: 'No sub-category set',
    found: 'These services have a category but no sub-category.', seen: 'Kept under their main category.',
  },
  'subcategory-mismatch': {
    group: 'details', title: 'Sub-category in the wrong place',
    found: 'The sub-category belongs to a different category than the one chosen.', seen: 'We ignore the sub-category and keep the main category.',
  },
  'title-whitespace': {
    group: 'details', title: 'Untidy service names',
    found: 'Some names have extra spaces at the start, end or in the middle.', seen: 'Names are tidied up so they look clean and are easy to search.',
  },
  'same-title-listings': {
    group: 'similar', title: 'Same name, different offers', unit: 'repeated names',
    found: 'Some providers list the same service name more than once.',
    seen: 'All of them are kept. They differ in price or category, so they are separate offers.',
  },
};
