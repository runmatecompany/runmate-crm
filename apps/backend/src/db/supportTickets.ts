import { pool } from "./pool.js";

export type SupportTicketStatus = "open" | "resolved";

export interface SupportTicketRow {
  id: number;
  body: string;
  status: SupportTicketStatus;
  created_by: number;
  created_by_name: string;
  created_at: string;
  resolved_by: number | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
}

const SUPPORT_TICKET_SELECT = `
  SELECT
    t.id, t.body, t.status,
    t.created_by, cu.name AS created_by_name,
    t.created_at,
    t.resolved_by, ru.name AS resolved_by_name, t.resolved_at
  FROM support_tickets t
  JOIN users cu ON cu.id = t.created_by
  LEFT JOIN users ru ON ru.id = t.resolved_by
`;

export async function listSupportTickets(): Promise<SupportTicketRow[]> {
  const { rows } = await pool.query<SupportTicketRow>(
    `${SUPPORT_TICKET_SELECT}
     ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.created_at DESC`
  );
  return rows;
}

export async function getSupportTicketById(id: number): Promise<SupportTicketRow | undefined> {
  const { rows } = await pool.query<SupportTicketRow>(`${SUPPORT_TICKET_SELECT} WHERE t.id = $1`, [id]);
  return rows[0];
}

export async function createSupportTicket(body: string, createdBy: number): Promise<SupportTicketRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO support_tickets (body, created_by) VALUES ($1, $2) RETURNING id`,
    [body, createdBy]
  );
  const created = await getSupportTicketById(rows[0].id);
  return created!;
}

export async function updateSupportTicketStatus(
  id: number,
  status: SupportTicketStatus,
  actorId: number
): Promise<SupportTicketRow | undefined> {
  await pool.query(
    `UPDATE support_tickets
     SET status = $2,
         resolved_by = CASE WHEN $2 = 'resolved' THEN $3::integer ELSE NULL END,
         resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE NULL END
     WHERE id = $1`,
    [id, status, actorId]
  );
  return getSupportTicketById(id);
}

export async function hasSupportAccess(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM support_access WHERE user_id = $1`, [userId]);
  return (rowCount ?? 0) > 0;
}

export async function grantSupportAccess(userId: number, grantedBy: number): Promise<void> {
  await pool.query(
    `INSERT INTO support_access (user_id, granted_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [userId, grantedBy]
  );
}

export async function revokeSupportAccess(userId: number): Promise<void> {
  await pool.query(`DELETE FROM support_access WHERE user_id = $1`, [userId]);
}
