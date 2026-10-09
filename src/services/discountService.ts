import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscountLine } from "../types/commercial";
import type { Database } from "../types/database.types";
import { CommercialDataServiceError, ensureData } from "./serviceError";

export async function loadDiscountLines(client: SupabaseClient<Database>): Promise<DiscountLine[]> {
  const tableResult = await client
    .from("discount_tables")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const table = ensureData(tableResult.data, tableResult.error);
  if (!table) throw new CommercialDataServiceError();

  const rulesResult = await client
    .from("discount_rules")
    .select("name,percentage,rule_kind,display_order")
    .eq("discount_table_id", table.id)
    .eq("active", true)
    .in("rule_kind", ["line", "custom"])
    .order("display_order");
  const rules = ensureData(rulesResult.data, rulesResult.error);
  if (rules.length === 0) throw new CommercialDataServiceError();

  return rules.map((rule) => ({
    name: rule.name,
    percentage: rule.percentage === null ? null : Number(rule.percentage),
  }));
}
