import { authFetch } from "./api";

// Az Értékesítés pipeline állapotai — a sorrend egyben a Kanban
// oszlopainak sorrendje is (lásd pages/LeadsPage.tsx STATUS_ORDER). A
// "call_back" bármelyik nem-lezárt állapotból felvehető univerzális "most
// nem értem el" jelölés, nem egy fix lineáris lépés.
export type LeadStatus =
  | "to_call"
  | "call_back"
  | "audit"
  | "meeting_scheduled"
  | "decision_pending"
  | "accepted"
  | "not_interested"
  | "declined";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  to_call: "Megkeresendő",
  call_back: "Visszahívandó",
  audit: "Audit",
  meeting_scheduled: "Tárgyalásra vár",
  decision_pending: "Elfogadásra vár",
  accepted: "Elfogadta",
  not_interested: "Nem érdekli",
  declined: "Nemet mondott",
};

export type LeadSector = "b2b" | "b2c";

export interface Lead {
  id: number;
  company_name: string;
  contact_name: string | null;
  contact_position: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  sector: LeadSector | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  status: LeadStatus;
  meeting_date: string | null;
  call_back_reason: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadFormInput {
  companyName: string;
  contactName?: string;
  contactPosition?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  sector?: LeadSector;
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
  address?: string;
  callBackReason?: string;
}

export interface UpdateLeadStatusResult {
  lead: Lead;
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
