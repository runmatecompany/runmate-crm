import { authFetch } from "./api";

export interface Client {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  lead_id: number | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientFormInput {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface ClientsListResult {
  clients: Client[];
  hasAccess: boolean;
}

export async function listClients(token: string): Promise<ClientsListResult> {
  const res = await authFetch(token, "/clients");
  return res.json();
}

export async function createClient(token: string, input: ClientFormInput): Promise<Client> {
  const res = await authFetch(token, "/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.client;
}

export async function updateClient(token: string, id: number, input: ClientFormInput): Promise<Client> {
  const res = await authFetch(token, `/clients/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.client;
}

export async function deleteClient(token: string, id: number): Promise<void> {
  await authFetch(token, `/clients/${id}`, { method: "DELETE" });
}
