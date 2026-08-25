import { authFetch } from "./api";

export type InvoiceStatus = "unpaid" | "paid";

export interface Invoice {
  id: number;
  client_id: number;
  client_name: string;
  description: string;
  amount: string;
  invoice_number: string | null;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  paid_at: string | null;
  drive_link: string | null;
  notes: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceFormInput {
  clientId: number;
  description: string;
  amount: string;
  issueDate: string;
  dueDate?: string;
  driveLink?: string;
  notes?: string;
}

export async function listInvoices(token: string): Promise<Invoice[]> {
  const res = await authFetch(token, "/invoices");
  const data = await res.json();
  return data.invoices;
}

export async function createInvoice(token: string, input: InvoiceFormInput): Promise<Invoice> {
  const res = await authFetch(token, "/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.invoice;
}

export async function updateInvoice(token: string, id: number, input: InvoiceFormInput): Promise<Invoice> {
  const res = await authFetch(token, `/invoices/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.invoice;
}

export async function setInvoiceStatus(token: string, id: number, status: InvoiceStatus): Promise<Invoice> {
  const res = await authFetch(token, `/invoices/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  return data.invoice;
}

export async function deleteInvoice(token: string, id: number): Promise<void> {
  await authFetch(token, `/invoices/${id}`, { method: "DELETE" });
}

// A PDF-letöltés hitelesített végpont, ezért nem lehet sima <a href>-fel
// elérni (nem tud Authorization fejlécet küldeni) — blob-ként töltjük le,
// majd egy ideiglenes <a download> linkkel mentjük fájlba. (window.open-nal
// próbáltuk korábban, de a Tauri webview nem nyit új ablakot/fület rá —
// letöltés-triggerelésre viszont ugyanez a webview rendben reagál.)
export async function downloadInvoicePdf(token: string, id: number, filename: string): Promise<boolean> {
  try {
    const res = await authFetch(token, `/invoices/${id}/pdf`);
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function sendInvoiceEmail(token: string, id: number): Promise<void> {
  const res = await authFetch(token, `/invoices/${id}/send-email`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült elküldeni az emailt");
  }
}

export interface BillingIssuerSettings {
  business_name: string | null;
  address: string | null;
  email: string | null;
  iban: string | null;
  sender_account_id: number | null;
}

export interface IssuerSettingsInput {
  businessName?: string;
  address?: string;
  email?: string;
  iban?: string;
  senderAccountId?: number | null;
}

export async function getIssuerSettings(token: string): Promise<BillingIssuerSettings> {
  const res = await authFetch(token, "/billing/issuer-settings");
  const data = await res.json();
  return data.settings;
}

export async function setIssuerSettings(token: string, input: IssuerSettingsInput): Promise<BillingIssuerSettings> {
  const res = await authFetch(token, "/billing/issuer-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.settings;
}
