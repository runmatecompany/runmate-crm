import { pool } from "./pool.js";

export interface ClientRow {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  lead_id: number | null;
  next_shoot_date: string | null;
  drive_folder_id: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const CLIENT_SELECT = `
  SELECT
    c.id, c.company_name, c.contact_name, c.phone, c.email, c.address, c.notes,
    c.lead_id, c.next_shoot_date, c.drive_folder_id,
    c.created_by, cu.name AS created_by_name,
    c.created_at, c.updated_at
  FROM clients c
  LEFT JOIN users cu ON cu.id = c.created_by
`;

export async function listAllClients(): Promise<ClientRow[]> {
  const { rows } = await pool.query<ClientRow>(`${CLIENT_SELECT} ORDER BY c.company_name`);
  return rows;
}

export async function getClientById(id: number): Promise<ClientRow | undefined> {
  const { rows } = await pool.query<ClientRow>(`${CLIENT_SELECT} WHERE c.id = $1`, [id]);
  return rows[0];
}

export interface CreateClientInput {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdBy: number;
}

export async function createClient(input: CreateClientInput): Promise<ClientRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (company_name, contact_name, phone, email, address, notes, created_by)
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
  const created = await getClientById(rows[0].id);
  return created!;
}

export interface UpdateClientDetailsInput {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export async function updateClientDetails(
  id: number,
  input: UpdateClientDetailsInput
): Promise<ClientRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE clients SET
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
  return getClientById(id);
}

export async function updateClientNextShootDate(id: number, date: Date): Promise<void> {
  await pool.query(`UPDATE clients SET next_shoot_date = $2, updated_at = now() WHERE id = $1`, [id, date]);
}

export async function setClientDriveFolders(id: number, input: { driveFolderId: string }): Promise<void> {
  await pool.query(`UPDATE clients SET drive_folder_id = $2, updated_at = now() WHERE id = $1`, [
    id,
    input.driveFolderId,
  ]);
}

export async function deleteClient(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM clients WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// A teljes "Ügyfelek" modulhoz való hozzáférés — modul-szintű, mint a
// Leadeknél: akinek van hozzáférése, az az összes ügyfelet látja.
export async function hasClientsAccess(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM clients_access WHERE user_id = $1`, [userId]);
  return (rowCount ?? 0) > 0;
}

export async function grantClientsAccess(userId: number, grantedBy: number): Promise<void> {
  await pool.query(
    `INSERT INTO clients_access (user_id, granted_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [userId, grantedBy]
  );
}

export async function revokeClientsAccess(userId: number): Promise<void> {
  await pool.query(`DELETE FROM clients_access WHERE user_id = $1`, [userId]);
}
