import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { listCustomers, type Customer } from "../../services/customerService";
import type { CalculatorController } from "../calculator/useCalculator";

/** Escolha do cliente do orçamento, no topo da Calculadora. */
export function QuoteCustomerPicker({ controller }: { controller: CalculatorController }) {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const canSave = profile?.role === "administrador" || profile?.role === "comercial";
  const { customer, setCustomer } = controller;

  useEffect(() => {
    if (!canSave) return;
    listCustomers()
      .then(setCustomers)
      .catch(() => setError("Não foi possível carregar os clientes."));
  }, [canSave]);

  if (!canSave) return null;

  // Cliente de um orçamento em edição que foi desativado depois: continua vinculado.
  const inactiveCustomer = customer && !customers.some((option) => option.id === customer.id) ? customer : null;

  function choose(id: string) {
    const selected = customers.find((option) => option.id === id);
    if (selected) setCustomer({ id: selected.id, name: selected.legal_name, document: selected.document });
    else if (inactiveCustomer && inactiveCustomer.id === id) setCustomer(inactiveCustomer);
    else setCustomer(null);
  }

  return (
    <section className="panel form-section quote-customer-panel" aria-labelledby="quoteCustomerTitle">
      <h2 className="panel-title" id="quoteCustomerTitle">Cliente</h2>
      <div className="field">
        <label htmlFor="quoteCustomer">Cliente do orçamento (opcional)</label>
        <select id="quoteCustomer" value={customer?.id ?? ""} onChange={(event) => choose(event.target.value)}>
          <option value="">Sem cliente vinculado</option>
          {inactiveCustomer && <option value={inactiveCustomer.id}>{inactiveCustomer.name} (inativo)</option>}
          {customers.map((option) => <option key={option.id} value={option.id}>{option.legal_name}</option>)}
        </select>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
