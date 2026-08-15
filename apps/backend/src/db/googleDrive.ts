import { pool } from "./pool.js";

export type VideoSubfolderKind = "raw" | "edited";

// A havi (ÉÉÉÉ-HH nevű) Drive-almappák cache-e, hogy ne kelljen minden
// feltöltéskor/napi provisioning-futáskor újra lekérdezni a Drive-ot, hogy
// létezik-e már az adott hónap mappája.
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

// A hónap-mappán belüli "Videók/Nyersek" és "Videók/Megvágva" almappák
// szintén lusta létrehozásúak (csak az első tényleges feltöltéskor jönnek
// létre) és ugyanezen a soron gyorsítótárazottak.
export async function getCachedVideoSubfolder(
  clientId: number,
  yearMonth: string,
  kind: VideoSubfolderKind
): Promise<string | undefined> {
  const column = kind === "raw" ? "raw_folder_id" : "edited_folder_id";
  const { rows } = await pool.query<{ folder_id: string | null }>(
    `SELECT ${column} AS folder_id FROM content_upload_folders WHERE client_id = $1 AND year_month = $2`,
    [clientId, yearMonth]
  );
  return rows[0]?.folder_id ?? undefined;
}

// Feltételezi, hogy a (client_id, year_month) sor már létezik — a hívó
// (ensureVideoSubfolder) mindig előbb ensureMonthFolder-t hív, ami ezt
// biztosítja.
export async function recordVideoSubfolder(
  clientId: number,
  yearMonth: string,
  kind: VideoSubfolderKind,
  folderId: string
): Promise<void> {
  const column = kind === "raw" ? "raw_folder_id" : "edited_folder_id";
  await pool.query(`UPDATE content_upload_folders SET ${column} = $3 WHERE client_id = $1 AND year_month = $2`, [
    clientId,
    yearMonth,
    folderId,
  ]);
}
