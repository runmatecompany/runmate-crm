import { pool } from "./pool.js";

// A havi (ÉÉÉÉ-HH nevű) Drive-almappák cache-e, hogy ne kelljen minden
// feltöltéskor újra lekérdezni a Drive-ot, hogy létezik-e már az adott hónap.
export async function getCachedMonthFolder(clientId: number, yearMonth: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ drive_folder_id: string }>(
    `SELECT drive_folder_id FROM content_upload_folders WHERE client_id = $1 AND year_month = $2`,
    [clientId, yearMonth]
  );
  return rows[0]?.drive_folder_id;
}

export async function recordMonthFolder(clientId: number, yearMonth: string, driveFolderId: string): Promise<void> {
  await pool.query(
    `INSERT INTO content_upload_folders (client_id, year_month, drive_folder_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (client_id, year_month) DO NOTHING`,
    [clientId, yearMonth, driveFolderId]
  );
}
