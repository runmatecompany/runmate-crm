import { pool } from "./pool.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";

export interface GoogleCalendarConnection {
  connectedEmail: string;
  refreshToken: string;
  syncToken: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
}

interface ConnectionRow {
  connected_email: string | null;
  refresh_token_enc: string | null;
  sync_token: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
}

export async function getConnection(): Promise<GoogleCalendarConnection | null> {
  const { rows } = await pool.query<ConnectionRow>(
    `SELECT connected_email, refresh_token_enc, sync_token, connected_at, last_synced_at
     FROM google_calendar_connection WHERE id = 1`
  );
  const row = rows[0];
  if (!row?.connected_email || !row.refresh_token_enc) return null;
  return {
    connectedEmail: row.connected_email,
    refreshToken: decryptSecret(row.refresh_token_enc),
    syncToken: row.sync_token,
    connectedAt: row.connected_at!,
    lastSyncedAt: row.last_synced_at,
  };
}

// Csak azt adja vissza, ami a Beállítások képernyőn megjeleníthető — a
// frissítő tokent (még titkosítva sem) sosem küldjük ki a kliensnek.
export async function getConnectionStatus(): Promise<{ connected: boolean; connectedEmail: string | null; lastSyncedAt: string | null }> {
  const { rows } = await pool.query<Pick<ConnectionRow, "connected_email" | "last_synced_at">>(
    `SELECT connected_email, last_synced_at FROM google_calendar_connection WHERE id = 1`
  );
  const row = rows[0];
  return {
    connected: !!row?.connected_email,
    connectedEmail: row?.connected_email ?? null,
    lastSyncedAt: row?.last_synced_at ?? null,
  };
}

export async function saveConnection(input: { connectedEmail: string; refreshToken: string }): Promise<void> {
  await pool.query(
    `UPDATE google_calendar_connection
     SET connected_email = $1, refresh_token_enc = $2, sync_token = NULL, connected_at = now(), last_synced_at = NULL
     WHERE id = 1`,
    [input.connectedEmail, encryptSecret(input.refreshToken)]
  );
}

export async function disconnectCalendar(): Promise<void> {
  await pool.query(
    `UPDATE google_calendar_connection
     SET connected_email = NULL, refresh_token_enc = NULL, sync_token = NULL, connected_at = NULL, last_synced_at = NULL
     WHERE id = 1`
  );
}

export async function updateSyncToken(syncToken: string | null): Promise<void> {
  await pool.query(`UPDATE google_calendar_connection SET sync_token = $1, last_synced_at = now() WHERE id = 1`, [
    syncToken,
  ]);
}

export async function hasProcessedEvent(googleEventId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM calendar_shoot_events WHERE google_event_id = $1`, [
    googleEventId,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function recordProcessedEvent(input: {
  googleEventId: string;
  clientId: number;
  eventStart: Date;
}): Promise<void> {
  await pool.query(
    `INSERT INTO calendar_shoot_events (google_event_id, client_id, event_start)
     VALUES ($1, $2, $3)
     ON CONFLICT (google_event_id) DO NOTHING`,
    [input.googleEventId, input.clientId, input.eventStart]
  );
}
