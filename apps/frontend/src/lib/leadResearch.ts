import { authFetch } from "./api";

export type LeadResearchStatus = "pending" | "running" | "awaiting_input" | "done" | "error";

export interface LeadResearch {
  id: number;
  lead_id: number;
  status: LeadResearchStatus;
  website_analysis: string | null;
  social_findings: string | null;
  social_manual_notes: string | null;
  call_hook: string | null;
  call_script: string | null;
  full_audit: string | null;
  outcome: string | null;
  outcome_notes: string | null;
  error_message: string | null;
  requested_by: number | null;
  requested_by_name: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function startLeadResearch(token: string, leadId: number): Promise<LeadResearch> {
  const res = await authFetch(token, `/leads/${leadId}/research`, { method: "POST" });
  const data = await res.json();
  return data.research;
}

export async function listLeadResearch(token: string, leadId: number): Promise<LeadResearch[]> {
  const res = await authFetch(token, `/leads/${leadId}/research`);
  const data = await res.json();
  return data.research;
}

export async function getLeadResearch(token: string, researchId: number): Promise<LeadResearch> {
  const res = await authFetch(token, `/leads/research/${researchId}`);
  const data = await res.json();
  return data.research;
}

export async function submitManualNotes(token: string, researchId: number, socialManualNotes: string): Promise<LeadResearch> {
  const res = await authFetch(token, `/leads/research/${researchId}/manual-notes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ socialManualNotes }),
  });
  const data = await res.json();
  return data.research;
}
