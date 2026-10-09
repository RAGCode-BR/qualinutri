import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { useCommercialData } from "../../app/CommercialDataProvider";

function formatDecimal(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function FreightPage() {
  const { data: { juaraFreightRates, regionalFreightRates } } = useCommercialData();
  return (
    <>
      <p className="page-intro">Frete e descarga não têm desconto. Tabelas de 06/05/2026.</p>
      <Panel title="Juara, por distância" description="Valores em R$ por saco na carga fracionada e em R$ por tonelada na carga fechada." flush>
        <ScrollableTable><table className="data-table">
          <thead><tr><th scope="col">Distância</th><th scope="col" className="numeric">Saco 25 kg</th><th scope="col" className="numeric">Saco 30 kg</th><th scope="col" className="numeric">Saco 40 kg</th><th scope="col" className="numeric">Carga fechada (R$/t)</th></tr></thead>
          <tbody>{juaraFreightRates.map((rate) => <tr key={rate.distance}><td className="strong">{rate.distance}</td><td className="numeric">{formatDecimal(rate.bag25)}</td><td className="numeric">{formatDecimal(rate.bag30)}</td><td className="numeric">{formatDecimal(rate.bag40)}</td><td className="numeric">{rate.closedPerTon}</td></tr>)}</tbody>
        </table></ScrollableTable>
        <ul className="note-list panel-footnote">
          <li>Carga fechada é uma única entrega de 10, 18 ou 28 t. Descarga por conta do cliente.</li>
          <li>Produto entregue descarregado: acrescentar R$ 40,00 por tonelada. Não vender descarregado em vendas fracionadas.</li>
          <li>Entrega mínima de 1.000 kg por cliente.</li>
          <li>Chapa (carga e descarga terceirizada): R$ 40,00 por tonelada, cobrada à parte e sem desconto.</li>
        </ul>
      </Panel>
      <Panel title="Regional, por cidade" description="Valores em R$ por tonelada, entregue na fazenda sem descarga." flush>
        <ScrollableTable><table className="data-table">
          <thead><tr><th scope="col">Cidade ou faixa</th><th scope="col" className="numeric">Fracionada (R$/t)</th><th scope="col" className="numeric">Carga fechada (R$/t)</th></tr></thead>
          <tbody>{regionalFreightRates.map((rate) => <tr key={rate.location}><td className="strong">{rate.location}</td><td className="numeric">{rate.fractionalPerTon ?? "—"}</td><td className="numeric">{rate.closedPerTon}</td></tr>)}</tbody>
        </table></ScrollableTable>
        <ul className="note-list panel-footnote">
          <li>Fracionada é mais de uma entrega. Carga fechada é uma única entrega de 10, 18 ou 28 t.</li>
          <li>Sacos por tonelada: ração, 25; mineral, proteico e núcleos, 33,33; concentrado 130/160, 40.</li>
          <li>Aripuanã e Cotriguaçu: mínimo de 10 t. Juruena: mínimo de 9 t.</li>
          <li>Descarga por conta do cliente.</li>
        </ul>
      </Panel>
    </>
  );
}
