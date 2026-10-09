import type { SupabaseClient } from "@supabase/supabase-js";
import type { JuaraFreightRate, RegionalFreightRate } from "../types/commercial";
import type { Database } from "../types/database.types";
import { CommercialDataServiceError, ensureData } from "./serviceError";

export type FreightCatalog = {
  juaraFreightRates: JuaraFreightRate[];
  regionalFreightRates: RegionalFreightRate[];
  handlingRatePerTon: number;
};

export async function loadFreightCatalog(client: SupabaseClient<Database>): Promise<FreightCatalog> {
  const [tablesResult, handlingResult] = await Promise.all([
    client.from("freight_tables").select("id,code").eq("status", "active"),
    client.from("handling_rate_tables").select("amount_per_ton").eq("status", "active").eq("code", "handling").limit(1).maybeSingle(),
  ]);
  const tables = ensureData(tablesResult.data, tablesResult.error);
  const handling = ensureData(handlingResult.data, handlingResult.error);
  const juaraTable = tables.find((table) => table.code === "juara");
  const regionalTable = tables.find((table) => table.code === "regional");
  if (!juaraTable || !regionalTable || !handling) throw new CommercialDataServiceError();

  const zonesResult = await client
    .from("freight_zones")
    .select("id,freight_table_id,label,display_order")
    .in("freight_table_id", [juaraTable.id, regionalTable.id])
    .eq("active", true)
    .order("display_order");
  const zones = ensureData(zonesResult.data, zonesResult.error);
  if (zones.length === 0) throw new CommercialDataServiceError();

  const ratesResult = await client
    .from("freight_rates")
    .select("freight_zone_id,load_type,rate_basis,bag_weight_kg,amount")
    .in("freight_zone_id", zones.map((zone) => zone.id));
  const rates = ensureData(ratesResult.data, ratesResult.error);

  const rateAmount = (zoneId: string, loadType: "fractional" | "closed", basis: "per_bag" | "per_ton", weight?: number) => {
    const rate = rates.find((candidate) =>
      candidate.freight_zone_id === zoneId
      && candidate.load_type === loadType
      && candidate.rate_basis === basis
      && (weight === undefined || Number(candidate.bag_weight_kg) === weight));
    return rate ? Number(rate.amount) : null;
  };

  const juaraFreightRates = zones
    .filter((zone) => zone.freight_table_id === juaraTable.id)
    .map<JuaraFreightRate>((zone) => {
      const bag25 = rateAmount(zone.id, "fractional", "per_bag", 25);
      const bag30 = rateAmount(zone.id, "fractional", "per_bag", 30);
      const bag40 = rateAmount(zone.id, "fractional", "per_bag", 40);
      const closedPerTon = rateAmount(zone.id, "closed", "per_ton");
      if (bag25 === null || bag30 === null || bag40 === null || closedPerTon === null) {
        throw new CommercialDataServiceError();
      }
      return { distance: zone.label, bag25, bag30, bag40, closedPerTon };
    });

  const regionalFreightRates = zones
    .filter((zone) => zone.freight_table_id === regionalTable.id)
    .map<RegionalFreightRate>((zone) => {
      const closedPerTon = rateAmount(zone.id, "closed", "per_ton");
      if (closedPerTon === null) throw new CommercialDataServiceError();
      return {
        location: zone.label,
        fractionalPerTon: rateAmount(zone.id, "fractional", "per_ton"),
        closedPerTon,
      };
    });

  return {
    juaraFreightRates,
    regionalFreightRates,
    handlingRatePerTon: Number(handling.amount_per_ton),
  };
}
