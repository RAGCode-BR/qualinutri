import type { LoadType } from "../../domain";
import type { CalculatorController } from "./useCalculator";

type FreightFormProps = {
  controller: CalculatorController;
};

export function FreightForm({ controller }: FreightFormProps) {
  const { freightForm, itemForm } = controller;
  const { juaraFreightRates, regionalFreightRates } = controller.data;
  const ranges = freightForm.table === "juara" ? juaraFreightRates : regionalFreightRates;
  const showDetails = freightForm.table !== "";
  const notes = controller.calculation.notes.join(" ");

  return (
    <fieldset className="panel form-section freight-box">
      <legend className="panel-title">Frete e descarga <span className="panel-title-note">opcional, sem desconto</span></legend>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="freightTable">Tabela de frete</label>
          <select
            id="freightTable"
            name="freightTable"
            value={freightForm.table}
            onChange={(event) => controller.changeFreightTable(event.target.value as "" | "juara" | "regional")}
          >
            <option value="">Não incluir frete</option>
            <option value="juara">Juara (por distância)</option>
            <option value="regional">Regional (por cidade)</option>
          </select>
        </div>
        {showDetails && (
          <>
            <div className="field">
              <label htmlFor="freightRange">Faixa ou cidade</label>
              <select id="freightRange" name="freightRange" value={freightForm.rangeIndex} onChange={(event) => controller.changeFreightField("rangeIndex", event.target.value)}>
                {ranges.map((range, index) => (
                  <option key={"distance" in range ? range.distance : range.location} value={index}>
                    {"distance" in range ? range.distance : range.location}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="loadType">Tipo de carga</label>
              <select id="loadType" name="loadType" value={freightForm.loadType} onChange={(event) => controller.changeFreightField("loadType", event.target.value as LoadType)}>
                <option value="fractional">Fracionada</option>
                <option value="closed">Carga fechada</option>
              </select>
            </div>
            {controller.showManualWeight && <div className="field">
              <label htmlFor="bagWeight">Peso do saco</label>
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
          <input aria-label="Valor da chapa por tonelada" name="handlingRate" type="number" value={controller.handlingRatePerTon} onChange={(event) => controller.setHandlingRatePerTon(event.target.value)} min="0" step="1" />
          <span aria-hidden="true">/t</span>
        </div>
      </div>
      <p className={`field-hint freight-note${notes ? "" : " is-empty"}`} aria-live="polite">{notes}</p>
    </fieldset>
  );
}
