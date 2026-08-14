import { authFetch } from "./api";

export type LeadStatus = "to_call" | "called" | "call_back" | "became_customer" | "not_interested";

export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "to_call", label: "Hívandó" },
  { value: "call_back", label: "Visszahívandó" },
  { value: "called", label: "Hívva" },
  { value: "became_customer", label: "Ügyfél lett" },
  { value: "not_interested", label: "Nem érdekelt" },
];

export interface Lead {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: LeadStatus;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadFormInput {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface LeadsListResult {
  leads: Lead[];
  hasAccess: boolean;
}

export async function listLeads(token: string): Promise<LeadsListResult> {
  const res = await authFetch(token, "/leads");
  return res.json();
}

export async function createLead(token: string, input: LeadFormInput): Promise<Lead> {
  const res = await authFetch(token, "/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.lead;
}

export async function updateLead(token: string, id: number, input: LeadFormInput): Promise<Lead> {
  const res = await authFetch(token, `/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.lead;
}

export async function updateLeadStatus(token: string, id: number, status: LeadStatus): Promise<Lead> {
  const res = await authFetch(token, `/leads/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  return data.lead;
}

export async function deleteLead(token: string, id: number): Promise<void> {
  await authFetch(token, `/leads/${id}`, { method: "DELETE" });
}

export async function getLeadsAccess(token: string): Promise<number[]> {
  const res = await authFetch(token, "/admin/leads-access");
  const data = await res.json();
  return data.userIds;
}

export async function setLeadsAccess(token: string, userIds: number[]): Promise<void> {
  await authFetch(token, "/admin/leads-access", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds }),
  });
}
