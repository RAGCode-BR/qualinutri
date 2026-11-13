import { useEffect, useState } from "react";
import { Panel } from "../../components/Panel";
import { HEIGHT_CLEARANCE_M, PAYLOAD_RATIO, inspectLayout, type BoxPosition, type CargoBox, type CargoSpace } from "../../domain/loads/loadLayout";
import { getOrderLogistics, listDeliveryRoutes, listDrivers, type DeliveryRoute, type Driver } from "../../services/logisticsService";
import { saveLoad, type Vehicle } from "../../services/loadService";
import { deliveryAddress, formatKg } from "./loadModel";
import { LoadYard, type YardManifest } from "./LoadYard";

type Item = { quoteItemId: string; productName: string; weightKg: number; quantity: number };
type Order = { quoteId: string; quoteNumber: number; customerKey: string; customerName: string; items: Item[] };
type Spec = { length: string; width: string; height: string; perStack: string };
type Stock = { now: string; expected: string };
export type SavedLayout = {
  positions: BoxPosition[];
  specs: Record<string, Spec>;
  destinations: Record<string, { address: string; quotes: string[] }>;
  stock?: Record<string, Stock>;
  credit?: Record<string, string>;
};
const emptySpec = { length: "", width: "", height: "", perStack: "8" };
const colors = ["#d5a56c", "#7ea6c8", "#9fbf86", "#ca98bb", "#e0cf75", "#92c7b9"];

function cargoSpace(vehicle: Vehicle): CargoSpace | null {
  const { body_length_cm: length, body_width_cm: width, body_height_cm: height } = vehicle;
  return length && width && height
    ? { L: length / 100, W: width / 100, H: height / 100 - HEIGHT_CLEARANCE_M, cap: Number(vehicle.capacity_kg), nome: vehicle.name }
    : null;
}

