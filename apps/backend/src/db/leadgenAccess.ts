import { pool } from "./pool.js";

export async function hasLeadGenAccess(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM leadgen_access WHERE user_id = $1`, [userId]);
  return (rowCount ?? 0) > 0;
}

export async function grantLeadGenAccess(userId: number, grantedBy: number): Promise<void> {
  await pool.query(
    `INSERT INTO leadgen_access (user_id, granted_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [userId, grantedBy]
  );
}

export async function revokeLeadGenAccess(userId: number): Promise<void> {
  await pool.query(`DELETE FROM leadgen_access WHERE user_id = $1`, [userId]);
}
