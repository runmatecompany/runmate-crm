import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import type { Client } from "../../lib/clients";
import type { Invoice, InvoiceFormInput } from "../../lib/billing";

interface InvoiceFormModalProps {
  invoice: Invoice | null;
  clients: Client[];
  onClose: () => void;
  onSave: (input: InvoiceFormInput) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Az ügyfél csak létrehozáskor választható — szerkesztéskor fix, mint a
// WebProjectFormModal-nál (project.client_id sosem változik utólag).
export default function InvoiceFormModal({ invoice, clients, onClose, onSave }: InvoiceFormModalProps) {
  useEscapeToClose(onClose);
  const [clientId, setClientId] = useState<number | "">(invoice?.client_id ?? "");
  const [description, setDescription] = useState(invoice?.description ?? "");
  const [amount, setAmount] = useState(invoice?.amount ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoice_number ?? "");
  const [issueDate, setIssueDate] = useState(invoice?.issue_date?.slice(0, 10) ?? todayIso());
  const [dueDate, setDueDate] = useState(invoice?.due_date?.slice(0, 10) ?? "");
  const [driveLink, setDriveLink] = useState(invoice?.drive_link ?? "");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClient = clients.find((c) => c.id === (invoice ? invoice.client_id : clientId));
  const hasBillingInfo =
    selectedClient &&
    (selectedClient.billing_name || selectedClient.tax_number || selectedClient.billing_address || selectedClient.bank_account);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Válassz ügyfelet.");
      return;
    }
    if (!description.trim()) {
      setError("Add meg, mire szól a számla.");
      return;
    }
    if (!amount.trim() || Number.isNaN(Number(amount))) {
      setError("Adj meg egy érvényes összeget.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        clientId: Number(clientId),
        description: description.trim(),
        amount: amount.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        issueDate,
        dueDate: dueDate || undefined,
        driveLink: driveLink.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a számlát");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>{invoice ? "Számla szerkesztése" : "Új számla"}</h2>

        {invoice ? (
          <p className="chat-empty-hint">Ügyfél: {invoice.client_name}</p>
        ) : (
          <>
            <label htmlFor="invoice-client">Ügyfél</label>
            <select
              id="invoice-client"
              value={clientId}
              onChange={(e) => setClientId(e.currentTarget.value ? Number(e.currentTarget.value) : "")}
              autoFocus
              required
            >
              <option value="">— Válassz ügyfelet —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </>
        )}

        {hasBillingInfo && selectedClient && (
          <div className="invoice-billing-info">
            {selectedClient.billing_name && <span>{selectedClient.billing_name}</span>}
            {selectedClient.tax_number && <span>Adószám: {selectedClient.tax_number}</span>}
            {selectedClient.billing_address && <span>{selectedClient.billing_address}</span>}
            {selectedClient.bank_account && <span>{selectedClient.bank_account}</span>}
          </div>
        )}

        <label htmlFor="invoice-description">Tétel</label>
        <input
          id="invoice-description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder="Pl. Social Media csomag - 2026 augusztus"
        />

        <div className="lead-form-row">
          <div>
            <label htmlFor="invoice-amount">Összeg (EUR)</label>
            <input
              id="invoice-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label htmlFor="invoice-number">Számlaszám</label>
            <input
              id="invoice-number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.currentTarget.value)}
              placeholder="A külső rendszerből, nem kötelező"
            />
          </div>
        </div>

        <div className="lead-form-row">
          <div>
            <label htmlFor="invoice-issue-date">Kiállítás dátuma</label>
            <input
              id="invoice-issue-date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.currentTarget.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="invoice-due-date">Fizetési határidő</label>
            <input id="invoice-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.currentTarget.value)} />
          </div>
        </div>

        <label htmlFor="invoice-drive-link">Drive-link (a számla PDF-jéhez)</label>
        <input
          id="invoice-drive-link"
          value={driveLink}
          onChange={(e) => setDriveLink(e.currentTarget.value)}
          placeholder="https://drive.google.com/..."
        />

        <label htmlFor="invoice-notes">Jegyzet</label>
        <textarea
          id="invoice-notes"
          className="lead-notes-textarea"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </form>
    </div>
  );
}
