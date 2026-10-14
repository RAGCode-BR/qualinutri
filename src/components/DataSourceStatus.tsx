import { useCommercialData } from "../app/CommercialDataProvider";

/** Aparece só quando o servidor não respondeu e o sistema está usando os dados locais. */
export function DataSourceStatus() {
  const { loading, message, reload, source } = useCommercialData();
  if (loading || source !== "local") return null;

  return (
    <div className="data-source-status is-local" role="status" aria-live="polite" title={message}>
      <span className="status-dot" aria-hidden="true" />
      <span>Sem conexão: os valores podem estar desatualizados</span>
      <button type="button" onClick={reload}>Tentar novamente</button>
    </div>
  );
}
