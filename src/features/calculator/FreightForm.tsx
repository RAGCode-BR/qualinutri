import type { LoadType } from "../../domain";
import type { CalculatorController } from "./useCalculator";
import { Select } from "../../components/Select";

type FreightFormProps = {
  controller: CalculatorController;
};

export function FreightForm({ controller }: FreightFormProps) {
  const { freightForm, itemForm } = controller;
  const { juaraFreightRates, regionalFreightRates } = controller.data;
  const ranges = freightForm.table === "juara" ? juaraFreightRates : regionalFreightRates;
  const showDetails = freightForm.table !== "";
  // Cidade regional sem tarifa fracionada aceita só carga fechada.
  const closedOnly = freightForm.table === "regional" && regionalFreightRates[Number(freightForm.rangeIndex)]?.fractionalPerTon === null;
  const notes = controller.calculation.notes.join(" ");

  return (
    <fieldset className="panel form-section freight-box">
      <legend className="panel-title">Frete e chapa <span className="panel-title-note">opcional, sem desconto</span></legend>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="freightTable">Tabela de frete</label>
          <Select
            id="freightTable"
            value={freightForm.table}
            onChange={(value) => controller.changeFreightTable(value as "" | "juara" | "regional")}
            options={[
              { value: "", label: "Não incluir frete" },
              { value: "juara", label: "Juara (por distância)" },
              { value: "regional", label: "Regional (por cidade)" },
            ]}
          />
        </div>
        {showDetails && (
          <>
            <div className="field">
              <label htmlFor="freightRange">Faixa ou cidade</label>
              <Select
                id="freightRange"
                value={freightForm.rangeIndex}
                onChange={(value) => controller.changeFreightField("rangeIndex", value)}
                options={ranges.map((range, index) => ({ value: String(index), label: "distance" in range ? range.distance : range.location }))}
              />
            </div>
            <div className="field">
              <label htmlFor="loadType">Tipo de carga</label>
              <Select
                id="loadType"
                value={freightForm.loadType}
                onChange={(value) => controller.changeFreightField("loadType", value as LoadType)}
                options={[
                  { value: "fractional", label: closedOnly ? "Fracionada (indisponível nesta cidade)" : "Fracionada", disabled: closedOnly },
                  { value: "closed", label: "Carga fechada" },
                ]}
              />
            </div>
            {controller.showManualWeight && <div className="field">
              <label htmlFor="bagWeight">Peso da saca</label>
              <div className="input-affix">
                <input id="bagWeight" name="bagWeight" type="number" min="1" step="1" value={itemForm.bagWeightKg} onChange={(event) => controller.changeItemField("bagWeightKg", event.target.value)} />
                <span aria-hidden="true">kg</span>
              </div>
            </div>}
          </>
        )}
      </div>

      <div className="check-field handling-field">
        <input
          id="handling"
          name="handling"
          type="checkbox"
          checked={controller.handlingEnabled}
          onChange={(event) => controller.setHandlingEnabled(event.target.checked)}
        />
        <label htmlFor="handling">Chapa <small>Carga e descarga terceirizada</small></label>
        <div className="input-affix inline-affix">
          <span aria-hidden="true">R$</span>
          <input aria-label="Valor da chapa por tonelada" name="handlingRate" type="number" step="0.01" disabled={!controller.handlingEnabled} value={controller.handlingRatePerTon} onChange={(event) => controller.setHandlingRatePerTon(event.target.value)} min="0" />
          <span aria-hidden="true">/t</span>
        </div>
      </div>
      <p className={`field-hint freight-note${notes ? "" : " is-empty"}`} aria-live="polite">{notes}</p>
    </fieldset>
  );
}
