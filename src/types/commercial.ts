export type PaymentTerm = {
  id: string;
  label: string;
  condition: string;
  notes: string;
};

export type DiscountLine = {
  name: string;
  percentage: number | null;
};

export type Product = {
  /** Presente apenas quando o catálogo vem do Supabase. */
  id?: string;
  group: string;
  name: string;
  weightKg: number;
  prices: readonly number[];
};

export type JuaraFreightRate = {
  distance: string;
  bag25: number;
  bag30: number;
  bag40: number;
  closedPerTon: number;
};

export type RegionalFreightRate = {
  location: string;
  fractionalPerTon: number | null;
  closedPerTon: number;
};

export type PolicySection = {
  title: string;
  content: string;
  pending?: boolean;
};

export type CommercialData = {
  paymentTermLabels: readonly string[];
  /** Ids dos prazos na mesma ordem de paymentTermLabels; ausente nos dados locais. */
  paymentTermIds?: readonly string[];
  paymentTerms: PaymentTerm[];
  discountLines: DiscountLine[];
  rationProducts: Product[];
  mineralProducts: Product[];
  products: Product[];
  juaraFreightRates: JuaraFreightRate[];
  regionalFreightRates: RegionalFreightRate[];
  handlingRatePerTon: number;
  policyVersion: string;
  policySections: PolicySection[];
};
