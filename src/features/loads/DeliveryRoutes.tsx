import { useEffect, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { listDeliveryRoutes, type DeliveryRoute, type DeliveryStop } from "../../services/logisticsService";
import { DeliveryProof } from "./DeliveryProof";
import { formatDate, formatKg, formatPlate, loadStatusLabels } from "./loadModel";
import type { LoadStatus } from "../../services/loadService";

function mapUrl(address: string) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: address })}`;
}

function directions(addresses: string[], origin?: string) {
  const params = new URLSearchParams({ api: "1", destination: addresses.at(-1)!, travelmode: "driving" });
  if (origin) params.set("origin", origin);
  if (addresses.length > 1) params.set("waypoints", addresses.slice(0, -1).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

export function DeliveryRoutes({ loadId, onBack, onPrint }: {
  loadId?: string;
  onBack?: () => void;
  onPrint?: (stop: number) => void;
}) {
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [proof, setProof] = useState<{ route: DeliveryRoute; stop: DeliveryStop } | null>(null);

  useEffect(() => {
    let active = true;
    listDeliveryRoutes(loadId).then((rows) => {
      if (active) { setRoutes(rows); setError(""); }
    }).catch((reason: Error) => {
      if (active) setError(reason.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadId, retry]);

  return (
    <div className="delivery-routes">
      {onBack && <button type="button" className="secondary-button" onClick={onBack}>Voltar às ordens</button>}
      {loading && <p role="status">Carregando roteiros…</p>}
      {error && <p role="alert">{error} <button className="link-button" onClick={() => setRetry(retry + 1)}>Tentar novamente</button></p>}
      {!loading && !error && !routes.length && <EmptyState title="Nenhum roteiro disponível">As cargas expedidas atribuídas à sua conta aparecem aqui.</EmptyState>}
      {routes.map((route) => {
        const addresses = route.stops.map((stop) => stop.address);
        const routeLinks = [];
        if (addresses.length && addresses.every((address): address is string => Boolean(address))) {
          // No navegador móvel o Maps aceita até três paradas intermediárias por link.
          for (let index = 0; index < addresses.length; index += 4) {
            const link = directions(addresses.slice(index, index + 4), addresses[index - 1]);
            if (link.length <= 2048) routeLinks.push({ start: index + 1, end: Math.min(index + 4, addresses.length), link });
          }
        }
        return (
          <Panel key={route.id} title={`Roteiro da carga #${route.load_number}`}
            description={[formatDate(route.planned_date), route.vehicle_name_snapshot, formatPlate(route.vehicle_plate_snapshot), route.driver_name_snapshot, loadStatusLabels[route.status as LoadStatus]].filter(Boolean).join(" · ")}
          >
            {routeLinks.length > 0 && <div className="loads-toolbar-actions">
              {routeLinks.map(({ start, end, link }) => <a key={start} href={link} className="secondary-button" target="_blank" rel="noreferrer">
                {routeLinks.length === 1 ? "Abrir roteiro no mapa" : `Mapa das paradas ${start}–${end}`}
              </a>)}
            </div>}
            <ol className="load-stops">
              {route.stops.map((stop) => (
                <li className="load-stop delivery-stop" key={stop.stop_order}>
                  <div className="load-stop-head">
                    <span className="load-stop-number">{stop.stop_order}ª entrega</span>
                    <strong>{stop.customer_name}</strong>
                  </div>
                  <p>{stop.address || "Endereço pendente"}</p>
                  <ul>{stop.items.map((item, index) => (
                    <li key={index}>{item.product} · {item.bags} sacas · {formatKg(item.weight)}</li>
                  ))}</ul>
                  <p role="status">{stop.delivered_at
                    ? `Recebido por ${stop.receiver_name} em ${new Date(stop.delivered_at).toLocaleString("pt-BR")}`
                    : "Comprovação pendente"}</p>
                  <div className="loads-toolbar-actions">
                    {stop.address && <a href={mapUrl(stop.address)} target="_blank" rel="noreferrer">Mapa do destino</a>}
                    {onPrint && <button className="secondary-button" onClick={() => onPrint(stop.stop_order)}>Imprimir ordem</button>}
                    {(route.status === "shipped" || stop.delivered_at) && (
                      <button className="primary-button" onClick={() => setProof({ route, stop })}>
                        {stop.delivered_at ? "Ver comprovante" : "Comprovar entrega"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        );
      })}
      {proof && <DeliveryProof route={proof.route} stop={proof.stop} onClose={() => setProof(null)}
        onSaved={() => { setProof(null); setRetry(retry + 1); }} />}
    </div>
  );
}
