import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { PHONE_MAX_LENGTH, formatPhoneInput, validatePhone } from "../../domain/contacts/brazilianPhone";
import { DOCUMENT_MAX_LENGTH, formatDocumentInput, guessDocumentKind, validateDocument } from "../../domain/documents/brazilianDocument";
import { createCustomer, updateCustomer, type Customer } from "../../services/customerService";
import type { CustomerInput } from "../../types/customer";

type CustomerFormDialogProps = {
  /** Cliente em edição; ausente para um cadastro novo. */
  customer?: Customer;
  onClose: () => void;
  onSaved: (message: string) => void;
};

function toForm(customer?: Customer): CustomerInput {
  if (!customer) return { legalName: "", tradeName: "", document: "", phone: "", email: "", notes: "" };
  return {
    legalName: customer.legal_name,
    tradeName: customer.trade_name,
    document: customer.document,
    phone: customer.phone,
    email: customer.email,
    notes: customer.notes,
  };
}

function changed(next: string | null | undefined, previous: string | null | undefined) {
  return (next?.trim() || null) !== (previous?.trim() || null);
}

export function CustomerFormDialog({ customer, onClose, onSaved }: CustomerFormDialogProps) {
  const [form, setForm] = useState<CustomerInput>(() => toForm(customer));
  const [documentError, setDocumentError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const documentKind = guessDocumentKind(form.document);
  const nameLabel = documentKind === "cpf" ? "Nome completo" : documentKind === "cnpj" ? "Razão social" : "Nome ou razão social";

  function field<Key extends keyof CustomerInput>(key: Key, value: CustomerInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    // Cadastros antigos fora do padrão só são validados no campo que for alterado.
    const documentCheck = validateDocument(form.document);
    const phoneCheck = validatePhone(form.phone);
    const nextDocumentError = changed(form.document, customer?.document) && !documentCheck.valid ? documentCheck.message : "";
    const nextPhoneError = changed(form.phone, customer?.phone) && !phoneCheck.valid ? phoneCheck.message : "";
    setDocumentError(nextDocumentError);
    setPhoneError(nextPhoneError);
    if (nextDocumentError || nextPhoneError) {
      document.getElementById(nextDocumentError ? "document" : "phone")?.focus();
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (customer) {
        await updateCustomer(customer.id, form, { document: customer.document, phone: customer.phone });
        onSaved(`${form.legalName.trim()} foi atualizado.`);
      } else {
        await createCustomer(form);
        onSaved(`${form.legalName.trim()} foi cadastrado.`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o cliente.");
      setSaving(false);
    }
  }

  return (
    <Dialog title={customer ? "Editar cliente" : "Novo cliente"} onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="document">CPF ou CNPJ</label>
          <input
            id="document"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={DOCUMENT_MAX_LENGTH}
            aria-invalid={documentError ? true : undefined}
            aria-describedby="documentHint"
            value={form.document ?? ""}
            onChange={(event) => { field("document", formatDocumentInput(event.target.value)); setDocumentError(""); }}
          />
          {documentError
            ? <p className="field-error" id="documentHint" role="alert">{documentError}</p>
            : <p className="field-hint" id="documentHint">Opcional. A pontuação é colocada automaticamente.</p>}
        </div>
        <div className="field">
          <label htmlFor="legalName">{nameLabel}</label>
          <input id="legalName" required maxLength={200} value={form.legalName} onChange={(event) => field("legalName", event.target.value)} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="phone">Telefone/celular</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="(00) 00000-0000"
              maxLength={PHONE_MAX_LENGTH}
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? "phoneError" : undefined}
              value={form.phone ?? ""}
              onChange={(event) => { field("phone", formatPhoneInput(event.target.value)); setPhoneError(""); }}
            />
            {phoneError && <p className="field-error" id="phoneError" role="alert">{phoneError}</p>}
          </div>
          <div className="field">
            <label htmlFor="customerEmail">E-mail</label>
            <input id="customerEmail" type="email" value={form.email ?? ""} onChange={(event) => field("email", event.target.value)} />
          </div>
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : customer ? "Salvar alterações" : "Cadastrar cliente"}</button>
        </div>
      </form>
    </Dialog>
  );
}