export function LoadPlanning3D({ orders, vehicles, vehicleId, plannedDate, notes, loadId, savedLayout, initialDriver, onVehicle, onClose }: {
  orders: Order[];
  vehicles: Vehicle[];
  vehicleId: string;
  plannedDate: string;
  notes: string;
  loadId: string | null;
  savedLayout: SavedLayout | null;
  initialDriver: string;
  onVehicle: (id: string) => void;
  onClose: (message: string) => void;
}) {
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getOrderLogistics>>>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [history, setHistory] = useState<DeliveryRoute[]>([]);
  const [driver, setDriver] = useState(initialDriver);
  const [addresses, setAddresses] = useState(() => Object.fromEntries(
    Object.values(savedLayout?.destinations ?? {}).flatMap((entry) => entry.quotes.map((id) => [id, entry.address])),
  ));
  const [specs, setSpecs] = useState<Record<string, Spec>>(savedLayout?.specs ?? {});
  const [stock, setStock] = useState<Record<string, Stock>>(savedLayout?.stock ?? {});
  const [credit, setCredit] = useState<Record<string, string>>(savedLayout?.credit ?? {});
  const [manifest, setManifest] = useState<YardManifest | null>(null);
  const [positions, setPositions] = useState<BoxPosition[]>(savedLayout?.positions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getOrderLogistics(orders.map((order) => order.quoteId)), listDrivers(), listDeliveryRoutes()])
      .then(([rows, availableDrivers, routes]) => {
        if (!active) return;
        setDetails(rows);
        setDrivers(availableDrivers);
        setHistory(routes);
        setLoaded(true);
      }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [orders, retry]);

  const vehicle = vehicles.find((entry) => entry.id === vehicleId);
  const space = vehicle ? cargoSpace(vehicle) : null;
  const destination = (order: Order) => addresses[order.quoteId] ??
    deliveryAddress(details.find((entry) => entry?.id === order.quoteId)?.customers?.address ?? null);
  const stopKey = (order: Order) => JSON.stringify([order.customerKey, destination(order).trim().toLocaleLowerCase("pt-BR")]);
  const groups = new Map<string, { name: string; address: string; quotes: string[] }>();
  const products = new Map<string, { label: string; bags: number }>();
  const boxes: CargoBox[] = [];
  let totalKg = 0;
  let missing = false;

  for (const order of orders) {
    const stop = stopKey(order);
    const group = groups.get(stop) ?? { name: order.customerName, address: destination(order).trim(), quotes: [] };
    group.quotes.push(order.quoteId);
    groups.set(stop, group);
    for (const item of order.items) {
      totalKg += item.weightKg * item.quantity;
      const key = details.find((entry) => entry?.id === order.quoteId)?.quote_items.find((line) => line.id === item.quoteItemId)?.product_id ?? item.quoteItemId;
      const product = products.get(key) ?? { label: `${item.productName} · ${item.weightKg} kg/saca`, bags: 0 };
      product.bags += item.quantity;
      products.set(key, product);

      const spec = specs[key] ?? emptySpec;
      const [length, width, height, perStack] = [Number(spec.length), Number(spec.width), Number(spec.height), Number(spec.perStack)];
      if (length < 5 || length > 300 || width < 5 || width > 200 || height < 2 || height > 150
        || !Number.isInteger(perStack) || perStack < 1 || perStack > 30 || item.quantity > 1500) {
        missing = true;
        continue;
      }
      for (let index = 0; index < Math.ceil(item.quantity / perStack); index++) {
        const bags = Math.min(perStack, item.quantity - index * perStack);
        boxes.push({
          key: `${item.quoteItemId}:${index}`, quoteId: order.quoteId, stop,
          label: `#${order.quoteNumber} · ${order.customerName}`,
          nome: `#${order.quoteNumber} · ${item.productName} · ${bags} sacas`,
          bags, w: length / 100, d: width / 100, h: height * bags / 100, kg: item.weightKg * bags,
          pallet: false, stack: true, color: colors[([...groups.keys()].indexOf(stop)) % colors.length],
        });
      }
    }
  }

  const volume = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0);
  const suggestedVehicle = !missing && vehicles.filter((entry) => {
    const candidate = cargoSpace(entry);
    return candidate && totalKg <= candidate.cap * PAYLOAD_RATIO
      && volume <= candidate.L * candidate.W * candidate.H
      && boxes.every((box) => box.h <= candidate.H &&
        ((box.w <= candidate.L && box.d <= candidate.W) || (box.d <= candidate.L && box.w <= candidate.W)));
  }).sort((a, b) => a.capacity_kg - b.capacity_kg)[0];
  const availableHistory = history.filter((route) => route.status === "shipped" && drivers.some((entry) => entry.id === route.driver_id));
  const cities = new Set(details.map((entry) => entry?.customers?.address)
    .map((address) => address && typeof address === "object" && !Array.isArray(address) ? address.city : null)
    .filter((city): city is string => typeof city === "string" && city.trim().length > 2)
    .map((city) => city.trim().toLocaleLowerCase("pt-BR")));
  const suggestion = availableHistory.find((route) => route.stops.some((stop) =>
    [...groups.values()].some((group) => stop.address && group.address === stop.address)))
    ?? availableHistory.find((route) => route.stops.some((stop) =>
      stop.address?.split(",").some((part) => cities.has(part.trim().toLocaleLowerCase("pt-BR")))));
  const currentCredit = [...new Map(orders.map((order) => [order.customerKey, order.customerName])).entries()];
  const check = manifest ? inspectLayout(manifest.vehicle, manifest.boxes, positions) : null;
  const hasRestriction = currentCredit.some(([key]) => credit[key] === "blocked");
  const unconfirmedStock = [...products.keys()].some((key) => !stock[key]?.now?.trim());
  const unconfirmedForecast = [...products].some(([key, product]) =>
    stock[key]?.now?.trim() && Number(stock[key].now) < product.bags && !stock[key].expected?.trim());
  const unconfirmedCredit = currentCredit.some(([key]) => !credit[key]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const unavailableForDate = [...products].some(([key, product]) => {
    const balance = stock[key];
    if (!balance?.now?.trim()) return false;
    if (Number(balance.now) >= product.bags) return false;
    return plannedDate <= today || (Boolean(balance.expected.trim()) && Number(balance.expected) < product.bags);
  });

  function openYard() {
    if (!space) return;
    setError("");
    const originals = new Map(boxes.map((box) => [box.key, box]));
    const previous = positions;
    const restored = previous.filter((position) => {
      const box = originals.get(position.key);
      return box && ((position.w === box.w && position.d === box.d) || (position.w === box.d && position.d === box.w));
    });
    setPositions(restored);
    setManifest({ id: crypto.randomUUID(), vehicle: space, boxes, positions: restored });
  }

  async function closeLoad() {
    if (saving || !manifest || !check || check.problems.length || totalKg > manifest.vehicle.cap * PAYLOAD_RATIO || hasRestriction || unavailableForDate) return;
    setError("");
    setSaving(true);
    try {
      const destinations = Object.fromEntries(check.stops.map((stop, index) => {
        const group = groups.get(stop)!;
        return [index + 1, { address: group.address, quotes: group.quotes }];
      }));
      const saved = await saveLoad(loadId, {
        vehicleId, plannedDate, notes: notes.trim() || null, driverId: driver || null,
        layout: { positions, specs, destinations, stock, credit },
      }, orders.flatMap((order) => order.items.map((item) => ({
        quoteItemId: item.quoteItemId, quantity: item.quantity, packing: "loose" as const,
        stopOrder: check.stops.indexOf(stopKey(order)) + 1,
      }))));
      onClose(`Carga #${saved.load_number} planejada. A ordem por destino e o roteiro estão disponíveis.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível fechar a carga.");
      setSaving(false);
    }
  }

  return (
    <Panel title="Montagem de carga 3D">
      {!loaded && <p role="status">{error ? <button type="button" className="secondary-button" onClick={() => { setError(""); setRetry(retry + 1); }}>Tentar novamente</button> : "Buscando os dados dos pedidos…"}</p>}
      {loaded && !manifest && <>
        {!space && <p className="warning-message">Cadastre comprimento, largura e altura internos em Cargas → Veículos.</p>}
        <div className="form-grid">
          <label className="field">Motorista
            <select aria-label="Motorista" value={driver} onChange={(event) => setDriver(event.target.value)}>
              <option value="">A definir</option>
              {drivers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          {suggestion && !driver && <button type="button" className="secondary-button" onClick={() => setDriver(suggestion.driver_id!)}>
            Sugerido pelo histórico: {suggestion.driver_name_snapshot}
          </button>}
        </div>
        <h3>Endereços de entrega</h3>
        <div className="form-grid">
          {orders.map((order) => <label className="field" key={order.quoteId}>
            #{order.quoteNumber} · {order.customerName}
            {details.find((entry) => entry?.id === order.quoteId)?.freight_zone_snapshot && (
              <small>{details.find((entry) => entry?.id === order.quoteId)?.freight_zone_snapshot}</small>
            )}
            <input value={destination(order)} maxLength={500} onChange={(event) => setAddresses({ ...addresses, [order.quoteId]: event.target.value })} />
          </label>)}
        </div>
        <h3>Medidas das sacas e conferência de estoque</h3>
        <p className="field-hint">Informe as medidas reais por produto. O estoque previsto inclui o saldo que ficará disponível após a entrada da produção no fim do dia.</p>
        {[...products].map(([key, product]) => (
          <fieldset className="price-fieldset" key={key}>
            <legend>{product.label} · {product.bags} sacas na carga</legend>
            <div className="form-grid compact">
              {([["length", "Comprimento (cm)"], ["width", "Largura (cm)"], ["height", "Altura (cm)"], ["perStack", "Sacas por pilha"]] as const).map(([field, label]) => (
                <label className="field" key={field}>{label}
                  <input type="number" min="1" step={field === "perStack" ? 1 : "any"} value={(specs[key] ?? emptySpec)[field]}
                    onChange={(event) => setSpecs({ ...specs, [key]: { ...(specs[key] ?? emptySpec), [field]: event.target.value } })} />
                </label>
              ))}
              {([["now", "Disponível agora (sacas)"], ["expected", "Previsto após produção (sacas)"]] as const).map(([field, label]) => (
                <label className="field" key={field}>{label}
                  <input type="number" min="0" step="1" placeholder="Não conferido" value={stock[key]?.[field] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "" || (Number.isInteger(Number(value)) && Number(value) >= 0)) {
                        setStock({ ...stock, [key]: { ...(stock[key] ?? { now: "", expected: "" }), [field]: value } });
                      }
                    }} />
                </label>
              ))}
            </div>
            {stock[key]?.now && Number(stock[key].now) < product.bags && <p className="warning-message">Saldo atual insuficiente para retirada imediata.</p>}
          </fieldset>
        ))}
        <h3>Conferência de crédito</h3>
        <div className="form-grid">
          {currentCredit.map(([key, name]) => <label key={key} className="field">{name}
            <select value={credit[key] ?? ""} onChange={(event) => setCredit({ ...credit, [key]: event.target.value })}>
              <option value="">Não conferido</option><option value="ok">Liberado</option><option value="blocked">Com restrição ou boleto vencido</option>
            </select>
          </label>)}
        </div>
        <p className="field-hint">Estoque e crédito são conferências manuais nesta montagem.</p>
        {groups.size > 99 && <p className="warning-message">A carga pode ter até 99 destinos.</p>}
        {boxes.length > 1500 && <p className="warning-message">Divida a montagem em cargas com até 1.500 volumes.</p>}
        {missing && <p className="warning-message">Preencha as medidas por produto e informe de 1 a 30 sacas por pilha.</p>}
        {suggestedVehicle && suggestedVehicle.id !== vehicleId && (
          <button type="button" className="secondary-button" onClick={() => onVehicle(suggestedVehicle.id)}>
            Sugerido por peso e volume: {suggestedVehicle.name}
          </button>
        )}
        {space && totalKg > space.cap * PAYLOAD_RATIO && <p className="warning-message">O peso excede o limite com 5% de reserva ({formatKg(space.cap * PAYLOAD_RATIO)}).</p>}
        <button type="button" className="primary-button"
          disabled={!space || missing || !boxes.length || boxes.length > 1500 || !plannedDate || groups.size > 99 || orders.some((order) => order.customerKey.startsWith("pedido:") || destination(order).trim().length < 5)}
          onClick={openYard}>Abrir pátio 3D</button>
        <p className="field-hint">Informe a data de saída, selecione pedidos de clientes vinculados e confirme o endereço de cada entrega.</p>
      </>}
      {manifest && check && <>
        <LoadYard key={manifest.id} manifest={manifest} onLayout={setPositions} />
        <div className="logistics-result">
          <p><strong>{formatKg(totalKg)}</strong> · {Math.round(check.fill * 100)}% do volume · {check.loaded}/{boxes.length} volumes posicionados</p>
          {check.stops.length > 0 && <ol>{check.stops.map((key) => <li key={key}>{groups.get(key)?.name} · {groups.get(key)?.address}</li>)}</ol>}
          {check.problems.map((problem) => <p key={problem} className="warning-message">{problem}</p>)}
          <button type="button" className="secondary-button" disabled={saving} onClick={() => setManifest(null)}>Ajustar dados da carga</button>
          <button type="button" className="primary-button" disabled={saving || check.problems.length > 0 || !space ||
            totalKg > space.cap * PAYLOAD_RATIO || unavailableForDate || hasRestriction} onClick={() => void closeLoad()}>
            {saving ? "Fechando…" : "Fechar carga"}
          </button>
        </div>
      </>}
      {unconfirmedStock && <p className="warning-message">Há produtos com estoque atual não conferido.</p>}
      {unconfirmedForecast && <p className="warning-message">Há produtos sem saldo imediato e com previsão de produção não conferida.</p>}
      {unconfirmedCredit && <p className="warning-message">Há clientes com crédito não conferido.</p>}
      {hasRestriction && <p className="warning-message">Há cliente com crédito restrito. Confirme a liberação antes de fechar a carga.</p>}
      {unavailableForDate && <p className="warning-message">O estoque informado é insuficiente para a data de saída.</p>}
      {error && <p role="alert" className="auth-error">{error}</p>}
    </Panel>
  );
}
