import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { listClients, type Client } from "../../lib/clients";
import { listAdminEmailAccounts, type EmailAccountAdminView } from "../../lib/email";
import {
  createInvoice,
  deleteInvoice,
  fetchInvoicePdfBlobUrl,
  getIssuerSettings,
  listInvoices,
  sendInvoiceEmail,
  setInvoiceStatus,
  setIssuerSettings,
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

function IssuerSettingsSection({ token, emailAccounts }: { token: string; emailAccounts: EmailAccountAdminView[] }) {
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [iban, setIban] = useState("");
  const [senderAccountId, setSenderAccountId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getIssuerSettings(token)
      .then((s) => {
        setBusinessName(s.business_name ?? "");
        setAddress(s.address ?? "");
        setEmail(s.email ?? "");
        setIban(s.iban ?? "");
        setSenderAccountId(s.sender_account_id ?? "");
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await setIssuerSettings(token, {
        businessName: businessName.trim() || undefined,
        address: address.trim() || undefined,
        email: email.trim() || undefined,
        iban: iban.trim() || undefined,
        senderAccountId: senderAccountId || null,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="billing-issuer-section">
      <button type="button" className="billing-issuer-toggle" onClick={() => setOpen((prev) => !prev)}>
        {open ? "▾" : "▸"} Kibocsátó adatai
      </button>
      {open && !loading && (
        <div className="billing-issuer-form">
          <p className="chat-empty-hint">
            Ezek az adatok kerülnek fel minden kiállított számla PDF-jére, és ez a fiók küldi ki a számlát emailben.
          </p>
          <div className="lead-form-row">
            <div>
              <label htmlFor="issuer-name">Cégnév / Név</label>
              <input id="issuer-name" value={businessName} onChange={(e) => setBusinessName(e.currentTarget.value)} />
            </div>
            <div>
              <label htmlFor="issuer-email">Email (megjelenik a számlán)</label>
              <input id="issuer-email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            </div>
          </div>
          <label htmlFor="issuer-address">Cím</label>
          <input id="issuer-address" value={address} onChange={(e) => setAddress(e.currentTarget.value)} />
          <label htmlFor="issuer-iban">IBAN</label>
          <input id="issuer-iban" value={iban} onChange={(e) => setIban(e.currentTarget.value)} />
          <label htmlFor="issuer-sender">Küldő email-fiók</label>
          <select
            id="issuer-sender"
            value={senderAccountId}
            onChange={(e) => setSenderAccountId(e.currentTarget.value ? Number(e.currentTarget.value) : "")}
          >
            <option value="">— Nincs kiválasztva —</option>
            {emailAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
              </option>
            ))}
          </select>
          <div className="billing-issuer-save">
            <button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Mentés..." : "Mentés"}
            </button>
            {saved && <span className="chat-empty-hint">Mentve.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BillingSettings() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccountAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "paid" | "overdue">("all");
  const [editingInvoice, setEditingInvoice] = useState<Invoice | "new" | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([listInvoices(token), listClients(token), listAdminEmailAccounts(token)])
      .then(([invoiceList, clientResult, accounts]) => {
        setInvoices(invoiceList);
        setClients(clientResult.clients);
        setEmailAccounts(accounts);
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

  async function handleDownloadPdf(invoice: Invoice) {
    if (!token) return;
    const url = await fetchInvoicePdfBlobUrl(token, invoice.id);
    if (!url) {
      alert("Nem sikerült létrehozni a PDF-et.");
      return;
    }
    window.open(url, "_blank");
  }

  async function handleSendEmail(invoice: Invoice) {
    if (!token) return;
    if (!confirm(`Elküldöd emailben a(z) ${invoice.invoice_number ?? ""} számú számlát ennek: "${invoice.client_name}"?`)) {
      return;
    }
    setSendingId(invoice.id);
    try {
      await sendInvoiceEmail(token, invoice.id);
      alert("A számla elküldve.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült elküldeni az emailt");
    } finally {
      setSendingId(null);
    }
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
        A számla mentésekor a rendszer automatikusan sorszámot ad neki és kiállítottnak tekinti — a Kleinunternehmer
        (ÁFA-mentes) sablon szerint. Érdemes egyszer átnézetni a formátumot a könyvelőddel, mielőtt éles ügyfélnek
        küldöd.
      </p>

      {token && <IssuerSettingsSection token={token} emailAccounts={emailAccounts} />}

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
                <th>Számlaszám</th>
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
                    <td className="clients-muted-cell">{invoice.invoice_number ?? "—"}</td>
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
                      <button type="button" onClick={() => void handleDownloadPdf(invoice)}>
                        PDF letöltése
                      </button>
                      <button type="button" disabled={sendingId === invoice.id} onClick={() => void handleSendEmail(invoice)}>
                        {sendingId === invoice.id ? "Küldés..." : "Küldés emailben"}
                      </button>
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
                  <td colSpan={8} className="clients-muted-cell">
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
