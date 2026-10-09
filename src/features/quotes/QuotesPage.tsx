import { useEffect, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { listCustomers, type Customer } from "../../services/customerService";
import { advanceQuoteStatus, cancelQuote, duplicateQuote, getQuote, getQuoteSellerName, listQuotes, type SavedQuoteDetail, type SavedQuoteSummary } from "../../services/quoteService";
import { QuotePrint } from "./QuotePrint";
import { formatCurrency } from "../../utils/formatters";
import { useQuoteEditing } from "../../app/QuoteEditingContext";
import { quoteStatusLabels } from "./quoteStatus";


/** Próximo passo do andamento a partir da situação atual. */
const nextStep: Partial<Record<string, { status: "issued" | "approved"; action: string; done: string }>> = {
  draft: { status: "issued", action: "Marcar como enviado", done: "marcado como enviado" },
  issued: { status: "approved", action: "Marcar como aprovado", done: "marcado como aprovado" },
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : null;
}

function statusDate(quote: SavedQuoteSummary) {
  if (quote.status === "approved") return formatDate(quote.approved_at);
  if (quote.status === "issued") return formatDate(quote.issued_at);
  return null;
}

export function QuotesPage() {
  const { openQuoteForEditing } = useQuoteEditing();
  const [quotes, setQuotes] = useState<SavedQuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState<SavedQuoteSummary | null>(null);
  const [cancelError, setCancelError] = useState("");
  const [printing, setPrinting] = useState<{ detail: SavedQuoteDetail; sellerName: string | null } | null>(null);
  const [preparingPdfId, setPreparingPdfId] = useState<string | null>(null);

  async function exportPdf(quote: SavedQuoteSummary) {
    if (preparingPdfId) return;
    setPreparingPdfId(quote.id);
    setMessage("");
    try {
      const [detail, sellerName] = await Promise.all([getQuote(quote.id), getQuoteSellerName(quote.id)]);
      setPrinting({ detail, sellerName });
    } catch {
      setMessage(`Não foi possível gerar o PDF do orçamento #${quote.quote_number}.`);
    } finally {
      setPreparingPdfId(null);
    }
  }

  const [numberSearch, setNumberSearch] = useState("");
  const [searchedNumber, setSearchedNumber] = useState<number | null>(null);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const hasFilters = searchedNumber !== null || customerFilter !== "all";

  useEffect(() => {
    listCustomers(true).then(setCustomers).catch(() => setCustomers([]));
  }, []);

  // Espera o usuário parar de digitar antes de buscar o número.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const digits = numberSearch.replace(/\D/g, "");
      setSearchedNumber(digits ? Number(digits) : null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [numberSearch]);

  async function reload() {
    setLoading(true);
    try { setQuotes(await listQuotes({ number: searchedNumber, customer: customerFilter })); }
    catch { setMessage("Não foi possível carregar os orçamentos."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [searchedNumber, customerFilter]);

  function clearFilters() {
    setNumberSearch("");
    setSearchedNumber(null);
    setCustomerFilter("all");
  }

  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      setMessage(await action());
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  function advance(quote: SavedQuoteSummary) {
    const step = nextStep[quote.status];
    if (!step) return;
    void run(async () => {
      await advanceQuoteStatus(quote.id, step.status);
      return `Orçamento #${quote.quote_number} ${step.done}.`;
    });
  }

  function duplicate(quote: SavedQuoteSummary) {
    void run(async () => {
      const saved = await duplicateQuote(quote.id);
      return `Orçamento #${saved.quote_number} criado como rascunho, a partir do #${quote.quote_number}.`;
    });
  }

  async function confirmCancel() {
    if (!cancelling || busy) return;
    setBusy(true);
    setCancelError("");
    try {
      await cancelQuote(cancelling.id);
      setMessage(`Orçamento #${cancelling.quote_number} cancelado.`);
      setCancelling(null);
      await reload();
    } catch {
      setCancelError("Não foi possível cancelar o orçamento.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    {message && <p role="status" className="form-message page-notice">{message}</p>}
    <div className="quote-filters" role="search" aria-label="Buscar orçamentos">
      <div className="field">
        <label htmlFor="quoteNumberSearch">Número do orçamento</label>
        <input
          id="quoteNumberSearch"
          type="search"
          inputMode="numeric"
          placeholder="Ex.: 1042"
          maxLength={12}
          value={numberSearch}
          onChange={(event) => setNumberSearch(event.target.value.replace(/[^\d#]/g, ""))}
        />
      </div>
      <div className="field">
        <label htmlFor="quoteCustomerFilter">Cliente</label>
        <select id="quoteCustomerFilter" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
          <option value="all">Todos os clientes</option>
          <option value="none">Sem cliente vinculado</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.legal_name}{customer.active ? "" : " (inativo)"}</option>
          ))}
        </select>
      </div>
      {hasFilters && <button type="button" className="secondary-button" onClick={clearFilters}>Limpar filtros</button>}
    </div>

    <Panel
      title={hasFilters ? "Orçamentos encontrados" : "Orçamentos salvos"}
      description={hasFilters ? "Até 50 orçamentos mais recentes que atendem à busca." : "Os 50 mais recentes. Para criar um novo, use a Calculadora."}
      actions={!loading && <span className="count-badge">{quotes.length} {quotes.length === 1 ? "orçamento" : "orçamentos"}</span>}
      flush
    >
      {loading && quotes.length === 0 ? <p className="panel-loading">Carregando orçamentos…</p> : quotes.length === 0 ? (
        hasFilters
          ? <EmptyState title="Nenhum orçamento encontrado.">Confira o número digitado ou escolha outro cliente.</EmptyState>
          : <EmptyState title="Nenhum orçamento salvo.">Monte um pedido na Calculadora e clique em “Salvar orçamento”.</EmptyState>
      ) : <ScrollableTable><table className="data-table">
        <thead><tr><th scope="col">Número</th><th scope="col">Cliente</th><th scope="col">Situação</th><th scope="col" className="numeric">Total</th><th scope="col" className="numeric">Criado em</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{quotes.map((quote) => {
          const step = nextStep[quote.status];
          const date = statusDate(quote);
          return <tr key={quote.id}>
            <td className="strong">#{quote.quote_number}</td>
            <td>{quote.customer_name_snapshot || <span className="muted-cell">Sem cliente</span>}</td>
            <td className="nowrap-cell">
              <span className={`status-badge is-${quote.status}`}>{quoteStatusLabels[quote.status] ?? quote.status}</span>
              {date && <span className="cell-sub">em {date}</span>}
            </td>
            <td className="numeric strong">{formatCurrency(Number(quote.grand_total))}</td>
            <td className="numeric">{formatDate(quote.created_at)}</td>
            <td className="action-cell">
              {step && <button type="button" className="row-button is-primary" disabled={busy} onClick={() => advance(quote)}>{step.action}<span className="sr-only"> orçamento {quote.quote_number}</span></button>}
              {quote.status !== "cancelled" && <button type="button" className="row-button" disabled={busy} onClick={() => openQuoteForEditing(quote.id)}>Editar<span className="sr-only"> orçamento {quote.quote_number}</span></button>}
              <button type="button" className="row-button" disabled={busy} onClick={() => duplicate(quote)}>Duplicar<span className="sr-only"> orçamento {quote.quote_number}</span></button>
              {quote.status !== "cancelled" && <button type="button" className="row-button" disabled={preparingPdfId !== null} onClick={() => void exportPdf(quote)}>{preparingPdfId === quote.id ? "Gerando…" : "Exportar"}<span className="sr-only"> orçamento {quote.quote_number}</span></button>}
              {quote.status !== "cancelled" && <button type="button" className="row-button is-danger" disabled={busy} onClick={() => { setCancelError(""); setCancelling(quote); }}>Cancelar<span className="sr-only"> orçamento {quote.quote_number}</span></button>}
            </td>
          </tr>;
        })}</tbody>
      </table></ScrollableTable>}
    </Panel>

    {printing && <QuotePrint detail={printing.detail} sellerName={printing.sellerName} onDone={() => setPrinting(null)} />}

    {cancelling && (
      <Dialog
        title={`Cancelar o orçamento #${cancelling.quote_number}?`}
        description="O cancelamento é definitivo. O orçamento continua na lista como Cancelado, e você pode duplicá-lo se precisar refazer."
        size="small"
        onClose={() => { if (!busy) setCancelling(null); }}
      >
        {cancelError && <p className="auth-error" role="alert">{cancelError}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => setCancelling(null)}>Voltar</button>
          <button type="button" className="primary-button is-danger" disabled={busy} onClick={() => void confirmCancel()}>{busy ? "Cancelando…" : "Cancelar orçamento"}</button>
        </div>
      </Dialog>
    )}
  </>;
}
