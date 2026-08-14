import { pool } from "./pool.js";

export type LeadStatus = "to_call" | "called" | "call_back" | "became_customer" | "not_interested";

export interface LeadRow {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: LeadStatus;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const LEAD_SELECT = `
  SELECT
    l.id, l.company_name, l.contact_name, l.phone, l.email, l.address, l.notes,
    l.status, l.assigned_to, au.name AS assigned_to_name,
    l.created_by, cu.name AS created_by_name,
    l.created_at, l.updated_at
  FROM leads l
  LEFT JOIN users au ON au.id = l.assigned_to
  LEFT JOIN users cu ON cu.id = l.created_by
`;

export async function listAllLeads(): Promise<LeadRow[]> {
  const { rows } = await pool.query<LeadRow>(`${LEAD_SELECT} ORDER BY l.created_at DESC`);
  return rows;
}

export async function listAssignedLeads(userId: number): Promise<LeadRow[]> {
  const { rows } = await pool.query<LeadRow>(
    `${LEAD_SELECT} WHERE l.assigned_to = $1 ORDER BY l.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function getLeadById(id: number): Promise<LeadRow | undefined> {
  const { rows } = await pool.query<LeadRow>(`${LEAD_SELECT} WHERE l.id = $1`, [id]);
  return rows[0];
}

export interface CreateLeadInput {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  assignedTo: number | null;
  createdBy: number;
}

export async function createLead(input: CreateLeadInput): Promise<LeadRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO leads (company_name, contact_name, phone, email, address, notes, assigned_to, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      input.companyName,
      input.contactName ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
      input.assignedTo,
      input.createdBy,
    ]
  );
  const created = await getLeadById(rows[0].id);
  return created!;
}

export interface UpdateLeadDetailsInput {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export async function updateLeadDetails(id: number, input: UpdateLeadDetailsInput): Promise<LeadRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE leads SET
       company_name = $2, contact_name = $3, phone = $4, email = $5, address = $6, notes = $7,
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      input.companyName,
      input.contactName ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
    ]
  );
  if (!rowCount) return undefined;
  return getLeadById(id);
}

export async function updateLeadStatus(id: number, status: LeadStatus): Promise<LeadRow | undefined> {
  const { rowCount } = await pool.query(`UPDATE leads SET status = $2, updated_at = now() WHERE id = $1`, [
    id,
    status,
  ]);
  if (!rowCount) return undefined;
  return getLeadById(id);
}

export async function reassignLead(id: number, assignedTo: number | null): Promise<LeadRow | undefined> {
  const { rowCount } = await pool.query(`UPDATE leads SET assigned_to = $2, updated_at = now() WHERE id = $1`, [
    id,
    assignedTo,
  ]);
  if (!rowCount) return undefined;
  return getLeadById(id);
}

export async function deleteLead(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
