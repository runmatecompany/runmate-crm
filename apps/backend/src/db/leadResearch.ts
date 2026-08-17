import { pool } from "./pool.js";

export type LeadResearchStatus = "pending" | "running" | "awaiting_input" | "done" | "error";

export interface LeadResearchRow {
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

const LEAD_RESEARCH_SELECT = `
  SELECT
    r.id, r.lead_id, r.status, r.website_analysis, r.social_findings, r.social_manual_notes,
    r.call_hook, r.call_script, r.full_audit, r.outcome, r.outcome_notes, r.error_message,
    r.requested_by, u.name AS requested_by_name, r.created_at, r.completed_at
  FROM lead_research r
  LEFT JOIN users u ON u.id = r.requested_by
`;

export async function listLeadResearch(leadId: number): Promise<LeadResearchRow[]> {
  const { rows } = await pool.query<LeadResearchRow>(
    `${LEAD_RESEARCH_SELECT} WHERE r.lead_id = $1 ORDER BY r.created_at DESC`,
    [leadId]
  );
  return rows;
}

export async function getLeadResearchById(id: number): Promise<LeadResearchRow | undefined> {
  const { rows } = await pool.query<LeadResearchRow>(`${LEAD_RESEARCH_SELECT} WHERE r.id = $1`, [id]);
  return rows[0];
}

export async function createLeadResearch(leadId: number, requestedBy: number): Promise<LeadResearchRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO lead_research (lead_id, status, requested_by) VALUES ($1, 'pending', $2) RETURNING id`,
    [leadId, requestedBy]
  );
  return (await getLeadResearchById(rows[0].id))!;
}

// Egyszerű, egy-processzes "job claim": a legrégebbi pending sort veszi fel
// és rögtön running-ra állítja egy UPDATE-ben — nincs konkurens worker ebben
// a rendszerben (nincs queue-infrastruktúra), úgyhogy ez elég a versenyhelyzet
// elkerülésére.
export async function claimNextPendingResearch(): Promise<LeadResearchRow | undefined> {
  const { rows } = await pool.query<{ id: number }>(
    `UPDATE lead_research SET status = 'running'
     WHERE id = (SELECT id FROM lead_research WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1)
     RETURNING id`
  );
  if (!rows[0]) return undefined;
  return getLeadResearchById(rows[0].id);
}

export async function setLeadResearchAwaitingInput(id: number, websiteAnalysis: string): Promise<void> {
  await pool.query(`UPDATE lead_research SET status = 'awaiting_input', website_analysis = $2 WHERE id = $1`, [
    id,
    websiteAnalysis,
  ]);
}

export async function setLeadResearchError(id: number, errorMessage: string): Promise<void> {
  await pool.query(
    `UPDATE lead_research SET status = 'error', error_message = $2, completed_at = now() WHERE id = $1`,
    [id, errorMessage]
  );
}
