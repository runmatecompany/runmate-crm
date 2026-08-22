import { authFetch } from "./api";

// A HR pipeline állapotai — a sorrend egyben a Kanban oszlopainak
// sorrendje is (lásd pages/LeadsPage.tsx STATUS_ORDER). A "became_customer"
// szándékosan nincs itt: az invoice_sent lépés után a rendszer automatikusan
// ügyféllé alakítja a leadet, nincs többé kézzel választható "Ügyfél lett"
// állapot (a backend a régi adatok miatt még ismeri, de a Kanban nem
// ajánlja fel).
export type LeadStatus =
  | "to_call"
  | "call_back"
  | "interested"
  | "audit"
  | "meeting_scheduled"
  | "contract_sent"
  | "invoice_sent"
  | "became_customer"
  | "not_interested";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  to_call: "Megkeresendő",
  call_back: "Visszahívandó",
  interested: "Érdekli",
  audit: "Audit",
  meeting_scheduled: "Tárgyalásra vár",
  contract_sent: "Szerződés kiküldve",
  invoice_sent: "Számlázva",
  became_customer: "Ügyfél lett",
  not_interested: "Nem érdekli",
};

export interface Lead {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  status: LeadStatus;
  meeting_date: string | null;
  contract_drive_link: string | null;
  contract_sent_at: string | null;
  invoice_drive_link: string | null;
  invoice_sent_at: string | null;
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
  city?: string;
  notes?: string;
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  youtubeUrl?: string;
}

export interface ExtractedLeadFields {
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
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

export interface UpdateLeadStatusExtra {
  note?: string;
  meetingDate?: string;
  contractDriveLink?: string;
  invoiceDriveLink?: string;
}

export interface UpdateLeadStatusResult {
  lead: Lead;
  emailSent: boolean | null;
}

export async function updateLeadStatus(
  token: string,
  id: number,
  status: LeadStatus,
  extra?: UpdateLeadStatusExtra
): Promise<UpdateLeadStatusResult> {
  const res = await authFetch(token, `/leads/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...extra }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült frissíteni az állapotot");
  }
  return res.json();
}

export async function deleteLead(token: string, id: number): Promise<void> {
  await authFetch(token, `/leads/${id}`, { method: "DELETE" });
}

export async function convertLeadToClient(token: string, id: number): Promise<number> {
  const res = await authFetch(token, `/leads/${id}/convert-to-client`, { method: "POST" });
  const data = await res.json();
  return data.clientId;
}

export interface LeadDocumentInput {
  filename: string;
  text: string;
}

export async function extractLeadFromMedia(
  token: string,
  images: string[],
  documents: LeadDocumentInput[]
): Promise<ExtractedLeadFields> {
  const res = await authFetch(token, "/leads/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images, documents }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült feldolgozni a fájlokat");
  }
  const data = await res.json();
  return data.fields;
}
