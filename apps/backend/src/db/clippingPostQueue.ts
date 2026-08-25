import { pool } from "./pool.js";

export interface ClippingPostQueueRow {
  id: number;
  client_id: number;
  client_name: string;
  year_month: string;
  clip_count: number;
  folder_id: string;
  created_at: string;
}

const SELECT = `
  SELECT q.id, q.client_id, cl.company_name AS client_name, q.year_month, q.clip_count, q.folder_id, q.created_at
  FROM clipping_post_queue q
  JOIN clients cl ON cl.id = q.client_id
`;

export async function listClippingPostQueue(): Promise<ClippingPostQueueRow[]> {
  const { rows } = await pool.query<ClippingPostQueueRow>(`${SELECT} ORDER BY q.created_at ASC`);
  return rows;
}

export async function isClippingInPostQueue(clientId: number, yearMonth: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM clipping_post_queue WHERE client_id = $1 AND year_month = $2`,
    [clientId, yearMonth]
  );
  return (rowCount ?? 0) > 0;
}

// ON CONFLICT DO NOTHING teszi idempotenssé az ismételt "Küldés
// posztolásra" kattintást — a visszaadott boolean jelzi, hogy tényleg
// most került-e be (false, ha már ott volt).
export async function addToClippingPostQueue(
  clientId: number,
  yearMonth: string,
  clipCount: number,
  folderId: string
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO clipping_post_queue (client_id, year_month, clip_count, folder_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (client_id, year_month) DO NOTHING`,
    [clientId, yearMonth, clipCount, folderId]
  );
  return (rowCount ?? 0) > 0;
}

export async function removeClippingPostQueueEntry(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM clipping_post_queue WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
