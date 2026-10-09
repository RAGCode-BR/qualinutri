import { useCommercialData } from "../app/CommercialDataProvider";

export function DataSourceStatus() {
  const { loading, message, reload, source } = useCommercialData();
  const state = loading ? "is-loading" : source === "local" ? "is-local" : "is-remote";
  const label = loading ? "Atualizando dados" : source === "local" ? "Dados locais em uso" : "Dados atualizados";

  return (
    <div className={`data-source-status ${state}`} role="status" aria-live="polite" title={message}>
      <span className="status-dot" aria-hidden="true" />
      <span>{label}</span>
      {!loading && source === "local" && (
        <button type="button" onClick={reload}>Tentar novamente</button>
      )}
    </div>
  );
}
