import { pool } from "./pool.js";

// Havonta legfeljebb egyszer generálódjon a Clippelés-köteg egy ügyfélnek —
// ez a tábla jelzi, hogy egy adott (client_id, year_month) párra már
// megtörtént a létrehozás.
export async function hasClippingBatch(clientId: number, yearMonth: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM clipping_batches WHERE client_id = $1 AND year_month = $2`,
    [clientId, yearMonth]
  );
  return (rowCount ?? 0) > 0;
}

export async function markClippingBatch(clientId: number, yearMonth: string): Promise<void> {
  await pool.query(
    `INSERT INTO clipping_batches (client_id, year_month) VALUES ($1, $2) ON CONFLICT (client_id, year_month) DO NOTHING`,
    [clientId, yearMonth]
  );
}
