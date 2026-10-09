import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { createQuoteSnapshot } from "../../domain";
import { listCustomers, type Customer } from "../../services/customerService";
import { createQuote, updateQuote } from "../../services/quoteService";
import type { CalculatorController } from "../calculator/useCalculator";

export function SaveQuotePanel({ controller }: { controller: CalculatorController }) {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const { editingQuote } = controller;
  const canSave = profile?.role === "administrador" || profile?.role === "comercial";
  useEffect(() => {
    if (canSave) listCustomers().then(setCustomers).catch(() => setMessage("Não foi possível carregar os clientes."));
  }, [canSave]);
  useEffect(() => {
    setCustomerId(editingQuote?.customerId ?? "");
    if (editingQuote) setMessage("");
  }, [editingQuote]);
  if (!canSave) return null;

  // Cliente do orçamento em edição que foi desativado depois: continua vinculado.
  const inactiveQuoteCustomer = editingQuote?.customerId && !customers.some((customer) => customer.id === editingQuote.customerId)
    ? { id: editingQuote.customerId, name: editingQuote.customerName ?? "Cliente", document: editingQuote.customerDocument }
    : null;

  async function save() {
    if (saving || controller.items.length === 0) return;
    setSaving(true);
    setMessage("");
    const selectedCustomer = customers.find((customer) => customer.id === customerId);
    const range = controller.freightForm.table === "juara"
      ? controller.data.juaraFreightRates[Number(controller.freightForm.rangeIndex)]?.distance
      : controller.freightForm.table === "regional"
        ? controller.data.regionalFreightRates[Number(controller.freightForm.rangeIndex)]?.location
        : null;
    const snapshot = createQuoteSnapshot({
      items: controller.items,
      calculation: controller.calculation,
      products: controller.data.products,
      paymentTermLabels: controller.data.paymentTermLabels,
      anticipatedPayment: controller.anticipatedPayment,
      handlingRatePerTon: Number.parseFloat(controller.handlingRatePerTon) || 0,
      freight: {
        tableName: controller.freightForm.table === "juara" ? "Juara" : controller.freightForm.table === "regional" ? "Regional" : null,
        zone: range ?? null,
        loadType: controller.freightForm.table ? controller.freightForm.loadType : null,
      },
      customer: selectedCustomer
        ? { id: selectedCustomer.id, name: selectedCustomer.legal_name, document: selectedCustomer.document }
        : inactiveQuoteCustomer?.id === customerId ? inactiveQuoteCustomer : null,
    });
    try {
      if (editingQuote) {
        await updateQuote(editingQuote.id, snapshot);
        setMessage(`Orçamento #${editingQuote.number} atualizado. A calculadora foi limpa para um novo pedido.`);
      } else {
        const result = await createQuote(snapshot);
        setMessage(`Orçamento #${result.quote_number} salvo. A calculadora foi limpa para um novo pedido.`);
      }
      setCustomerId("");
      controller.resetOrder();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setMessage(editingQuote ? "Não foi possível salvar as alterações do orçamento." : "Não foi possível salvar o orçamento.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="save-quote-panel" aria-label="Salvar orçamento">
    <label htmlFor="quoteCustomer">Cliente do orçamento (opcional)</label>
    <select id="quoteCustomer" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
      <option value="">Sem cliente vinculado</option>
      {inactiveQuoteCustomer && <option value={inactiveQuoteCustomer.id}>{inactiveQuoteCustomer.name} (inativo)</option>}
      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.legal_name}</option>)}
    </select>
    <button type="button" className="primary-button" disabled={saving || controller.items.length === 0} onClick={() => void save()}>{saving ? "Salvando…" : editingQuote ? `Salvar alterações no #${editingQuote.number}` : "Salvar orçamento"}</button>
    {message && <p role="status" className="form-message">{message}</p>}
  </section>;
}
