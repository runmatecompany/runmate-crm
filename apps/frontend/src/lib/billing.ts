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
  invoiceNumber?: string;
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
