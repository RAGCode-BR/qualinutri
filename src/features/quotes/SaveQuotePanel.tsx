import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { createQuoteSnapshot } from "../../domain";
import { createQuote, updateQuote } from "../../services/quoteService";
import type { CalculatorController } from "../calculator/useCalculator";

export function SaveQuotePanel({ controller }: { controller: CalculatorController }) {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const { editingQuote } = controller;
  const canSave = profile?.role === "administrador" || profile?.role === "comercial";
  useEffect(() => {
    if (editingQuote) setMessage("");
  }, [editingQuote]);
  if (!canSave) return null;

  async function save() {
    if (saving || controller.items.length === 0) return;
    setSaving(true);
    setMessage("");
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
      customer: controller.customer,
    });
    try {
      if (editingQuote) {
        await updateQuote(editingQuote.id, snapshot);
        setMessage(`Orçamento #${editingQuote.number} atualizado. A calculadora foi limpa para um novo pedido.`);
      } else {
        const result = await createQuote(snapshot);
        setMessage(`Orçamento #${result.quote_number} salvo. A calculadora foi limpa para um novo pedido.`);
      }
      controller.resetOrder();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setMessage(editingQuote ? "Não foi possível salvar as alterações do orçamento." : "Não foi possível salvar o orçamento.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="save-quote-panel" aria-label="Salvar orçamento">
    <p className="save-quote-customer">Cliente: <strong>{controller.customer?.name ?? "sem cliente vinculado"}</strong></p>
    <button type="button" className="primary-button" disabled={saving || controller.items.length === 0} onClick={() => void save()}>{saving ? "Salvando…" : editingQuote ? `Salvar alterações no #${editingQuote.number}` : "Salvar orçamento"}</button>
    {message && <p role="status" className="form-message">{message}</p>}
  </section>;
}
