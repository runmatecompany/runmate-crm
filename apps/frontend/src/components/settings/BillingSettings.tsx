import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { listClients, type Client } from "../../lib/clients";
import {
  createInvoice,
  deleteInvoice,
  listInvoices,
  setInvoiceStatus,
  updateInvoice,
  type Invoice,
  type InvoiceFormInput,
} from "../../lib/billing";
import InvoiceFormModal from "../billing/InvoiceFormModal";

function formatAmount(amount: string): string {
  return Number(amount).toLocaleString("de-AT", { style: "currency", currency: "EUR" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("hu-HU");
}

function isOverdue(invoice: Invoice): boolean {
  return invoice.status === "unpaid" && invoice.due_date != null && invoice.due_date < todayIso();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BillingSettings() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "paid" | "overdue">("all");
  const [editingInvoice, setEditingInvoice] = useState<Invoice | "new" | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([listInvoices(token), listClients(token)])
      .then(([invoiceList, clientResult]) => {
        setInvoices(invoiceList);
        setClients(clientResult.clients);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Nem sikerült betölteni a számlákat"))
      .finally(() => setLoading(false));
  }, [token]);

  function refresh() {
    if (!token) return;
    listInvoices(token).then(setInvoices);
  }

  const filteredInvoices = invoices.filter((inv) => {
    if (clientFilter && inv.client_id !== clientFilter) return false;
    if (statusFilter === "unpaid") return inv.status === "unpaid" && !isOverdue(inv);
    if (statusFilter === "paid") return inv.status === "paid";
    if (statusFilter === "overdue") return isOverdue(inv);
    return true;
  });

  async function handleSave(input: InvoiceFormInput) {
    if (!token) return;
    if (editingInvoice && editingInvoice !== "new") {
      await updateInvoice(token, editingInvoice.id, input);
    } else {
      await createInvoice(token, input);
    }
    setEditingInvoice(null);
    refresh();
  }

  async function handleToggleStatus(invoice: Invoice) {
    if (!token) return;
    await setInvoiceStatus(token, invoice.id, invoice.status === "paid" ? "unpaid" : "paid");
    refresh();
  }

  async function handleDelete(invoice: Invoice) {
    if (!token) return;
    if (!confirm(`Biztosan törlöd a(z) "${invoice.description}" számlát (${invoice.client_name})?`)) return;
    await deleteInvoice(token, invoice.id);
    refresh();
  }

  return (
    <div className="billing-settings">
      <div className="billing-header">
        <h1>Számlázás</h1>
        <button type="button" onClick={() => setEditingInvoice("new")}>
          + Új számla
        </button>
      </div>
      <p className="chat-empty-hint">
        Belső nyilvántartás — a tényleges számlát külső rendszerben állítod ki, itt csak azt vezeted, kinek mennyit,
        miért, mikor számláztál, és kifizették-e.
      </p>

      <div className="billing-filters">
        <select value={clientFilter} onChange={(e) => setClientFilter(e.currentTarget.value ? Number(e.currentTarget.value) : "")}>
          <option value="">Összes ügyfél</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.currentTarget.value as typeof statusFilter)}>
          <option value="all">Összes állapot</option>
          <option value="unpaid">Kiadva</option>
          <option value="overdue">Lejárt</option>
          <option value="paid">Fizetve</option>
        </select>
      </div>

      {error && <p className="login-error">{error}</p>}
      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && (
        <div className="clients-table-wrap">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Ügyfél</th>
                <th>Tétel</th>
                <th>Összeg</th>
                <th>Kiállítva</th>
                <th>Határidő</th>
                <th>Állapot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => {
                const overdue = isOverdue(invoice);
                return (
                  <tr key={invoice.id}>
                    <td>{invoice.client_name}</td>
                    <td>{invoice.description}</td>
                    <td>{formatAmount(invoice.amount)}</td>
                    <td className="clients-muted-cell">{formatDate(invoice.issue_date)}</td>
                    <td className="clients-muted-cell">{invoice.due_date ? formatDate(invoice.due_date) : "—"}</td>
                    <td>
                      <span
                        className={
                          invoice.status === "paid"
                            ? "billing-status-badge billing-status-paid"
                            : overdue
                              ? "billing-status-badge billing-status-overdue"
                              : "billing-status-badge billing-status-unpaid"
                        }
                      >
                        {invoice.status === "paid" ? "Fizetve" : overdue ? "Lejárt" : "Kiadva"}
                      </span>
                    </td>
                    <td className="billing-row-actions">
                      <button type="button" onClick={() => void handleToggleStatus(invoice)}>
                        {invoice.status === "paid" ? "Vissza nem fizetettre" : "Fizetettnek jelöl"}
                      </button>
                      <button type="button" onClick={() => setEditingInvoice(invoice)}>
                        Szerkesztés
                      </button>
                      <button type="button" className="mt-action-danger" onClick={() => void handleDelete(invoice)}>
                        Törlés
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="clients-muted-cell">
                    Nincs a szűrésnek megfelelő számla.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingInvoice && (
        <InvoiceFormModal
          invoice={editingInvoice === "new" ? null : editingInvoice}
          clients={clients}
          onClose={() => setEditingInvoice(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
