import { Panel } from "../../components/Panel";
import { useCommercialData } from "../../app/CommercialDataProvider";

export function DiscountsPage() {
  const { data: { discountLines } } = useCommercialData();
  return (
    <div className="page-columns">
      <Panel title="Desconto por linha de produto" description="Tabela de 24/02/2026" flush>
        <table className="data-table">
          <thead><tr><th scope="col">Linha ou produto</th><th scope="col" className="numeric">Desconto</th></tr></thead>
          <tbody>
            {discountLines.filter((line) => line.percentage !== null).map((line) => (
              <tr key={line.name}><td>{line.name}</td><td className="numeric"><span className="value-badge">{line.percentage}%</span></td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Como aplicar" className="aside-panel">
        <ul className="note-list">
          <li>O desconto incide sobre o preço de tabela, independente da condição de pagamento.</li>
          <li>Frete e descarga não têm desconto.</li>
          <li>As condições são promocionais e podem mudar a qualquer momento.</li>
          <li>Somar o 1,5% do pagamento antecipado ao desconto de linha exige aprovação do Gestor Comercial e da Diretoria.</li>
        </ul>
      </Panel>
    </div>
  );
}
