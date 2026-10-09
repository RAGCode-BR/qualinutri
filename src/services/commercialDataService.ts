import { localCommercialData } from "../data/commercialData";
import { supabase } from "../lib/supabase";
import type { CommercialData } from "../types/commercial";
import { loadDiscountLines } from "./discountService";
import { loadFreightCatalog } from "./freightService";
import { loadCommercialPolicy } from "./policyService";
import { loadProductCatalog } from "./productService";
import { CommercialDataServiceError } from "./serviceError";

let pendingRequest: Promise<CommercialData> | undefined;

async function requestCommercialData(): Promise<CommercialData> {
  if (!supabase) throw new CommercialDataServiceError();

  const [products, discounts, freight, policy] = await Promise.all([
    loadProductCatalog(supabase),
    loadDiscountLines(supabase),
    loadFreightCatalog(supabase),
    loadCommercialPolicy(supabase),
  ]);

  return {
    ...localCommercialData,
    ...products,
    discountLines: discounts,
    ...freight,
    policyVersion: policy.version,
    policySections: policy.sections,
  };
}

export function invalidateCommercialData() {
  pendingRequest = undefined;
}

export function loadCommercialData(): Promise<CommercialData> {
  pendingRequest ??= requestCommercialData().catch((error: unknown) => {
    pendingRequest = undefined;
    throw error;
  });
  return pendingRequest;
}
