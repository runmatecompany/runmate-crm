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

// A PDF-letöltés hitelesített végpont, ezért nem lehet sima <a href>/
// window.open-nal elérni (nem tud Authorization fejlécet küldeni) — a chat
// képfeltöltés mintáját követve blob-ként töltjük le, majd object URL-ként
// nyitjuk meg egy új fülön.
export async function fetchInvoicePdfBlobUrl(token: string, id: number): Promise<string | null> {
  try {
    const res = await authFetch(token, `/invoices/${id}/pdf`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
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
