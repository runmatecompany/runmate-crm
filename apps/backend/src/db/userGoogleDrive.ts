import { pool } from "./pool.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";

export interface UserGoogleDriveConnection {
  connectedEmail: string;
  refreshToken: string;
  connectedAt: string;
}

interface ConnectionRow {
  connected_email: string;
  refresh_token_enc: string;
  connected_at: string;
}

export async function getUserDriveConnection(userId: number): Promise<UserGoogleDriveConnection | null> {
  const { rows } = await pool.query<ConnectionRow>(
    `SELECT connected_email, refresh_token_enc, connected_at
     FROM user_google_drive_connections WHERE user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    connectedEmail: row.connected_email,
    refreshToken: decryptSecret(row.refresh_token_enc),
    connectedAt: row.connected_at,
  };
}

// Csak a Beállítások képernyőn megjeleníthető adatokat adja vissza — a
// frissítő tokent (még titkosítva sem) sosem küldjük ki a kliensnek.
export async function getUserDriveConnectionStatus(
  userId: number
): Promise<{ connected: boolean; connectedEmail: string | null }> {
  const { rows } = await pool.query<{ connected_email: string }>(
    `SELECT connected_email FROM user_google_drive_connections WHERE user_id = $1`,
    [userId]
  );
  return { connected: !!rows[0], connectedEmail: rows[0]?.connected_email ?? null };
}

export async function saveUserDriveConnection(
  userId: number,
  connectedEmail: string,
  refreshToken: string
): Promise<void> {
  await pool.query(
    `INSERT INTO user_google_drive_connections (user_id, connected_email, refresh_token_enc)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       connected_email = EXCLUDED.connected_email,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       connected_at = now()`,
    [userId, connectedEmail, encryptSecret(refreshToken)]
  );
}

export async function disconnectUserDrive(userId: number): Promise<void> {
  await pool.query(`DELETE FROM user_google_drive_connections WHERE user_id = $1`, [userId]);
}

export async function getFolderGrant(
  userId: number,
  clientId: number
): Promise<{ drivePermissionId: string } | null> {
  const { rows } = await pool.query<{ drive_permission_id: string }>(
    `SELECT drive_permission_id FROM user_drive_folder_grants WHERE user_id = $1 AND client_id = $2`,
    [userId, clientId]
  );
  return rows[0] ? { drivePermissionId: rows[0].drive_permission_id } : null;
}

export async function recordFolderGrant(userId: number, clientId: number, drivePermissionId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_drive_folder_grants (user_id, client_id, drive_permission_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, client_id) DO UPDATE SET drive_permission_id = EXCLUDED.drive_permission_id`,
    [userId, clientId, drivePermissionId]
  );
}

export async function deleteFolderGrant(userId: number, clientId: number): Promise<void> {
  await pool.query(`DELETE FROM user_drive_folder_grants WHERE user_id = $1 AND client_id = $2`, [userId, clientId]);
}

export async function listFolderGrantsForUser(
  userId: number
): Promise<{ clientId: number; drivePermissionId: string }[]> {
  const { rows } = await pool.query<{ client_id: number; drive_permission_id: string }>(
    `SELECT client_id, drive_permission_id FROM user_drive_folder_grants WHERE user_id = $1`,
    [userId]
  );
  return rows.map((r) => ({ clientId: r.client_id, drivePermissionId: r.drive_permission_id }));
}
