import { pool } from "./pool.js";
import { deleteManualTask } from "./tasks.js";

export type ClientStatus = "active" | "paused" | "closed";
export type ClientType = "monthly" | "one_off";

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
  onboarding_completed_at: string | null;
  monthly_video_target: number | null;
  monthly_post_target: number | null;
  service_clipping: boolean;
  service_short_videos: boolean;
  service_image_posts: boolean;
  service_website_build: boolean;
  service_landing_page: boolean;
  status: ClientStatus;
  client_type: ClientType | null;
  deletion_requested_by: number | null;
  deletion_requested_by_name: string | null;
  created_at: string;
  updated_at: string;
}

// A JOIN client_onboarding_profiles-szal a completed_at-ért (az Ügyfelek
// lista "Onboarding" oszlopához) és a havi célszámokért van (a Social
// Media "Állapot" füléhez) — így nem kell N+1 külön lekérdezés minden
// ügyfélhez. A service_* jelzők jelzik, mely modulokban releváns az adott
// ügyfél (pl. a Social Media modul csak akkor listázza, ha van
// short_videos/image_posts/clipping szolgáltatása) — service_clipping
// emellett azt is jelzi, hogy a kész videók száma a Drive-mappából
// olvasandó (lásd lib/clipping.ts), nem a content_items-ekből.
const CLIENT_SELECT = `
  SELECT
    c.id, c.company_name, c.contact_name, c.phone, c.email, c.address, c.notes,
    c.lead_id, c.next_shoot_date, c.drive_folder_id,
    c.created_by, cu.name AS created_by_name,
    op.completed_at AS onboarding_completed_at, op.monthly_video_target, op.monthly_post_target,
    COALESCE(op.service_clipping, false) AS service_clipping,
    COALESCE(op.service_short_videos, false) AS service_short_videos,
    COALESCE(op.service_image_posts, false) AS service_image_posts,
    COALESCE(op.service_website_build, false) AS service_website_build,
    COALESCE(op.service_landing_page, false) AS service_landing_page,
    c.status, c.client_type,
    dr.requested_by AS deletion_requested_by, du.name AS deletion_requested_by_name,
    c.created_at, c.updated_at
  FROM clients c
  LEFT JOIN users cu ON cu.id = c.created_by
  LEFT JOIN client_onboarding_profiles op ON op.client_id = c.id
  LEFT JOIN client_deletion_requests dr ON dr.client_id = c.id
  LEFT JOIN users du ON du.id = dr.requested_by
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
  clientType?: ClientType;
  createdBy: number;
}

export async function createClient(input: CreateClientInput): Promise<ClientRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (company_name, contact_name, phone, email, address, notes, client_type, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      input.companyName,
      input.contactName ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
      input.clientType ?? null,
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
  clientType?: ClientType;
}

export async function updateClientDetails(
  id: number,
  input: UpdateClientDetailsInput
): Promise<ClientRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE clients SET
       company_name = $2, contact_name = $3, phone = $4, email = $5, address = $6, notes = $7,
       client_type = $8,
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
      input.clientType ?? null,
    ]
  );
  if (!rowCount) return undefined;
  return getClientById(id);
}

export async function updateClientStatus(id: number, status: ClientStatus): Promise<ClientRow | undefined> {
  const { rowCount } = await pool.query(`UPDATE clients SET status = $2, updated_at = now() WHERE id = $1`, [
    id,
    status,
  ]);
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

// Admin-only tényleges törlés — ha volt hozzá törlési kérelem (a
// client_deletion_requests sor a kliens törlésekor CASCADE-del úgyis
// eltűnik), a hozzá tartozó manual_tasks feladatot is eltakarítjuk, nehogy
// egy már nem létező ügyfélre mutató "törlési kérelem" feladat maradjon a
// Feladatok modulban.
export async function deleteClient(id: number): Promise<boolean> {
  const { rows } = await pool.query<{ manual_task_id: number | null }>(
    `SELECT manual_task_id FROM client_deletion_requests WHERE client_id = $1`,
    [id]
  );
  const manualTaskId = rows[0]?.manual_task_id ?? null;

  const { rowCount } = await pool.query(`DELETE FROM clients WHERE id = $1`, [id]);
  const deleted = (rowCount ?? 0) > 0;

  if (deleted && manualTaskId != null) {
    await deleteManualTask(manualTaskId);
  }
  return deleted;
}

export interface ClientDeletionRequest {
  clientId: number;
  requestedBy: number;
  manualTaskId: number | null;
  createdAt: string;
}

export async function getClientDeletionRequest(clientId: number): Promise<ClientDeletionRequest | undefined> {
  const { rows } = await pool.query<{
    client_id: number;
    requested_by: number;
    manual_task_id: number | null;
    created_at: string;
  }>(`SELECT client_id, requested_by, manual_task_id, created_at FROM client_deletion_requests WHERE client_id = $1`, [
    clientId,
  ]);
  const row = rows[0];
  if (!row) return undefined;
  return { clientId: row.client_id, requestedBy: row.requested_by, manualTaskId: row.manual_task_id, createdAt: row.created_at };
}

export async function createClientDeletionRequest(
  clientId: number,
  requestedBy: number,
  manualTaskId: number
): Promise<void> {
  await pool.query(
    `INSERT INTO client_deletion_requests (client_id, requested_by, manual_task_id) VALUES ($1, $2, $3)`,
    [clientId, requestedBy, manualTaskId]
  );
}

// Visszavonás (a kérelmező vagy admin által) — a hozzá tartozó
// emlékeztető feladatot is töröljük a Feladatok modulból.
export async function cancelClientDeletionRequest(clientId: number): Promise<boolean> {
  const existing = await getClientDeletionRequest(clientId);
  if (!existing) return false;
  await pool.query(`DELETE FROM client_deletion_requests WHERE client_id = $1`, [clientId]);
  if (existing.manualTaskId != null) {
    await deleteManualTask(existing.manualTaskId);
  }
  return true;
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
