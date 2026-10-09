import { useEffect, useState } from "react";
import { loadSalesReport, type SalesReport } from "../../services/reportService";
import { formatCurrency, formatNumber } from "../../utils/formatters";
import { RankingPanel } from "./RankingPanel";
import {
  formatRange,
  periodPresetLabels,
  presetRange,
  validateRange,
  type DateRange,
  type PeriodPreset,
} from "./reportPeriod";

const presets = ["month", "lastMonth", "last7", "last30"] as const;

export function ReportsPage() {
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [range, setRange] = useState<DateRange>(() => presetRange("month"));
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const rangeError = validateRange(range);

  useEffect(() => {
    if (rangeError) return;
    let active = true;
    setLoading(true);
    setError("");
    loadSalesReport(range)
      .then((result) => { if (active) setReport(result); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o relatório."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range.from, range.to, rangeError]);

  function choosePreset(next: (typeof presets)[number]) {
    setPreset(next);
    setRange(presetRange(next));
  }

  function changeDate(field: keyof DateRange, value: string) {
    setPreset("custom");
    setRange((current) => ({ ...current, [field]: value }));
  }

  const totals = report?.totals;
  const averageTicket = totals && totals.orders > 0 ? totals.revenue / totals.orders : 0;
  const hasSales = Boolean(totals && totals.orders > 0);

  return (
    <>
      <div className="report-filters" role="group" aria-label="Período do relatório">
        <div className="segmented" role="radiogroup" aria-label="Atalhos de período">
          {presets.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={preset === option}
              className={preset === option ? "is-selected" : undefined}
              onClick={() => choosePreset(option)}
            >
              {periodPresetLabels[option]}
            </button>
          ))}
        </div>
        <div className="report-dates">
          <label htmlFor="reportFrom">De</label>
          <input id="reportFrom" type="date" value={range.from} max={range.to || undefined} onChange={(event) => changeDate("from", event.target.value)} />
          <label htmlFor="reportTo">até</label>
          <input id="reportTo" type="date" value={range.to} min={range.from || undefined} onChange={(event) => changeDate("to", event.target.value)} />
        </div>
      </div>

      <p className="report-scope">
        Orçamentos aprovados entre {rangeError ? "…" : formatRange(range)}, pela data de aprovação. Valores dos produtos, sem frete e chapa.
        {report?.scope === "own" && " Mostrando apenas os seus orçamentos."}
      </p>

      {rangeError && <p className="auth-error page-notice" role="alert">{rangeError}</p>}
      {error && <p className="auth-error page-notice" role="alert">{error}</p>}

      <div className={`report-content${loading && report ? " is-refreshing" : ""}`} aria-busy={loading}>
        {!report && loading ? (
          <p className="muted">Carregando relatório…</p>
        ) : report && (
          <>
            <dl className="kpi-row">
              <div className="kpi-tile">
                <dt>Vendas em produtos</dt>
                <dd>{formatCurrency(report.totals.revenue)}</dd>
              </div>
              <div className="kpi-tile">
                <dt>Pedidos aprovados</dt>
                <dd>{formatNumber(report.totals.orders)}</dd>
              </div>
              <div className="kpi-tile">
                <dt>Ticket médio</dt>
                <dd>{formatCurrency(averageTicket)}</dd>
              </div>
            </dl>

            {!hasSales ? (
              <div className="panel">
                <div className="empty-items report-empty">
                  <p><strong>Nenhuma venda aprovada neste período.</strong></p>
                  <p>Os relatórios contam orçamentos marcados como aprovados na página Orçamentos.</p>
                </div>
              </div>
            ) : (
              <div className="ranking-grid">
                <RankingPanel title="Clientes que mais compraram" rows={report.customers} total={report.totals.revenue} emptyText="Sem clientes no período." />
                <RankingPanel title="Produtos que mais saíram" rows={report.products} total={report.totals.revenue} emptyText="Sem produtos no período." />
                <RankingPanel title="Categorias que mais saíram" rows={report.categories} total={report.totals.revenue} emptyText="Sem categorias no período." />
                {report.sellers && (
                  <RankingPanel title="Vendedores que mais venderam" rows={report.sellers} total={report.totals.revenue} emptyText="Sem vendedores no período." />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
