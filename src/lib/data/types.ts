export type ServiceType = 'package' | 'lab_test' | 'wellness' | 'service' | 'insurance';
export type Currency = 'THB' | 'NPR' | 'INR';
type AdjustmentType = 'percent' | 'amount' | null;

// Shapes of the raw API payloads. Money fields arrive as decimal strings.
export interface RawCategory {
  id: string;
  title: string;
  slug: string;
  type: ServiceType;
  position: number;
  status: boolean;
  parentId: string | null;
  children?: RawCategory[];
}

export interface RawProvider {
  id: number;
  name: string;
  status: string;
  providerInformation: {
    companyName: string;
    slug: string;
    types: ServiceType[];
    currency: Currency;
    city: { id: string; name: string; slug: string } | null;
    country: { id: number; name: string; alphaCode: string } | null;
    rating?: number | null;
    reviewCount?: number | null;
  };
}

interface RawPriceFields {
  price: string | null;
  discount: string | null;
  discountType: AdjustmentType;
  serviceCharge: string | null;
  serviceChargeType: AdjustmentType;
}

export interface RawWellnessOption extends RawPriceFields {
  id: string;
  durationInMinutes: number;
}

export interface RawService extends RawPriceFields {
  id: string;
  title: string;
  slug: string;
  type: ServiceType;
  userId: number;
  categoryId: string | null;
  subCategoryId: string | null;
  status: boolean;
  testAtHome: boolean;
  homeTestCharge: string | null;
  wellnessPricing: RawWellnessOption[];
  createdAt: string;
}

export interface RawDataset {
  categories: RawCategory[];
  providers: RawProvider[];
  services: RawService[];
}

// ---- Normalized shapes the UI and engine consume ----

export interface Price {
  list: number;
  discountAmount: number;
  afterDiscount: number;
  chargeAmount: number;
  final: number;
  isFree: boolean;
}

export interface WellnessOption {
  id: string;
  minutes: number;
  price: Price;
}

/**
 * fixed: one price. wellness: price depends on a duration option, `from` is the
 * cheapest. unverified: the provider's numbers cannot produce a sane price, so we
 * show no amount and keep the service out of price filtering and sorting.
 */
export type Pricing =
  | { kind: 'fixed'; price: Price }
  | { kind: 'wellness'; options: WellnessOption[]; from: WellnessOption }
  | { kind: 'unverified'; reason: string };

export interface Provider {
  id: number;
  name: string;
  currency: Currency;
  city: string | null;
  country: string | null;
  /** null means "no rating yet", never 0 */
  rating: number | null;
  reviewCount: number | null;
}

export interface Category {
  id: string;
  title: string;
  slug: string;
  type: ServiceType;
  parentId: string | null;
}

export interface Service {
  id: string;
  title: string;
  type: ServiceType;
  providerId: number;
  currency: Currency;
  categoryId: string | null;
  subCategoryId: string | null;
  pricing: Pricing;
  testAtHome: boolean;
  homeTestCharge: number | null;
}

export interface DataIssue {
  code: string;
  count: number;
  /** a few affected ids so a human can look at real examples */
  examples: string[];
  decision: string;
}

export interface NormalizedDataset {
  providers: Provider[];
  categories: Category[];
  services: Service[];
  issues: DataIssue[];
}
