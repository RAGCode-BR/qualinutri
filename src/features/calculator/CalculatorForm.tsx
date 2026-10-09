import type { CalculatorController } from "./useCalculator";
import { FreightForm } from "./FreightForm";

type CalculatorFormProps = {
  controller: CalculatorController;
};

export function CalculatorForm({ controller }: CalculatorFormProps) {
  const { itemForm } = controller;
  const { discountLines, paymentTermLabels, products } = controller.data;
  const customDiscount = itemForm.discountLineIndex === String(discountLines.length - 1);
  const editing = controller.editingIndex !== null;

  return (
    <form className="calculator-form" onSubmit={(event) => { event.preventDefault(); controller.submitItem(); }}>
      <fieldset className={`panel form-section${editing ? " is-editing" : ""}`}>
        <legend className="panel-title">{editing ? "Editando produto" : "Produto"}</legend>

        <div className="field">
          <label htmlFor="product">Produto</label>
          <select id="product" name="product" aria-describedby="productHint" value={itemForm.productIndex} onChange={(event) => controller.changeProduct(event.target.value)}>
            <option value="">Informar preço manualmente</option>
            {products.map((product, index) => (
              <option key={`${product.name}-${index}`} value={index}>
                {product.name} ({product.group})
              </option>
            ))}
          </select>
          <p className="field-hint" id="productHint">Opcional. Ao escolher um produto, o preço e o peso são preenchidos.</p>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="paymentTerm">Prazo de pagamento</label>
            <select id="paymentTerm" name="paymentTerm" value={itemForm.paymentTermIndex} onChange={(event) => controller.changePaymentTerm(event.target.value)}>
              <option value="">Selecione o prazo</option>
              {paymentTermLabels.map((term, index) => (
                <option key={term} value={index}>{term}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tablePrice">Preço de tabela</label>
            <div className="input-affix">
              <span aria-hidden="true">R$</span>
              <input id="tablePrice" name="tablePrice" type="number" min="0" step="0.01" placeholder="0,00" value={itemForm.tableUnitPrice} onChange={(event) => controller.changeItemField("tableUnitPrice", event.target.value)} />
              <span aria-hidden="true">/saca</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="discountLine">Linha de desconto</label>
            <select
              id="discountLine"
              name="discountLine"
              value={itemForm.discountLineIndex}
              onChange={(event) => controller.changeItemField("discountLineIndex", event.target.value)}
            >
              <option value="">Selecione a linha</option>
              {discountLines.map((line, index) => (
                <option key={line.name} value={index}>
                  {line.name}{line.percentage !== null ? `  (${line.percentage}%)` : ""}
                </option>
              ))}
            </select>
          </div>
          {customDiscount && (
            <div className="field">
              <label htmlFor="customDiscount">Desconto personalizado</label>
              <div className="input-affix">
                <input id="customDiscount" name="customDiscount" type="number" min="0" max="100" step="0.5" placeholder="0" value={itemForm.customDiscountPercentage} onChange={(event) => controller.changeItemField("customDiscountPercentage", event.target.value)} />
                <span aria-hidden="true">%</span>
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="quantity">Quantidade</label>
            <div className="input-affix">
              <input id="quantity" name="quantity" type="number" min="1" step="1" value={itemForm.quantity} onChange={(event) => controller.changeItemField("quantity", event.target.value)} />
              <span aria-hidden="true">sacas</span>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button id="addItemButton" type="submit" className="primary-button">
            {editing ? "Salvar alterações do produto" : "Adicionar ao pedido"}
          </button>
          {editing && (
            <button type="button" className="secondary-button" onClick={controller.cancelEditing}>Cancelar edição</button>
          )}
        </div>
      </fieldset>

      <fieldset className="panel form-section">
        <legend className="panel-title">Pagamento</legend>
        <label className="check-field" htmlFor="anticipatedPayment">
          <input id="anticipatedPayment" name="anticipatedPayment" type="checkbox" checked={controller.anticipatedPayment} onChange={(event) => controller.setAnticipatedPayment(event.target.checked)} />
          <span>Pagamento antecipado <small>Desconto adicional de 1,5% sobre o pedido</small></span>
        </label>

        {controller.calculation.showAccumulationWarning && (
          <div className="warning-message" role="status">Somar o 1,5% do pagamento antecipado ao desconto de linha depende de aprovação do <strong>Gestor Comercial e da Diretoria</strong>, caso a caso.</div>
        )}
      </fieldset>

      <FreightForm
        controller={controller}
      />
    </form>
  );
}
