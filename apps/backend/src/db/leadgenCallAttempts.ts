import { pool } from "./pool.js";

export type LeadGenDisposition =
  | "no_answer"
  | "busy"
  | "wrong_number"
  | "gatekeeper_blocked"
  | "gatekeeper_passed"
  | "dm_unavailable"
  | "callback_requested"
  | "not_interested"
  | "interested"
  | "meeting_booked"
  | "do_not_call";

export interface LeadGenCallAttemptRow {
  id: number;
  company_id: number;
  contact_id: number | null;
  called_at: string;
  called_by: number | null;
  called_by_name: string | null;
  disposition: LeadGenDisposition;
  gatekeeper_name: string | null;
  reached_person: string | null;
  duration_seconds: number | null;
  notes: string | null;
  next_action: string | null;
  next_call_at: string | null;
  gdpr_notice_given: boolean;
}

const CALL_ATTEMPT_SELECT = `
  SELECT ca.id, ca.company_id, ca.contact_id, ca.called_at, ca.called_by, u.name AS called_by_name,
         ca.disposition, ca.gatekeeper_name, ca.reached_person, ca.duration_seconds,
         ca.notes, ca.next_action, ca.next_call_at, ca.gdpr_notice_given
  FROM leadgen_call_attempts ca
  LEFT JOIN users u ON u.id = ca.called_by
`;

export async function listLeadGenCallAttempts(companyId: number): Promise<LeadGenCallAttemptRow[]> {
  const { rows } = await pool.query<LeadGenCallAttemptRow>(
    `${CALL_ATTEMPT_SELECT} WHERE ca.company_id = $1 ORDER BY ca.called_at DESC`,
    [companyId]
  );
  return rows;
}

export interface CreateLeadGenCallAttemptInput {
  companyId: number;
  contactId?: number;
  calledBy: number;
  disposition: LeadGenDisposition;
  gatekeeperName?: string;
  reachedPerson?: string;
  durationSeconds?: number;
  notes?: string;
  nextAction?: string;
  nextCallAt?: string;
  gdprNoticeGiven: boolean;
}

export async function createLeadGenCallAttempt(input: CreateLeadGenCallAttemptInput): Promise<LeadGenCallAttemptRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO leadgen_call_attempts
       (company_id, contact_id, called_by, disposition, gatekeeper_name, reached_person,
        duration_seconds, notes, next_action, next_call_at, gdpr_notice_given)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      input.companyId,
      input.contactId ?? null,
      input.calledBy,
      input.disposition,
      input.gatekeeperName ?? null,
      input.reachedPerson ?? null,
      input.durationSeconds ?? null,
      input.notes ?? null,
      input.nextAction ?? null,
      input.nextCallAt ?? null,
      input.gdprNoticeGiven,
    ]
  );
  const { rows: created } = await pool.query<LeadGenCallAttemptRow>(
    `${CALL_ATTEMPT_SELECT} WHERE ca.id = $1`,
    [rows[0].id]
  );
  return created[0];
}
