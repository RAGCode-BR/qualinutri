import { validatePhone } from "../domain/contacts/brazilianPhone";
import { validateDocument } from "../domain/documents/brazilianDocument";
import { supabase } from "../lib/supabase";
import type { CustomerInput } from "../types/customer";
import type { Database } from "../types/database.types";

export type Customer = Database["public"]["Tables"]["customers"]["Row"];

export class CustomerServiceError extends Error {
  constructor(message = "Não foi possível concluir a operação com o cliente.") {
    super(message);
    this.name = "CustomerServiceError";
  }
}

function requireClient() {
  if (!supabase) throw new CustomerServiceError("A conexão com o Supabase não está configurada.");
  return supabase;
}

/** Erros de validação do banco (22023) já vêm com mensagem para o usuário. */
function toServiceError(error: { code?: string; message?: string } | null) {
  if (error?.code === "22023" && error.message) return new CustomerServiceError(error.message);
  return new CustomerServiceError();
}

function toValidDocument(value: string | null | undefined) {
  const document = validateDocument(value);
  if (!document.valid) throw new CustomerServiceError(document.message);
  return document.formatted;
}

function toValidPhone(value: string | null | undefined) {
  const phone = validatePhone(value);
  if (!phone.valid) throw new CustomerServiceError(phone.message);
  return phone.formatted;
}

function changed(next: string | null | undefined, previous: string | null | undefined) {
  return (next?.trim() || null) !== (previous?.trim() || null);
}

function toCustomerPayload(input: CustomerInput) {
  const legalName = input.legalName.trim();
  if (!legalName) throw new CustomerServiceError("Informe o nome ou a razão social do cliente.");
  return {
    legal_name: legalName,
    trade_name: input.tradeName?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address ?? null,
    notes: input.notes?.trim() || null,
  };
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const client = requireClient();
  const { data, error } = await client
    .from("customers")
    .insert({ ...toCustomerPayload(input), document: toValidDocument(input.document), phone: toValidPhone(input.phone) })
    .select("*")
    .single();
  if (error || !data) throw toServiceError(error);
  return data;
}

/**
 * `previous` traz documento e telefone salvos. Campos que não mudaram não são
 * validados nem enviados: cadastros antigos fora do padrão continuam editáveis.
 */
export async function updateCustomer(
  id: string,
  input: CustomerInput,
  previous?: Pick<Customer, "document" | "phone">,
): Promise<Customer> {
  const client = requireClient();
  const payload = {
    ...toCustomerPayload(input),
    ...(changed(input.document, previous?.document) && { document: toValidDocument(input.document) }),
    ...(changed(input.phone, previous?.phone) && { phone: toValidPhone(input.phone) }),
  };
  const { data, error } = await client
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw toServiceError(error);
  return data;
}

export async function listCustomers(includeInactive = false): Promise<Customer[]> {
  const client = requireClient();
  let query = client.from("customers").select("*").order("legal_name");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error || !data) throw new CustomerServiceError();
  return data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const client = requireClient();
  const { data, error } = await client.from("customers").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new CustomerServiceError("Cliente não encontrado ou indisponível.");
  return data;
}

export async function deactivateCustomer(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("customers").update({ active: false }).eq("id", id);
  if (error) throw new CustomerServiceError();
}
