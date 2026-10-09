import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import logoUrl from "../../assets/qualinutri-logo.png";
import type { SavedQuoteDetail } from "../../services/quoteService";
import { formatCurrency, formatNumber, formatPercentage } from "../../utils/formatters";
import { guessDocumentKind } from "../../domain/documents/brazilianDocument";

type QuotePrintProps = {
  detail: SavedQuoteDetail;
  sellerName: string | null;
  /** Chamado depois que a janela de impressão fecha. */
  onDone: () => void;
};

const company = {
  name: "Qualinutri Ind. Com. de Nutrição Animal Ltda",
  address: "Av. Rio Arinos, 3881 S, Juara, MT",
  phone: "(66) 3556-2300",
};

const loadTypeLabels: Record<string, string> = { fractional: "carga fracionada", closed: "carga fechada" };

/**
 * Monta o orçamento formatado para A4 fora da árvore do app e abre a janela de
 * impressão do navegador, onde o usuário escolhe "Salvar como PDF". O título da
 * página vira o nome sugerido do arquivo.
 */
export function QuotePrint({ detail, sellerName, onDone }: QuotePrintProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { quote, items } = detail;

  useEffect(() => {
    const previousTitle = document.title;
    let active = true;
    const restore = () => {
      active = false;
      document.title = previousTitle;
      document.body.classList.remove("is-printing");
      window.removeEventListener("afterprint", handleAfterPrint);
    };
    function handleAfterPrint() {
      restore();
      onDone();
    }

    document.title = `Orcamento-${quote.quote_number}`;
    document.body.classList.add("is-printing");
    window.addEventListener("afterprint", handleAfterPrint);

    const images = Array.from(rootRef.current?.querySelectorAll("img") ?? []);
    Promise.all(images.map((image) => image.decode().catch(() => undefined))).then(() => {
      if (active) window.print();
    });

    return restore;
    // Imprime uma vez por orçamento aberto.
  }, [quote.id]);

  const totalBags = items.reduce((total, item) => total + item.quantity, 0);
  const totalWeight = items.reduce((total, item) => total + item.quantity * Number(item.weight_kg_snapshot), 0);
  const createdAt = new Date(quote.created_at).toLocaleDateString("pt-BR");
  const freight = quote.freight_table_name_snapshot
    ? [quote.freight_table_name_snapshot, quote.freight_zone_snapshot, quote.load_type_snapshot ? loadTypeLabels[quote.load_type_snapshot] : null].filter(Boolean).join(", ")
    : "Não incluído";
  const handling = Number(quote.handling_total) > 0
    ? `${formatCurrency(Number(quote.handling_rate_per_ton_snapshot))} por tonelada`
    : "Não incluída";

  return createPortal(
    <div className="print-root" ref={rootRef}>
      <article className="quote-doc">
        <header className="quote-doc-header">
          <img src={logoUrl} alt="Qualinutri Nutrição Animal" />
          <div className="quote-doc-number">
            <span>Orçamento</span>
            <strong>nº {quote.quote_number}</strong>
            <span>{createdAt}</span>
          </div>
        </header>
        <p className="quote-doc-company">{company.name}, {company.address}. Telefone {company.phone}.</p>

        <section className="quote-doc-parties">
          <div>
            <h2>Cliente</h2>
            <p className="quote-doc-strong">{quote.customer_name_snapshot || "Não informado"}</p>
            {quote.customer_document_snapshot && <p>{guessDocumentKind(quote.customer_document_snapshot) === "cpf" ? "CPF" : "CNPJ"} {quote.customer_document_snapshot}</p>}
          </div>
          <div>
            <h2>Vendedor</h2>
            <p className="quote-doc-strong">{sellerName || "Equipe comercial Qualinutri"}</p>
          </div>
        </section>

        <table className="quote-doc-items">
          <thead>
            <tr>
              <th scope="col">Produto</th>
              <th scope="col" className="numeric">Sacas</th>
              <th scope="col" className="numeric">Preço de tabela</th>
              <th scope="col" className="numeric">Desconto</th>
              <th scope="col" className="numeric">Preço final</th>
              <th scope="col" className="numeric">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className="quote-doc-strong">{item.product_name_snapshot}</span>
                  <span className="quote-doc-sub">
                    {[item.payment_term_snapshot ? `Prazo ${item.payment_term_snapshot}` : null, `saca de ${formatNumber(Number(item.weight_kg_snapshot))} kg`].filter(Boolean).join(", ")}
                  </span>
                </td>
                <td className="numeric">{formatNumber(item.quantity)}</td>
                <td className="numeric">{formatCurrency(Number(item.table_unit_price))}</td>
                <td className="numeric">{formatPercentage(Number(item.total_discount_percentage))}</td>
                <td className="numeric">{formatCurrency(Number(item.final_unit_price))}</td>
                <td className="numeric quote-doc-strong">{formatCurrency(Number(item.product_subtotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="quote-doc-bottom">
          <dl className="quote-doc-conditions">
            <div><dt>Quantidade</dt><dd>{formatNumber(totalBags)} sacas, {formatNumber(totalWeight)} kg</dd></div>
            <div><dt>Frete</dt><dd>{freight}</dd></div>
            <div><dt>Chapa (carga e descarga)</dt><dd>{handling}</dd></div>
            <div><dt>Pagamento antecipado</dt><dd>{quote.anticipated_payment ? `Sim, com desconto adicional de ${formatPercentage(Number(quote.anticipated_discount_percentage))}` : "Não"}</dd></div>
          </dl>

          <dl className="quote-doc-totals">
            <div><dt>Subtotal dos produtos</dt><dd>{formatCurrency(Number(quote.product_subtotal))}</dd></div>
            <div><dt>Frete</dt><dd>{formatCurrency(Number(quote.freight_total))}</dd></div>
            <div><dt>Chapa</dt><dd>{formatCurrency(Number(quote.handling_total))}</dd></div>
            <div className="quote-doc-grand"><dt>Total do pedido</dt><dd>{formatCurrency(Number(quote.grand_total))}</dd></div>
            <div className="quote-doc-saving"><dt>Desconto concedido</dt><dd>{formatCurrency(Number(quote.economy_total))}</dd></div>
          </dl>
        </section>

        <footer className="quote-doc-footer">
          O desconto incide sobre o preço de tabela, independente da condição de pagamento. Frete e chapa não têm desconto. Pedido mínimo: 1 tonelada.
        </footer>
      </article>
    </div>,
    document.body,
  );
}
