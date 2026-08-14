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
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const LEAD_SELECT = `
  SELECT
    l.id, l.company_name, l.contact_name, l.phone, l.email, l.address, l.notes,
    l.status, l.created_by, cu.name AS created_by_name,
    l.created_at, l.updated_at
  FROM leads l
  LEFT JOIN users cu ON cu.id = l.created_by
`;

export async function listAllLeads(): Promise<LeadRow[]> {
  const { rows } = await pool.query<LeadRow>(`${LEAD_SELECT} ORDER BY l.created_at DESC`);
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
  createdBy: number;
}

export async function createLead(input: CreateLeadInput): Promise<LeadRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO leads (company_name, contact_name, phone, email, address, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      input.companyName,
      input.contactName ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
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

export async function deleteLead(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// A teljes "Leadek" modulhoz való hozzáférés — nem lead-enkénti, hanem
// modul-szintű: akinek van hozzáférése, az az összes leadet látja.
export async function hasLeadsAccess(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM leads_access WHERE user_id = $1`, [userId]);
  return (rowCount ?? 0) > 0;
}

export async function listLeadsAccessUserIds(): Promise<number[]> {
  const { rows } = await pool.query<{ user_id: number }>(`SELECT user_id FROM leads_access`);
  return rows.map((r) => r.user_id);
}

export async function setLeadsAccess(userIds: number[], grantedBy: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM leads_access WHERE user_id != ALL($1::int[])`, [userIds]);
    for (const userId of userIds) {
      await client.query(
        `INSERT INTO leads_access (user_id, granted_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
        [userId, grantedBy]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
