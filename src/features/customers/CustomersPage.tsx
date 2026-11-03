import { useEffect, useMemo, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { deactivateCustomer, listCustomers, type Customer } from "../../services/customerService";
import { CustomerFormDialog } from "./CustomerFormDialog";
import { CustomerDetailDialog } from "./CustomerDetailDialog";
import { failure, Notice, success, type NoticeState } from "../../components/Notice";
import { sourceField } from "./customerSourceFields";

/** null: janela fechada; "new": cadastro; Customer: edição. */
type FormTarget = null | "new" | Customer;

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [deactivating, setDeactivating] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [deactivatingBusy, setDeactivatingBusy] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<15 | 30 | 50>(15);
  const [page, setPage] = useState(1);
  const visibleCustomers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return customers;
    return customers.filter((customer) => [customer.legal_name, customer.trade_name, customer.legacy_code,
      customer.document, sourceField(customer.legacy_details, "document_raw"), sourceField(customer.address, "city")]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  }, [customers, search]);
  const pageCount = Math.max(1, Math.ceil(visibleCustomers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * pageSize;
  const pageCustomers = visibleCustomers.slice(firstIndex, firstIndex + pageSize);

  async function reload() {
    try {
      setCustomers(await listCustomers());
    } catch {
      setNotice(failure("Não foi possível carregar os clientes."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function confirmDeactivate() {
    if (!deactivating || deactivatingBusy) return;
    setDeactivatingBusy(true);
    setDeactivateError("");
    try {
      await deactivateCustomer(deactivating.id);
      setNotice(success(`${deactivating.legal_name} foi desativado.`));
      setDeactivating(null);
      await reload();
    } catch {
      setDeactivateError("Não foi possível desativar o cliente.");
    } finally {
      setDeactivatingBusy(false);
    }
  }

  const newCustomerButton = (
    <button type="button" className="primary-button compact-button" onClick={() => { setNotice(null); setFormTarget("new"); }}>
      Novo cliente
    </button>
  );

  return <>
    <Notice notice={notice} />
    <Panel
      title="Clientes ativos"
      description={!loading && customers.length > 0 ? `${customers.length} ${customers.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}` : undefined}
      actions={newCustomerButton}
      flush
    >
      {loading ? <p className="panel-loading">Carregando clientes…</p> : customers.length === 0 ? (
        <EmptyState title="Nenhum cliente cadastrado.">Clique em “Novo cliente” para cadastrar o primeiro.</EmptyState>
      ) : <><div className="customer-search field"><label htmlFor="customerSearch">Buscar por nome, código, documento ou cidade</label><input id="customerSearch" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar cliente" /></div>{visibleCustomers.length === 0 ? <p className="panel-loading">Nenhum cliente encontrado para esta busca.</p> : <><ScrollableTable><table className="data-table customers-table stack-table">
        <thead><tr>
          <th scope="col">Cliente</th>
          <th scope="col">CPF ou CNPJ</th>
          <th scope="col">Telefone/celular</th>
          <th scope="col">E-mail</th>
          <th scope="col"><span className="sr-only">Ações</span></th>
        </tr></thead>
        <tbody>{pageCustomers.map((customer) => <tr key={customer.id}>
          <td className="cell-primary"><span className="strong">{customer.legal_name}</span>{customer.trade_name && <span className="cell-sub">{customer.trade_name}</span>}{customer.legacy_code && <span className="cell-sub">Código {customer.legacy_code}</span>}</td>
          <td className="nowrap-cell" data-label="CPF ou CNPJ">{customer.document || sourceField(customer.legacy_details, "document_raw") || <span className="muted-cell">—</span>}</td>
          <td className="nowrap-cell" data-label="Telefone/celular">{customer.phone || <span className="muted-cell">—</span>}</td>
          <td data-label="E-mail">{customer.email || <span className="muted-cell">—</span>}</td>
          <td className="action-cell">
            <button type="button" className="row-button is-primary" onClick={() => setDetail(customer)}>Ficha<span className="sr-only"> de {customer.legal_name}</span></button>
            <button type="button" className="row-button" onClick={() => { setNotice(null); setFormTarget(customer); }}>Editar<span className="sr-only"> {customer.legal_name}</span></button>
            <button type="button" className="row-button is-danger" onClick={() => { setDeactivateError(""); setDeactivating(customer); }}>Desativar<span className="sr-only"> {customer.legal_name}</span></button>
          </td>
        </tr>)}</tbody>
      </table></ScrollableTable><div className="customer-pagination">
        <span>Exibindo {firstIndex + 1}–{Math.min(firstIndex + pageSize, visibleCustomers.length)} de {visibleCustomers.length} {visibleCustomers.length === 1 ? "cliente" : "clientes"}</span>
        <div className="customer-pagination-controls">
          <button type="button" className="row-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <span>Página {currentPage} de {pageCount}</span>
          <button type="button" className="row-button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</button>
          <div className="customer-page-size"><label htmlFor="customerPageSize">Por página</label><select id="customerPageSize" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as 15 | 30 | 50); setPage(1); }}><option value={15}>15</option><option value={30}>30</option><option value={50}>50</option></select></div>
        </div>
      </div></>}</>}
    </Panel>

    {formTarget && (
      <CustomerFormDialog
        customer={formTarget === "new" ? undefined : formTarget}
        onClose={() => setFormTarget(null)}
        onSaved={(savedMessage) => {
          setFormTarget(null);
          setNotice(success(savedMessage));
          void reload();
        }}
      />
    )}

    {detail && <CustomerDetailDialog customer={detail} onClose={() => setDetail(null)} />}

    {deactivating && (
      <Dialog
        title={`Desativar ${deactivating.legal_name}?`}
        description="O cliente sai da lista e não aparece mais para novos orçamentos. Orçamentos já salvos não mudam."
        size="small"
        onClose={() => { if (!deactivatingBusy) setDeactivating(null); }}
      >
        {deactivateError && <p className="auth-error" role="alert">{deactivateError}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={deactivatingBusy} onClick={() => setDeactivating(null)}>Cancelar</button>
          <button type="button" className="primary-button is-danger" disabled={deactivatingBusy} onClick={() => void confirmDeactivate()}>{deactivatingBusy ? "Desativando…" : "Desativar cliente"}</button>
        </div>
      </Dialog>
    )}
  </>;
}
