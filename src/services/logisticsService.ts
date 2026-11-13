import { requireLoadClient, toLoadError } from "./loadService";

export type Driver = { id: string; name: string };
export type DeliveryStop = {
  stop_order: number;
  customer_name: string;
  address: string | null;
  delivered_at: string | null;
  receiver_name: string | null;
  items: { product: string; bags: number; weight: number }[];
};
export type DeliveryRoute = {
  id: string;
  load_number: number;
  planned_date: string | null;
  status: string;
  vehicle_name_snapshot: string;
  vehicle_plate_snapshot: string | null;
  driver_id: string | null;
  driver_name_snapshot: string | null;
  stops: DeliveryStop[];
};

export async function listDrivers() {
  const { data, error } = await requireLoadClient().rpc("load_drivers", {});
  if (error) throw toLoadError(error, "Não foi possível consultar os motoristas.");
  return data ?? [];
}

export async function getOrderLogistics(quoteIds: string[]) {
  const client = requireLoadClient();
  const orders = await Promise.all(quoteIds.map(async (id) => {
    const { data, error } = await client.from("quotes")
      .select("id,freight_zone_snapshot,customers(address),quote_items(id,product_id)").eq("id", id).single();
    if (error) throw toLoadError(error, "Não foi possível consultar os endereços e produtos dos pedidos.");
    return data;
  }));
  return orders;
}

export async function listDeliveryRoutes(loadId?: string) {
  const { data, error } = await requireLoadClient().rpc("delivery_routes", loadId ? { p_load_id: loadId } : {});
  if (error) throw toLoadError(error, "Não foi possível consultar os roteiros.");
  return data as unknown as DeliveryRoute[];
}

export async function recordDelivery(loadId: string, stop: number, receiver: string, signature: string, photo: string) {
  const { error } = await requireLoadClient().rpc("save_delivery_proof", {
    p_load_id: loadId, p_stop_order: stop, p_receiver: receiver, p_signature: signature, p_photo: photo,
  });
  if (error) throw toLoadError(error, "Não foi possível gravar a comprovação.");
}

export async function getDeliveryProof(loadId: string, stop: number) {
  const { data, error } = await requireLoadClient().rpc("delivery_proof", { p_load_id: loadId, p_stop_order: stop });
  if (error || !data) throw toLoadError(error, "Não foi possível consultar a comprovação.");
  return data as { signature: string; photo: string };
}
