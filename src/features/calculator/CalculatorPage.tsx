import { useEffect, useState } from "react";
import { CalculatorForm } from "./CalculatorForm";
import { OrderItemsTable } from "./OrderItemsTable";
import { OrderSummary } from "./OrderSummary";
import { useCalculator } from "./useCalculator";
import { SaveQuotePanel } from "../quotes/SaveQuotePanel";
import { quoteStatusLabels } from "../quotes/quoteStatus";
import { formatCurrency } from "../../utils/formatters";
import { useQuoteEditing } from "../../app/QuoteEditingContext";
import { getQuote } from "../../services/quoteService";

export function CalculatorPage() {
  const controller = useCalculator();
  const { pendingQuoteId, clearPendingQuote } = useQuoteEditing();
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadError, setLoadError] = useState("");
  const { editingQuote, loadQuote, resetOrder } = controller;

  useEffect(() => {
    if (!pendingQuoteId) return;
    let active = true;
    setLoadingQuote(true);
    setLoadError("");
    getQuote(pendingQuoteId)
      .then((detail) => {
        if (!active) return;
        if (detail.quote.status === "cancelled") {
          setLoadError("Orçamentos cancelados não podem ser editados.");
          return;
        }
        loadQuote(detail);
      })
      .catch(() => { if (active) setLoadError("Não foi possível abrir o orçamento para edição."); })
      .finally(() => {
        if (!active) return;
        setLoadingQuote(false);
        clearPendingQuote();
      });
    return () => { active = false; };
    // loadQuote muda a cada render; o carregamento depende só do orçamento pedido.
  }, [pendingQuoteId]);

  return (
    <div className="calculator-layout">
      <div className="calculator-work">
        {loadingQuote && <p className="form-message page-notice" role="status">Abrindo orçamento…</p>}
        {loadError && <p className="auth-error page-notice" role="alert">{loadError}</p>}
        {editingQuote ? (
          <div className="editing-banner" role="status">
            <div>
              <strong>Editando o orçamento #{editingQuote.number}</strong>
              <span>Situação: {quoteStatusLabels[editingQuote.status] ?? editingQuote.status}. Ao salvar, o mesmo número é atualizado com as alterações.</span>
            </div>
            <button type="button" className="secondary-button" onClick={resetOrder}>Descartar edição</button>
          </div>
        ) : (
          <p className="page-intro">Monte o pedido produto a produto. Os valores são recalculados na hora, conforme a política comercial vigente.</p>
        )}
        <CalculatorForm controller={controller} />
        <OrderItemsTable controller={controller} />
        <p className="muted calculator-note">O desconto incide sobre o preço de tabela, independente da condição de pagamento. Frete e chapa não têm desconto. Pedido mínimo: 1 tonelada.</p>
      </div>
      <aside id="orderTicket" className="calculator-ticket" aria-label="Resumo do pedido">
        <OrderSummary controller={controller} />
        <SaveQuotePanel controller={controller} />
      </aside>
      <div className="ticket-bar">
        <div>
          <span>Total do pedido</span>
          <strong>{formatCurrency(controller.calculation.grandTotal)}</strong>
        </div>
        <a href="#orderTicket">Ver resumo</a>
      </div>
    </div>
  );
}
