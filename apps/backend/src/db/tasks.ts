import { pool } from "./pool.js";

export async function hasTasksAccess(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM tasks_access WHERE user_id = $1`, [userId]);
  return (rowCount ?? 0) > 0;
}

export async function grantTasksAccess(userId: number, grantedBy: number): Promise<void> {
  await pool.query(`INSERT INTO tasks_access (user_id, granted_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [
    userId,
    grantedBy,
  ]);
}

export async function revokeTasksAccess(userId: number): Promise<void> {
  await pool.query(`DELETE FROM tasks_access WHERE user_id = $1`, [userId]);
}

export interface ClientTaskSummaryRow {
  client_id: number;
  client_name: string;
  monthly_video_target: number | null;
  monthly_post_target: number | null;
}

// A "kész ebben a hónapban" számot a frontend számolja a /content-items
// listából (published_at szerint szűrve) — itt csak az ügyfél + célszámok
// jönnek, hogy ne kelljen duplikálni a "melyik hónap" logikát backend- és
// frontend-oldalon is.
export async function listClientTaskSummaries(): Promise<ClientTaskSummaryRow[]> {
  const { rows } = await pool.query<ClientTaskSummaryRow>(
    `SELECT c.id AS client_id, c.company_name AS client_name,
            ap.monthly_video_target, ap.monthly_post_target
     FROM clients c
     LEFT JOIN client_ai_profiles ap ON ap.client_id = c.id
     ORDER BY c.company_name ASC`
  );
  return rows;
}
