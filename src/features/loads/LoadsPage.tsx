import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { DateInput } from "../../components/DateInput";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { failure, Notice, success, type NoticeState } from "../../components/Notice";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import type { PalletSettings } from "../../domain/loads/summarizeLoad";
import {
  getLoad,
  getPalletSettings,
  listLoads,
  listVehicles,
  setLoadStatus,
  type LoadDetail,
  type LoadFilter,
  type LoadListItem,
  type LoadStatus,
  type Vehicle,
} from "../../services/loadService";
import { formatNumber } from "../../utils/formatters";
import { customerKeyOf, emptyEditorState, LoadEditor, type EditorState } from "./LoadEditor";
import { formatDate, formatKg, formatPlate, loadStatusBadge, loadStatusLabels } from "./loadModel";
import { DeliveryRoutes } from "./DeliveryRoutes";
import { listDeliveryRoutes } from "../../services/logisticsService";
import type { SavedLayout } from "./LoadPlanning3D";
import { LoadPrint } from "./LoadPrint";
import { PalletSettingsDialog, VehiclesDialog } from "./VehicleDialogs";

const filters: Array<{ value: LoadFilter; label: string }> = [
  { value: "open", label: "Em aberto" },
  { value: "shipped", label: "Expedidas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "all", label: "Todas" },
];

/** Montagem em andamento: sobrevive à troca de página, como o pedido da Calculadora. */
let editorDraft: { userId: string | undefined; state: EditorState } | null = null;

function hasWork(state: EditorState) {
  return state.loadId !== null || state.vehicleId !== "" || Object.keys(state.orders).length > 0;
}

function toEditorState(detail: LoadDetail): EditorState {
  const orders: EditorState["orders"] = {};
  const stops: string[] = [];
  for (const item of detail.items) {
    const order = orders[item.quote_id] ?? { packing: item.packing, quantities: {} };
    order.quantities[item.quote_item_id] = String(item.quantity);
    orders[item.quote_id] = order;
    const key = customerKeyOf(item.quote_id, item.quotes?.customer_id ?? null);
    if (!stops.includes(key)) stops.push(key);
  }
  return {
    loadId: detail.load.id,
    loadNumber: detail.load.load_number,
    vehicleId: detail.load.vehicle_id,
    plannedDate: detail.load.planned_date ?? "",
    notes: detail.load.notes ?? "",
    orders,
    stops,
    layout: (detail.load.layout_3d as unknown as SavedLayout | null) ?? undefined,
    driverId: detail.load.driver_id ?? undefined,
  };
}

function statusDate(load: LoadListItem) {
  if (load.status === "shipped") return formatDate(load.shipped_at);
  if (load.status === "loaded") return formatDate(load.loaded_at);
  if (load.status === "cancelled") return formatDate(load.cancelled_at);
  return null;
}

function customerNames(load: LoadListItem) {
  const names: string[] = [];
  for (const item of [...load.load_items].sort((a, b) => a.stop_order - b.stop_order)) {
    const name = item.quotes?.customer_name_snapshot || "Sem cliente vinculado";
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

type Confirming = { kind: "ship" | "cancel"; load: LoadListItem } | null;

export function LoadsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "administrador";
  const [day, setDay] = useState("");
  const [filter, setFilter] = useState<LoadFilter>("open");
  const [loads, setLoads] = useState<LoadListItem[]>([]);
  const shownLoads = day ? loads.filter((load) => load.planned_date === day) : loads;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [pallet, setPallet] = useState<PalletSettings>({ palletWeightKg: null, bagsPerPallet: {} });
  const [setupError, setSetupError] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(() =>
    editorDraft && editorDraft.userId === profile?.id && hasWork(editorDraft.state) ? editorDraft.state : null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preparingPrintId, setPreparingPrintId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [showVehicles, setShowVehicles] = useState(false);
  const [showPallet, setShowPallet] = useState(false);
  const [route, setRoute] = useState<LoadListItem | null>(null);
  const [printing, setPrinting] = useState<{ detail: LoadDetail; nonce: number; stop?: number; addresses: Record<number, string | null> } | null>(null);
  const request = useRef(0);

  function loadSetup() {
    setSetupError("");
    Promise.all([listVehicles(), getPalletSettings()])
      .then(([vehicleRows, settings]) => { setVehicles(vehicleRows); setPallet(settings); })
      .catch(() => setSetupError("Não foi possível carregar os veículos e os dados de palete."));
  }
  useEffect(loadSetup, []);

  async function reload() {
    const current = ++request.current;
    setLoading(true);
    try {
      const rows = await listLoads(filter);
      if (current !== request.current) return;
      setLoads(rows);
      setLoadError("");
    } catch {
      if (current === request.current) setLoadError("Não foi possível carregar as cargas.");
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  useEffect(() => { void reload(); }, [filter]);

  function openEditor(state: EditorState) {
    setNotice(null);
    editorDraft = { userId: profile?.id, state };
    setEditor(state);
    window.scrollTo({ top: 0 });
  }

  async function editLoad(load: LoadListItem) {
    if (busyId) return;
    setBusyId(load.id);
    try {
      openEditor(toEditorState(await getLoad(load.id)));
    } catch (error) {
      setNotice(failure(error instanceof Error ? error.message : "Não foi possível abrir a carga."));
    } finally {
      setBusyId(null);
    }
  }

  async function printLoad(load: LoadListItem, stop?: number) {
    if (busyId) return;
    setBusyId(load.id);
    setPreparingPrintId(load.id);
    setNotice(null);
    try {
      const [detail, routes] = await Promise.all([getLoad(load.id), listDeliveryRoutes(load.id)]);
      const addresses = Object.fromEntries((routes[0]?.stops ?? []).map((destination) => [destination.stop_order, destination.address]));
      setPrinting({ detail, nonce: Date.now(), stop, addresses });
    } catch {
      setNotice(failure(`Não foi possível gerar o romaneio da carga #${load.load_number}.`));
    } finally {
      setBusyId(null);
      setPreparingPrintId(null);
    }
  }

  async function changeStatus(load: LoadListItem, status: LoadStatus, done: string) {
    if (busyId) return;
    setBusyId(load.id);
    setNotice(null);
    try {
      await setLoadStatus(load.id, status);
      setNotice(success(`Carga #${load.load_number} ${done}.`));
      await reload();
    } catch (error) {
      setNotice(failure(error instanceof Error ? error.message : "Não foi possível mudar a situação da carga."));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmAction() {
    if (!confirming) return;
    const { kind, load } = confirming;
    await setLoadStatus(load.id, kind === "ship" ? "shipped" : "cancelled");
    setConfirming(null);
    setNotice(success(kind === "ship" ? `Carga #${load.load_number} marcada como expedida.` : `Carga #${load.load_number} cancelada. As sacas voltaram para “a enviar”.`));
    await reload();
  }

  if (route) return (
    <>
      <Notice notice={notice} />
      <DeliveryRoutes loadId={route.id} onBack={() => setRoute(null)} onPrint={(stop) => void printLoad(route, stop)} />
      {printing && <LoadPrint key={printing.nonce} detail={printing.detail} stop={printing.stop}
        addresses={printing.addresses} onDone={() => setPrinting(null)} />}
    </>
  );

  if (editor) {
    return (
      <LoadEditor
        key={editor.loadId ?? "new"}
        initial={editor}
        vehicles={vehicles}
        pallet={pallet}
        onChange={(state) => { editorDraft = { userId: profile?.id, state }; }}
        onClose={(savedMessage) => {
          editorDraft = null;
          setEditor(null);
          if (savedMessage) {
            setNotice(success(savedMessage));
            setFilter("open");
            void reload();
          }
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return (
    <>
      <Notice notice={notice} />
      {setupError && (
        <p className="auth-error page-notice" role="alert">{setupError} <button type="button" className="link-button" onClick={loadSetup}>Tentar novamente</button></p>
      )}

      <div className="page-toolbar loads-toolbar">
        <div className="segmented" role="group" aria-label="Situação das cargas">
          {filters.map((option) => (
            <button key={option.value} type="button" aria-pressed={filter === option.value} className={filter === option.value ? "is-selected" : undefined} onClick={() => setFilter(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <label className="field">Data de saída
          <DateInput value={day} onChange={setDay} />
        </label>
        <div className="loads-toolbar-actions">
          {isAdmin && <button type="button" className="secondary-button compact-secondary" onClick={() => setShowVehicles(true)}>Veículos</button>}
          {isAdmin && <button type="button" className="secondary-button compact-secondary" onClick={() => setShowPallet(true)}>Paletes</button>}
          <button type="button" className="primary-button compact-button" onClick={() => openEditor(emptyEditorState)}>Montagem de carga</button>
        </div>
      </div>

      {!setupError && vehicles.length === 0 && !loading && (
        <p className="warning-message page-notice">
          {isAdmin ? "Cadastre os caminhões em “Veículos” para montar as cargas." : "Nenhum veículo cadastrado. Peça a um administrador para cadastrar os caminhões."}
        </p>
      )}

      <Panel
        title={`Ordens de carga · ${filters.find((option) => option.value === filter)?.label ?? ""}`}
        description="As 100 mais recentes."
        actions={!loading && !loadError && <span className="count-badge">{shownLoads.length} {shownLoads.length === 1 ? "carga" : "cargas"}</span>}
        flush
      >
        {loadError ? (
          <div className="empty-items">
            <p><strong>{loadError}</strong></p>
            <p><button type="button" className="link-button" onClick={() => void reload()}>Tentar novamente</button></p>
          </div>
        ) : loading && shownLoads.length === 0 ? <p className="panel-loading">Carregando cargas…</p> : shownLoads.length === 0 ? (
          filter === "open"
            ? <EmptyState title="Nenhuma carga em aberto.">Clique em “Nova carga” para montar o envio dos pedidos aprovados.</EmptyState>
            : <EmptyState title="Nenhuma carga nesta situação." />
        ) : (
          <ScrollableTable><table className={`data-table stack-table loads-table${loading ? " is-refreshing" : ""}`}>
            <thead><tr><th scope="col">Carga</th><th scope="col">Veículo</th><th scope="col">Situação</th><th scope="col">Peso</th><th scope="col">Entregas</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{shownLoads.map((load) => {
              const status = load.status as LoadStatus;
              const weight = Number(load.total_weight_kg);
              const capacity = Number(load.capacity_kg_snapshot);
              const percent = capacity > 0 ? Math.round((weight / capacity) * 100) : 0;
              const names = customerNames(load);
              const orders = new Set(load.load_items.map((item) => item.quote_id)).size;
              const date = statusDate(load);
              return (
                <tr key={load.id}>
                  <td className="cell-primary">
                    <span className="strong">#{load.load_number}</span>
                    {load.planned_date && <span className="cell-sub">Saída {formatDate(load.planned_date)}</span>}
                  </td>
                  <td data-label="Veículo">
                    <span className="cell-value">
                      <span>{load.vehicle_name_snapshot}</span>
                      {load.vehicle_plate_snapshot && <span className="cell-sub">{formatPlate(load.vehicle_plate_snapshot)}</span>}
                    </span>
                  </td>
                  <td className="nowrap-cell" data-label="Situação">
                    <span className="cell-value">
                      <span className={`status-badge ${loadStatusBadge[status]}`}>{loadStatusLabels[status] ?? load.status}</span>
                      {date && <span className="cell-sub">em {date}</span>}
                    </span>
                  </td>
                  <td data-label="Peso">
                    <span className="cell-value load-cell-weight">
                      <span>{formatKg(weight)} <span className="muted-cell">de {formatKg(capacity)}</span></span>
                      <span className={`mini-meter${percent >= 90 ? " is-warning" : ""}`} aria-hidden="true"><span style={{ width: `${Math.min(percent, 100)}%` }} /></span>
                      <span className="cell-sub">{percent}%{load.pallet_count > 0 ? ` · ${formatNumber(load.pallet_count)} paletes` : ""}</span>
                    </span>
                  </td>
                  <td data-label="Entregas">
                    <span className="cell-value">
                      <span>{names.slice(0, 2).join(", ")}{names.length > 2 ? ` e mais ${names.length - 2}` : ""}</span>
                      <span className="cell-sub">{orders} {orders === 1 ? "pedido" : "pedidos"}</span>
                    </span>
                  </td>
                  <td className="action-cell">
                    {status === "planned" && <>
                      <button type="button" className="row-button is-primary" disabled={busyId !== null} onClick={() => void changeStatus(load, "loaded", "marcada como carregada")}>Marcar como carregada<span className="sr-only"> carga {load.load_number}</span></button>
                      <button type="button" className="row-button" disabled={busyId !== null} onClick={() => void editLoad(load)}>Editar<span className="sr-only"> carga {load.load_number}</span></button>
                    </>}
                    {status === "loaded" && <>
                      <button type="button" className="row-button is-primary" disabled={busyId !== null} onClick={() => setConfirming({ kind: "ship", load })}>Marcar como expedida<span className="sr-only"> carga {load.load_number}</span></button>
                      <button type="button" className="row-button" disabled={busyId !== null} onClick={() => void changeStatus(load, "planned", "voltou para planejada")}>Voltar para planejada<span className="sr-only"> carga {load.load_number}</span></button>
                    </>}
                    {status !== "cancelled" && <button type="button" className="row-button" disabled={busyId !== null} onClick={() => void printLoad(load)}>{preparingPrintId === load.id ? "Gerando…" : "Ordens por destino"}<span className="sr-only"> carga {load.load_number}</span></button>}
                    {status !== "cancelled" && <button type="button" className="row-button" onClick={() => { setRoute(load); window.scrollTo({ top: 0 }); }}>Roteiro e entregas</button>}
                    {(status === "planned" || status === "loaded") && <button type="button" className="row-button is-danger" disabled={busyId !== null} onClick={() => setConfirming({ kind: "cancel", load })}>Cancelar<span className="sr-only"> carga {load.load_number}</span></button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></ScrollableTable>
        )}
      </Panel>

      {printing && <LoadPrint key={printing.nonce} detail={printing.detail} stop={printing.stop} addresses={printing.addresses} onDone={() => setPrinting(null)} />}

      {confirming?.kind === "ship" && (
        <ConfirmDialog
          title={`Marcar a carga #${confirming.load.load_number} como expedida?`}
          description="A carga saiu da fábrica: os pedidos dela passam a contar como expedidos. Uma carga expedida não pode mais ser alterada nem cancelada."
          confirmLabel="Marcar como expedida"
          cancelLabel="Voltar"
          onConfirm={confirmAction}
          onClose={() => setConfirming(null)}
        />
      )}
      {confirming?.kind === "cancel" && (
        <ConfirmDialog
          title={`Cancelar a carga #${confirming.load.load_number}?`}
          description="A carga continua na lista como Cancelada, e as sacas dos pedidos voltam para “a enviar”."
          confirmLabel="Cancelar carga"
          cancelLabel="Voltar"
          danger
          onConfirm={confirmAction}
          onClose={() => setConfirming(null)}
        />
      )}
      {showVehicles && <VehiclesDialog onClose={() => setShowVehicles(false)} onChanged={loadSetup} />}
      {showPallet && (
        <PalletSettingsDialog
          settings={pallet}
          onClose={() => setShowPallet(false)}
          onSaved={(text) => { setShowPallet(false); setNotice(success(text)); loadSetup(); }}
        />
      )}
    </>
  );
}
